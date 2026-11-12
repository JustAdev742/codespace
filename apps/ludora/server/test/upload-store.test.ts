import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { uploadFiles, uploads } from '../src/db/schema.ts';
import { cliChangeRole } from '../src/cli/admin.ts';
import { readWav, sniffWav, writeWav } from '../src/modules/uploads/audio.ts';

/*
 * Sound clips and the second place to keep uploads (UPLOAD_STORE=db): clips are checked from
 * their own bytes and rewritten without metadata; in the database each file has a cap and each
 * account an allowance; files are served from the same addresses; only the owner lists and
 * deletes their uploads; hidden uploads are not served.
 */

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAF0lEQVR4AWL6v0Hhv7XSsv8gmokBCQAAAAD//x3OmzEAAAAGSURBVAMAlBkHo5cp4fcAAAAASUVORK5CYII=', 'base64');
const SECRET = 'Recorded by Jamie Smith at 12 Park Road';

/** A mono 16-bit WAV of `seconds` of a quiet tone, optionally with a LIST chunk carrying a name. */
function wav(seconds: number, opts: { rate?: number; channels?: number; bits?: number; list?: boolean } = {}): Buffer {
  const rate = opts.rate ?? 16000;
  const channels = opts.channels ?? 1;
  const bits = opts.bits ?? 16;
  const frames = Math.round(seconds * rate);
  const data = Buffer.alloc(frames * channels * (bits / 8));
  if (bits === 16) for (let i = 0; i < frames * channels; i++) data.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), i * 2);
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0, 'latin1');
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(rate, 12);
  fmt.writeUInt32LE(rate * channels * (bits / 8), 16);
  fmt.writeUInt16LE(channels * (bits / 8), 20);
  fmt.writeUInt16LE(bits, 22);
  const parts = [fmt];
  if (opts.list) {
    const text = Buffer.from(`INFOIART${SECRET}`, 'latin1');
    const head = Buffer.alloc(8);
    head.write('LIST', 0, 'latin1');
    head.writeUInt32LE(text.length, 4);
    parts.push(head, text, text.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0));
  }
  const dataHead = Buffer.alloc(8);
  dataHead.write('data', 0, 'latin1');
  dataHead.writeUInt32LE(data.length, 4);
  parts.push(dataHead, data);
  const body = Buffer.concat(parts);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'latin1');
  riff.writeUInt32LE(body.length + 4, 4);
  riff.write('WAVE', 8, 'latin1');
  return Buffer.concat([riff, body]);
}

function form(filename: string, type: string, data: Buffer) {
  const boundary = `ludora${Math.random().toString(16).slice(2)}`;
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`), data, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
const upload = (c: Client, filename: string, type: string, data: Buffer) => {
  const f = form(filename, type, data);
  return c.request('POST', '/api/uploads', f.body, f.headers);
};

describe('sound clip checks', () => {
  it('reads the format from the bytes and rewrites the file with only the format and samples', () => {
    const dirty = wav(1, { list: true });
    expect(sniffWav(dirty)).toBe(true);
    expect(dirty.includes(SECRET)).toBe(true);
    const info = readWav(dirty);
    expect(info.sampleRate).toBe(16000);
    expect(info.seconds).toBeCloseTo(1, 5);
    const clean = writeWav(info);
    expect(clean.includes(SECRET)).toBe(false);
    expect(clean.length).toBe(44 + 32000);
    expect(readWav(clean).data.equals(info.data)).toBe(true);
  });

  it('refuses anything but 16-bit mono PCM at a usual rate', () => {
    expect(() => readWav(wav(1, { channels: 2 }))).toThrow(/editor/);
    expect(() => readWav(wav(1, { bits: 8 }))).toThrow(/editor/);
    expect(() => readWav(wav(1, { rate: 4000 }))).toThrow(/sample rate/);
    expect(() => readWav(Buffer.from('RIFF\0\0\0\0WAVEjunk'))).toThrow(/damaged/);
    expect(sniffWav(Buffer.from('ID3\x03\0\0\0'))).toBe(false);
  });
});

describe('uploads kept in the database', () => {
  let t: TestContext;
  let dir: string;
  let author: Awaited<ReturnType<typeof registered>>;
  let other: Awaited<ReturnType<typeof registered>>;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ludora-dbstore-'));
    // A small allowance and cap so the limits are reached with small test files.
    t = await createTestApp({ UPLOAD_DIR: dir, UPLOAD_STORE: 'db', UPLOAD_DB_ACCOUNT_BYTES: '200000', UPLOAD_DB_FILE_BYTES: '120000' });
    author = await registered(t.app);
    other = await registered(t.app);
  });
  afterAll(async () => {
    await t?.close();
  });

  it('keeps a clip in the database and serves it, cleaned, from its address with caching', async () => {
    const res = await upload(author.client, 'voice.wav', 'audio/wav', wav(2, { list: true }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\/[a-f0-9]{32}\.wav$/);
    expect(res.body.seconds).toBe(2);
    const id = (res.body.url as string).slice(9, 41);
    const [stored] = await t.db.select().from(uploadFiles).where(eq(uploadFiles.uploadId, id));
    expect(stored?.data.includes(SECRET)).toBe(false);
    const file = await t.app.inject({ method: 'GET', url: res.body.url });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('audio/wav');
    expect(String(file.headers['cache-control'])).toContain('max-age=86400');
    expect(String(file.headers['content-security-policy'])).toContain('sandbox');
    expect(file.rawPayload.includes(SECRET)).toBe(false);
    const again = await t.app.inject({ method: 'GET', url: res.body.url, headers: { 'if-none-match': String(file.headers.etag) } });
    expect(again.statusCode).toBe(304);
    // The same id under another file type is not served.
    expect((await t.app.inject({ method: 'GET', url: `/uploads/${id}.png` })).statusCode).toBe(404);
  });

  it('refuses the wrong type whatever it is called, a clip that is too long, and a file over the cap', async () => {
    expect((await upload(author.client, 'a.wav', 'audio/wav', Buffer.from('ID3\x03\0\0\0 not a wav at all'))).status).toBe(415);
    expect((await upload(author.client, 'a.wav', 'audio/wav', Buffer.from('<html><script>alert(1)</script></html>'))).status).toBe(415);
    expect((await upload(author.client, 'stereo.wav', 'audio/wav', wav(1, { channels: 2 }))).status).toBe(415);
    const long = await upload(author.client, 'long.wav', 'audio/wav', wav(21, { rate: 8000 }));
    expect(long.status).toBe(400);
    expect(long.body.error.message).toMatch(/20 seconds/);
    const big = await upload(author.client, 'big.wav', 'audio/wav', wav(4));
    expect(big.status).toBe(413);
    expect(big.body.error.message).toMatch(/up to 0\.1 MB/);
  });

  it('stops at the account’s allowance', async () => {
    const fresh = await registered(t.app);
    const sizes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await upload(fresh.client, 'c.wav', 'audio/wav', wav(3.5));
      sizes.push(r.status);
    }
    // 112 KB each against a 200 KB allowance: the first fits, the second would not.
    expect(sizes).toEqual([200, 409, 409]);
    const list = await fresh.client.get('/api/uploads');
    expect(list.body).toMatchObject({ store: 'db', allowance: 200000, fileCap: 120000 });
    expect(list.body.used).toBe(112044);
  });

  it('lists only my own uploads, and another account cannot delete them', async () => {
    const pic = await upload(author.client, 'p.png', 'image/png', PNG);
    expect(pic.status).toBe(200);
    const id = (pic.body.url as string).slice(9, 41);
    const mine = await author.client.get('/api/uploads');
    expect(mine.body.uploads.map((u: { id: string }) => u.id)).toContain(id);
    expect(mine.body.uploads.find((u: { id: string }) => u.id === id)).toMatchObject({ kind: 'image', url: pic.body.url, hidden: false });
    const theirs = await other.client.get('/api/uploads');
    expect(theirs.body.uploads.map((u: { id: string }) => u.id)).not.toContain(id);
    expect((await other.client.delete(`/api/uploads/${id}`)).status).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: pic.body.url })).statusCode).toBe(200);
    expect((await new Client(t.app).get('/api/uploads')).status).toBe(401);
    expect((await author.client.delete(`/api/uploads/${id}`)).status).toBe(200);
    expect((await t.app.inject({ method: 'GET', url: pic.body.url })).statusCode).toBe(404);
    expect(await t.db.select().from(uploadFiles).where(eq(uploadFiles.uploadId, id))).toEqual([]);
  });

  it('does not serve a clip staff hid, and a set cannot use it', async () => {
    const clip = await upload(author.client, 'v.wav', 'audio/wav', wav(1));
    const id = (clip.body.url as string).slice(9, 41);
    const set = (url: string) =>
      author.client.post('/api/sets', {
        title: 'Listening',
        description: '',
        subject: 'languages',
        visibility: 'private',
        questions: [{ id: 'q1', type: 'truefalse', prompt: 'Is this a greeting?', correct: true, sound: { kind: 'clip', url, seconds: 1, caption: 'Someone says hello' } }],
      });
    expect((await set(clip.body.url)).status).toBe(200);
    const unknown = await set(`/uploads/${'b'.repeat(32)}.wav`);
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.fields).toHaveProperty(['questions.0.sound']);
    const mod = await registered(t.app);
    expect((await cliChangeRole(t.db, 'test', 'grant', mod.username, 'moderator', 'test setup')).ok).toBe(true);
    expect((await mod.client.post(`/api/admin/uploads/${id}/visibility`, { hidden: true, reason: 'A voice message, not a question' })).status).toBe(200);
    expect((await t.app.inject({ method: 'GET', url: clip.body.url })).statusCode).toBe(404);
    expect((await set(clip.body.url)).status).toBe(400);
    const listed = await author.client.get('/api/uploads');
    expect(listed.body.uploads.find((u: { id: string }) => u.id === id)).toMatchObject({ kind: 'sound', hidden: true });
  });

  it('keeps serving files that were saved on disk before the switch', async () => {
    const id = 'c'.repeat(32);
    writeFileSync(join(dir, `${id}.png`), PNG);
    await t.db.insert(uploads).values({ id, ownerId: author.userId, mime: 'image/png', bytes: PNG.length, width: 3, height: 2, sha256: 'x'.repeat(64) });
    const file = await t.app.inject({ method: 'GET', url: `/uploads/${id}.png` });
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.equals(PNG)).toBe(true);
  });
});

describe('sound clips on disk', () => {
  let t: TestContext;
  beforeAll(async () => {
    t = await createTestApp({ UPLOAD_DIR: mkdtempSync(join(tmpdir(), 'ludora-diskclip-')) });
  });
  afterAll(async () => {
    await t?.close();
  });

  it('accepts a clip from an account that makes sets, never a guest, and serves it from disk', async () => {
    const guest = new Client(t.app);
    await guest.post('/api/auth/guest', {});
    expect((await upload(guest, 'v.wav', 'audio/wav', wav(1))).status).toBe(403);
    const a = await registered(t.app);
    const res = await upload(a.client, 'v.wav', 'audio/wav', wav(1, { list: true }));
    expect(res.status).toBe(200);
    const id = (res.body.url as string).slice(9, 41);
    expect(await t.db.select().from(uploadFiles).where(eq(uploadFiles.uploadId, id))).toEqual([]);
    const file = await t.app.inject({ method: 'GET', url: res.body.url });
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.includes(SECRET)).toBe(false);
    const list = await a.client.get('/api/uploads');
    expect(list.body).toMatchObject({ store: 'disk', allowance: null, used: 0 });
  });
});
