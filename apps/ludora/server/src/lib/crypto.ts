import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** IPs are only ever stored hashed with a server key, for abuse checks and audit trails. */
export function hashIp(ip: string | undefined, key: string): string | null {
  if (!ip) return null;
  return createHmac('sha256', key).update(ip).digest('hex').slice(0, 32);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Crypto-random code from an alphabet. */
export function randomCode(alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** Letters and digits that cannot be confused with each other (no 0/O, 1/I/L). */
export const CLEAR_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function friendCode(): string {
  return `${randomCode(CLEAR_ALPHABET, 4)}-${randomCode(CLEAR_ALPHABET, 4)}`;
}

export function recoveryCode(): string {
  return [0, 1, 2, 3].map(() => randomCode(CLEAR_ALPHABET, 4)).join('-');
}

export function roomCode(): string {
  return String(randomInt(100000, 1000000));
}

/** Crypto-random float in [0, 1) for server-side reward rolls (48 bits of randomness). */
export function secureRandom(): number {
  return randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}
