import { z } from 'zod';

/**
 * Text rules for anything a player types that other people can see.
 * The same checks run in the browser (for instant feedback) and on the
 * server (where they actually count).
 */

/** Control characters, zero-width characters and bidi overrides used for spoofing. */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

export function cleanText(input: string): string {
  return input.normalize('NFKC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };

function squash(input: string): string {
  return cleanText(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0-9@$!|+]/g, (c) => LEET[c] ?? c);
}

/**
 * Words blocked anywhere inside a name, even when joined to other letters
 * or spelled with digits. Kept to terms with no innocent substrings.
 */
const BLOCK_ANYWHERE = [
  'fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fagg', 'whore', 'slut', 'rape', 'porn', 'dildo',
  'penis', 'vagina', 'pussy', 'wank', 'twat', 'bollock', 'asshole', 'arsehole', 'retard', 'nazi',
  'hitler', 'killyourself', 'pedo', 'molest', 'cock', 'boob', 'tits', 'horny', 'sexy', 'blowjob',
];
/** Words blocked only as whole words, because they appear inside innocent words. */
const BLOCK_WORD = ['ass', 'arse', 'sex', 'cum', 'fag', 'dick', 'hoe', 'piss', 'crap', 'damn', 'hell', 'nude', 'naked', 'kill', 'die', 'kys', 'spaz', 'tranny', 'chink', 'spic', 'kike', 'wop'];
/** Innocent words that contain a BLOCK_ANYWHERE term. */
const ALLOW_CONTAINING = [
  'cockatoo', 'cockatiel', 'peacock', 'hitchcock', 'shuttlecock', 'cockpit', 'cockroach', 'woodcock', 'hancock',
  'scrape', 'grape', 'drape', 'parapet', 'trapeze', 'skyscraper', 'shitake', 'shiitake', 'torpedo', 'pedometer',
  'scunthorpe', 'swank',
];

export function containsBlockedLanguage(input: string): boolean {
  const s = squash(input);
  let compact = s.replace(/[^a-z]/g, '');
  for (const ok of ALLOW_CONTAINING) compact = compact.split(ok).join('');
  if (BLOCK_ANYWHERE.some((w) => compact.includes(w))) return true;
  const words = s.split(/[^a-z]+/).filter(Boolean);
  return words.some((w) => BLOCK_WORD.includes(w));
}

export const USERNAME_RULES = 'Use 3 to 20 letters, numbers or underscores, starting with a letter.';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{2,19}$/, USERNAME_RULES)
  .refine((v) => !containsBlockedLanguage(v), 'Pick a different username.');

export const displayNameSchema = z
  .string()
  .transform(cleanText)
  .pipe(
    z
      .string()
      .min(2, 'Names need at least 2 characters.')
      .max(24, 'Names can be up to 24 characters.')
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} '._-]*$/u, 'Use letters, numbers, spaces and . _ - \' only.')
      .refine((v) => !containsBlockedLanguage(v), 'Pick a different name.'),
  );

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop',
  'iloveyou', 'abc12345', '11111111', '00000000', 'letmein1', 'welcome1', 'football', 'baseball', 'sunshine',
  'princess', 'dragon12', 'minecraft', 'fortnite', 'roblox123', 'ludora123', 'passw0rd', 'trustno1',
]);

export const PASSWORD_RULES = 'Use at least 8 characters. Longer is stronger.';

export const passwordSchema = z
  .string()
  .min(8, PASSWORD_RULES)
  .max(128, 'Passwords can be up to 128 characters.')
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), 'That password is too easy to guess.');

export const roomCodeSchema = z.string().regex(/^\d{6}$/, 'Room codes are 6 digits.');

/* ----------------------------- Name generator ----------------------------- */

export const NAME_ADJECTIVES = [
  'Sunny', 'Brave', 'Cosmic', 'Quiet', 'Swift', 'Clever', 'Bouncy', 'Lucky', 'Mellow', 'Zesty',
  'Gentle', 'Bold', 'Witty', 'Mighty', 'Nimble', 'Jolly', 'Starry', 'Misty', 'Golden', 'Rapid',
  'Sparkly', 'Fuzzy', 'Breezy', 'Plucky', 'Snowy', 'Stormy', 'Velvet', 'Amber', 'Coral', 'Minty',
  'Dapper', 'Peppy', 'Curious', 'Sleepy', 'Glowing', 'Electric', 'Rustic', 'Lunar', 'Solar', 'Frosty',
];
export const NAME_NOUNS = [
  'Lantern', 'Comet', 'Otter', 'Moth', 'Pebble', 'Fern', 'Maple', 'Nova', 'Puffin', 'Gecko',
  'Koala', 'Falcon', 'Badger', 'Panda', 'Walrus', 'Heron', 'Lynx', 'Marmot', 'Narwhal', 'Quokka',
  'Sparrow', 'Tapir', 'Wombat', 'Yak', 'Beetle', 'Cricket', 'Dolphin', 'Ember', 'Glacier', 'Harbor',
  'Island', 'Jasper', 'Kestrel', 'Meadow', 'Nebula', 'Orbit', 'Prism', 'Ripple', 'Summit', 'Thistle',
];

/** Deterministic when given a `random` source, so tests and seeds are reproducible. */
export function generateName(random: () => number = Math.random): string {
  const a = NAME_ADJECTIVES[Math.floor(random() * NAME_ADJECTIVES.length)]!;
  const n = NAME_NOUNS[Math.floor(random() * NAME_NOUNS.length)]!;
  return `${a} ${n}`;
}
