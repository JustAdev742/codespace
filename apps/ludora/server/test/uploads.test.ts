import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { auditLog } from '../src/db/schema.ts';
import { cliChangeRole } from '../src/cli/admin.ts';
import { imageSize, sniffImage, stripMetadata } from '../src/modules/uploads/images.ts';

/*
 * Question image uploads: format checks from the file's own bytes, dimension
 * limits, metadata removal, serving, staff hiding, and sets only pointing at
 * real uploads. The fixtures are 3 x 2 images drawn and exported by Chromium.
 */

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAF0lEQVR4AWL6v0Hhv7XSsv8gmokBCQAAAAD//x3OmzEAAAAGSURBVAMAlBkHo5cp4fcAAAAASUVORK5CYII=', 'base64');
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAaEAEAAQUAAAAAAAAAAAAAAAAABAUHNnW1/8QAFAEBAAAAAAAAAAAAAAAAAAAACP/EAB4RAAAEBwAAAAAAAAAAAAAAAAABAgQFMzVxc7Gy/9oADAMBAAIRAxEAPwC021x2Zuat0JAAaxmpusi+jCAbSEWLQ//Z', 'base64');
const WEBP = Buffer.from('UklGRkICAABXRUJQVlA4WAoAAAAgAAAAAgAAAQAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggVAAAAPACAJ0BKgMAAgAAwBIlqAJ0ugH4AfqAzgDJAAWbWXUQAP7rxyLP/nMf/1Um2j/9Ob/1YtS5sbk2KRn/axalzY3/91Ff/e2ku/djH8oHH//wgQAAAA==', 'base64');
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const SECRET = 'GPS 51.5007 -0.1246 Home';

/** A JPEG with an EXIF segment (holding a fake location) right after the start marker. */
function jpegWithExif(): Buffer {
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from(SECRET, 'latin1')]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2);
  return Buffer.concat([JPEG.subarray(0, 2), Buffer.from([0xff, 0xe1]), len, payload, JPEG.subarray(2)]);
}

/** A PNG with a text chunk after the header (the CRC is not checked by the stripper). */
function pngWithText(): Buffer {
  const data = Buffer.from(`Comment\0${SECRET}`, 'latin1');
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write('tEXt', 4, 'latin1');
  const ihdrEnd = 8 + 12 + 13;
  return Buffer.concat([PNG.subarray(0, ihdrEnd), head, data, Buffer.alloc(4), PNG.subarray(ihdrEnd)]);
}

/** A WebP with an EXIF chunk appended and the EXIF flag set in its extended header. */
function webpWithExif(): Buffer {
  const data = Buffer.from(SECRET, 'latin1');
  const chunk = Buffer.alloc(8);
  chunk.write('EXIF', 0, 'latin1');
  chunk.writeUInt32LE(data.length, 4);
  const out = Buffer.concat([WEBP, chunk, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  out.writeUInt32LE(out.length - 8, 4);
  out[20] = out[20]! | 0x08;
  return out;
}

function pngOfSize(width: number, height: number): Buffer {
  const b = Buffer.from(PNG);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function form(filename: string, type: string, data: Buffer) {
  const boundary = `ludora${Math.random().toString(16).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;
let author: Account;
const upload = (c: Client, filename: string, type: string, data: Buffer) => {
  const f = form(filename, type, data);
  return c.request('POST', '/api/uploads', f.body, f.headers);
};

beforeAll(async () => {
  t = await createTestApp({ UPLOAD_DIR: mkdtempSync(join(tmpdir(), 'ludora-uploads-')) });
  author = await registered(t.app);
});
afterAll(async () => {
  await t?.close();
});

describe('image checks', () => {
  it('tells formats apart by their bytes and reads their size', () => {
    expect([PNG, JPEG, WEBP, GIF].map(sniffImage)).toEqual(['png', 'jpeg', 'webp', 'gif']);
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('<!doctype html><script>alert(1)</script>'))).toBeNull();
    expect(imageSize(PNG, 'png')).toEqual({ width: 3, height: 2 });
    expect(imageSize(JPEG, 'jpeg')).toEqual({ width: 3, height: 2 });
    expect(imageSize(WEBP, 'webp')).toEqual({ width: 3, height: 2 });
    expect(imageSize(GIF, 'gif')).toEqual({ width: 1, height: 1 });
    // Simple lossy and lossless WebP headers, as other encoders write them.
    const vp8 = Buffer.alloc(30);
    vp8.write('RIFF', 0, 'latin1'); vp8.write('WEBPVP8 ', 8, 'latin1');
    vp8.writeUInt16LE(640, 26); vp8.writeUInt16LE(480, 28);
    expect(imageSize(vp8, 'webp')).toEqual({ width: 640, height: 480 });
    const vp8l = Buffer.alloc(25);
    vp8l.write('RIFF', 0, 'latin1'); vp8l.write('WEBPVP8L', 8, 'latin1');
    vp8l.writeUInt32LE((99 & 0x3fff) | ((49 & 0x3fff) << 14), 21);
    expect(imageSize(vp8l, 'webp')).toEqual({ width: 100, height: 50 });
  });

  it('removes location and other metadata, and keeps the picture', () => {
    for (const [kind, dirty] of [['jpeg', jpegWithExif()], ['png', pngWithText()], ['webp', webpWithExif()]] as const) {
      expect(dirty.includes(SECRET), kind).toBe(true);
      const clean = stripMetadata(dirty, kind);
      expect(clean.includes(SECRET), kind).toBe(false);
      expect(sniffImage(clean), kind).toBe(kind);
      expect(imageSize(clean, kind), kind).toEqual({ width: 3, height: 2 });
    }
    // Images without metadata come through byte for byte.
    expect(stripMetadata(PNG, 'png').equals(PNG)).toBe(true);
    expect(stripMetadata(JPEG, 'jpeg').equals(JPEG)).toBe(true);
    const webp = stripMetadata(webpWithExif(), 'webp');
    expect(webp[20]! & 0x08).toBe(0);
    expect(webp.readUInt32LE(4)).toBe(webp.length - 8);
  });
});

describe('uploads', () => {
  it('accepts images from accounts that make sets, never from guests', async () => {
    expect((await upload(new Client(t.app), 'a.png', 'image/png', PNG)).status).toBe(401);
    const guest = new Client(t.app);
    await guest.post('/api/auth/guest', {});
    expect((await upload(guest, 'a.png', 'image/png', PNG)).status).toBe(403);
    const ok = await upload(author.client, 'a.png', 'image/png', PNG);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ width: 3, height: 2 });
    expect(ok.body.url).toMatch(/^\/uploads\/[a-f0-9]{32}\.png$/);
  });

  it('refuses files that are not images, whatever they are called, and oversized pictures', async () => {
    const svg = await upload(author.client, 'cat.png', 'image/png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'));
    expect(svg.status).toBe(415);
    const html = await upload(author.client, 'cat.jpg', 'image/jpeg', Buffer.from('<html><script>alert(1)</script></html>'));
    expect(html.status).toBe(415);
    const huge = await upload(author.client, 'big.png', 'image/png', pngOfSize(30000, 30000));
    expect(huge.status).toBe(400);
    expect(huge.body.error.message).toMatch(/4000 pixels/);
    const json = await author.client.post('/api/uploads', { not: 'a file' });
    expect(json.status).toBe(400);
  });

  it('serves the cleaned file with a strict content type and no metadata', async () => {
    const res = await upload(author.client, 'photo.jpg', 'image/jpeg', jpegWithExif());
    expect(res.status).toBe(200);
    const file = await t.app.inject({ method: 'GET', url: res.body.url });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(String(file.headers['content-security-policy'])).toContain('sandbox');
    expect(file.rawPayload.includes(SECRET)).toBe(false);
    expect(file.rawPayload.equals(stripMetadata(jpegWithExif(), 'jpeg'))).toBe(true);
    expect((await t.app.inject({ method: 'GET', url: '/uploads/../../etc/passwd' })).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: `/uploads/${'0'.repeat(32)}.png` })).statusCode).toBe(404);
  });

  it('sets may only use real, visible uploads, and staff can hide one', async () => {
    const img = (await upload(author.client, 'q.webp', 'image/webp', WEBP)).body.url as string;
    const question = (url: string) => ({ id: 'q1', type: 'truefalse', prompt: 'This is a Glim.', correct: true, media: { kind: 'image', url, alt: 'A small Glim' } });
    const make = (url: string) => author.client.post('/api/sets', { title: 'With a picture', description: 'Image test', subject: 'general', visibility: 'private', questions: [question(url), { id: 'q2', type: 'truefalse', prompt: 'Two', correct: true }, { id: 'q3', type: 'truefalse', prompt: 'Three', correct: false }] });
    const ok = await make(img);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const unknown = await make(`/uploads/${'a'.repeat(32)}.png`);
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.fields).toHaveProperty(['questions.0.media']);

    const mod = await registered(t.app);
    expect((await cliChangeRole(t.db, 'test', 'grant', mod.username, 'moderator', 'test setup')).ok).toBe(true);
    const id = img.slice('/uploads/'.length, img.lastIndexOf('.'));
    expect((await author.client.post(`/api/admin/uploads/${id}/visibility`, { hidden: true, reason: 'not mine to hide' })).status).toBe(403);
    expect((await mod.client.post(`/api/admin/uploads/${id}/visibility`, { hidden: true, reason: 'Personal photo of a student' })).status).toBe(200);
    expect((await t.app.inject({ method: 'GET', url: img })).statusCode).toBe(404);
    expect((await make(img)).status).toBe(400);
    const [entry] = await t.db.select().from(auditLog).where(eq(auditLog.targetId, id));
    expect(entry).toMatchObject({ action: 'upload.hide', targetType: 'upload', reason: 'Personal photo of a student' });
    expect((await mod.client.post(`/api/admin/uploads/${id}/visibility`, { hidden: false, reason: 'Checked, it is fine' })).status).toBe(200);
    expect((await t.app.inject({ method: 'GET', url: img })).statusCode).toBe(200);
  });
});
