/*
 * Image checks for uploads, without an image library: identify the format from
 * its first bytes (never from the name or the declared type), read the
 * dimensions from the header, and strip metadata such as GPS positions and
 * camera details, which phone photos often carry.
 */

export type ImageKind = 'png' | 'jpeg' | 'gif' | 'webp';

export const IMAGE_MIME: Record<ImageKind, string> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
export const IMAGE_EXT: Record<ImageKind, string> = { png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp' };

/** Browsers decode the whole bitmap, so a small file with huge dimensions could freeze every player's tab. */
export const MAX_IMAGE_SIDE = 4000;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function sniffImage(b: Buffer): ImageKind | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.toString('latin1', 0, 6))) return 'gif';
  if (b.length >= 16 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export function imageSize(b: Buffer, kind: ImageKind): { width: number; height: number } | null {
  switch (kind) {
    case 'png':
      // IHDR is always the first chunk.
      if (b.length < 24 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
      return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    case 'gif':
      return b.length >= 10 ? { width: b.readUInt16LE(6), height: b.readUInt16LE(8) } : null;
    case 'webp': {
      const chunk = b.toString('latin1', 12, 16);
      if (chunk === 'VP8 ' && b.length >= 30) return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L' && b.length >= 25) {
        const bits = b.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
      }
      if (chunk === 'VP8X' && b.length >= 30) return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
      return null;
    }
    case 'jpeg': {
      for (const seg of jpegSegments(b)) {
        // Start-of-frame markers carry the size (C4, C8 and CC are other tables).
        if (seg.marker >= 0xc0 && seg.marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(seg.marker) && seg.end - seg.start >= 9) {
          return { height: b.readUInt16BE(seg.start + 5), width: b.readUInt16BE(seg.start + 7) };
        }
      }
      return null;
    }
  }
}

interface Segment {
  marker: number;
  /** Offset of the 0xFF that starts the segment. */
  start: number;
  /** Offset just past the segment. */
  end: number;
}

/** The marker segments of a JPEG up to the start of scan; the compressed data follows. */
function* jpegSegments(b: Buffer): Generator<Segment> {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      yield { marker, start: i, end: i + 2 };
      i += 2;
      continue;
    }
    const end = i + 2 + b.readUInt16BE(i + 2);
    if (end > b.length) return;
    yield { marker, start: i, end };
    if (marker === 0xda || marker === 0xd9) return;
    i = end;
  }
}

/**
 * Removes metadata a player should not publish by accident: EXIF (GPS, camera,
 * dates), XMP, IPTC and comments in JPEG; eXIf and text chunks in PNG; EXIF and
 * XMP in WebP. Pixel data and colour profiles stay as they are.
 */
export function stripMetadata(b: Buffer, kind: ImageKind): Buffer {
  if (kind === 'jpeg') {
    const keep: Buffer[] = [b.subarray(0, 2)];
    let scanAt = -1;
    for (const seg of jpegSegments(b)) {
      if (seg.marker === 0xda) {
        scanAt = seg.start;
        break;
      }
      // APP1 (EXIF, XMP), APP13 (IPTC) and COM (comments) go; APP0 (JFIF) and APP2 (ICC colour) stay.
      if (seg.marker === 0xe1 || seg.marker === 0xed || seg.marker === 0xfe) continue;
      keep.push(b.subarray(seg.start, seg.end));
    }
    if (scanAt < 0) return b;
    keep.push(b.subarray(scanAt));
    return Buffer.concat(keep);
  }
  if (kind === 'png') {
    const drop = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);
    const keep: Buffer[] = [b.subarray(0, 8)];
    let i = 8;
    while (i + 12 <= b.length) {
      const len = b.readUInt32BE(i);
      const type = b.toString('latin1', i + 4, i + 8);
      const end = i + 12 + len;
      if (end > b.length) return b;
      if (!drop.has(type)) keep.push(b.subarray(i, end));
      i = end;
      if (type === 'IEND') break;
    }
    return Buffer.concat(keep);
  }
  if (kind === 'webp') {
    const keep: Buffer[] = [];
    let i = 12;
    let flagsAt = -1;
    while (i + 8 <= b.length) {
      const type = b.toString('latin1', i, i + 4);
      const len = b.readUInt32LE(i + 4);
      const end = i + 8 + len + (len % 2); // chunks are padded to an even length
      if (end > b.length) return b;
      if (type !== 'EXIF' && type !== 'XMP ') {
        if (type === 'VP8X') flagsAt = keep.reduce((n, c) => n + c.length, 12) + 8;
        keep.push(b.subarray(i, end));
      }
      i = end;
    }
    const body = Buffer.concat(keep);
    const header = Buffer.alloc(12);
    header.write('RIFF', 0, 'latin1');
    header.writeUInt32LE(body.length + 4, 4);
    header.write('WEBP', 8, 'latin1');
    const out = Buffer.concat([header, body]);
    // The extended header flags say which chunks exist: clear the EXIF (0x08) and XMP (0x04) bits.
    if (flagsAt >= 0) out[flagsAt] = out[flagsAt]! & ~0x0c;
    return out;
  }
  return b;
}
