import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/*
 * The AI review's API key, when a super administrator saves it on the staff AI page instead of in
 * ANTHROPIC_API_KEY. It is kept encrypted with AES-256-GCM under a key derived from this server's
 * IP_HASH_KEY (which production already requires to be a long random value), so a copy of the
 * database alone does not give the key away. It is never sent back to anyone: staff see only a hint.
 */

const INFO = 'ludora/ai-review-api-key/v1';

function keyFrom(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), INFO, 32));
}

/** "v1.<iv>.<tag>.<ciphertext>", each part base64url. */
export function sealKey(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/** The key, or null when it cannot be opened (the server's secret changed, or the value was altered). */
export function openKey(sealed: string, secret: string): string | null {
  const [v, iv, tag, body] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** What staff see of a key: its last four characters. */
export function keyHint(key: string): string {
  return `…${key.slice(-4)}`;
}
