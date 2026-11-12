/*
 * Sound clip checks, without an audio library. The editor decodes whatever the author recorded or
 * chose, and sends it as a plain WAV file: 16-bit PCM, one channel. The server accepts only that,
 * decided from the file's own bytes (never its name or declared type), checks its length, and
 * writes a fresh file holding just the format and the samples, so no metadata (names, dates,
 * software, locations in LIST or other chunks) is kept and nothing in it can run.
 */

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** The samples, without any header. */
  data: Buffer;
  seconds: number;
}

export const AUDIO_MIME = 'audio/wav';
/** Sample rates a clip may use: from telephone quality to CD. The editor sends 22,050 Hz. */
export const WAV_RATES = { min: 8000, max: 48000 } as const;

/** Whether the bytes start like a WAV file at all. */
export function sniffWav(b: Buffer): boolean {
  return b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE';
}

/** Why a WAV file was refused, in words for the person uploading it. */
export class WavError extends Error {}

/** Reads a WAV file's format and samples, refusing anything but uncompressed 16-bit mono PCM. */
export function readWav(b: Buffer): WavInfo {
  if (!sniffWav(b)) throw new WavError('Use a sound recorded or chosen in the editor.');
  let fmt: { format: number; channels: number; sampleRate: number; bitsPerSample: number; blockAlign: number } | null = null;
  let data: Buffer | null = null;
  let i = 12;
  while (i + 8 <= b.length) {
    const id = b.toString('latin1', i, i + 4);
    const len = b.readUInt32LE(i + 4);
    const start = i + 8;
    const end = start + len;
    if (end > b.length) {
      // Some recorders write a data length larger than the file; take what is there, whole samples only.
      if (id === 'data') data = b.subarray(start, b.length - ((b.length - start) % 2));
      break;
    }
    if (id === 'fmt ' && len >= 16) {
      fmt = { format: b.readUInt16LE(start), channels: b.readUInt16LE(start + 2), sampleRate: b.readUInt32LE(start + 4), blockAlign: b.readUInt16LE(start + 12), bitsPerSample: b.readUInt16LE(start + 14) };
    } else if (id === 'data') {
      data = b.subarray(start, end);
    }
    i = end + (len % 2);
  }
  if (!fmt || !data) throw new WavError('That sound file looks damaged. Record or choose it again.');
  if (fmt.format !== 1 || fmt.bitsPerSample !== 16 || fmt.channels !== 1 || fmt.blockAlign !== 2) throw new WavError('Use a sound recorded or chosen in the editor: it is converted to the right kind of file for you.');
  if (fmt.sampleRate < WAV_RATES.min || fmt.sampleRate > WAV_RATES.max) throw new WavError('That sound uses an unusual sample rate. Record or choose it again in the editor.');
  if (data.length < 2) throw new WavError('That sound is empty.');
  const seconds = data.length / 2 / fmt.sampleRate;
  return { sampleRate: fmt.sampleRate, channels: 1, bitsPerSample: 16, data, seconds };
}

/** A fresh WAV file holding only the format and the samples. */
export function writeWav(info: Pick<WavInfo, 'sampleRate' | 'data'>): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(36 + info.data.length, 4);
  header.write('WAVE', 8, 'latin1');
  header.write('fmt ', 12, 'latin1');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(info.sampleRate, 24);
  header.writeUInt32LE(info.sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'latin1');
  header.writeUInt32LE(info.data.length, 40);
  return Buffer.concat([header, info.data]);
}
