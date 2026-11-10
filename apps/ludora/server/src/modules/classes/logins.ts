import type { FastifyInstance } from 'fastify';
import { and, count, eq } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { containsBlockedLanguage, displayNameSchema, usernameSchema } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { classLogins, classMembers, users } from '../../db/schema.ts';
import { noStore, requireAccount } from '../../http/context.ts';
import { AppError, conflict, notFound } from '../../lib/errors.ts';
import { friendCode } from '../../lib/crypto.ts';
import { parse } from '../../lib/validate.ts';
import { audit } from '../admin/common.ts';
import { hashSecret, isUniqueViolation, revokeAllSessions } from '../auth/service.ts';
import { defaultPreferences } from '../users/preferences.ts';
import { teacherClass } from './access.ts';

/*
 * Class logins: the teacher types (or imports) their students' first names and
 * Ludora makes a student account for each, with a username and an easy
 * passcode of three short words. No email, no birth year. The passcodes are
 * shown once, on printable cards, and stored only as Argon2id hashes. Only the
 * teacher of the class an account was made for can reset its passcode, which
 * signs the student out everywhere. Accounts start with the safest settings
 * (the under-13 defaults), since the teacher does not give an age.
 */

const MAX_PER_REQUEST = 40;
const MAX_MEMBERS = 300;

/** Short, friendly, easy-to-spell words. Every one passes the name filter; three give 16.7 million passcodes, and sign-in locks after five wrong tries. */
export const PASSCODE_WORDS = [
  'acorn', 'amber', 'anchor', 'apple', 'arrow', 'aspen', 'atlas', 'badge', 'bagel', 'baker', 'bamboo', 'banjo', 'barn', 'basil', 'beach', 'beacon',
  'bean', 'bear', 'bell', 'berry', 'birch', 'bison', 'blaze', 'bloom', 'board', 'boat', 'bolt', 'bonus', 'book', 'boot', 'brick', 'bridge',
  'brook', 'brush', 'bubble', 'bucket', 'button', 'cabin', 'cactus', 'cake', 'camel', 'camp', 'candle', 'canoe', 'canyon', 'cargo', 'carrot', 'castle',
  'cedar', 'chalk', 'cherry', 'chess', 'cider', 'cinema', 'circle', 'cliff', 'cloud', 'clover', 'coast', 'cobalt', 'cocoa', 'comet', 'compass', 'coral',
  'cotton', 'crane', 'crayon', 'creek', 'crown', 'crystal', 'cube', 'daisy', 'delta', 'desert', 'diamond', 'dingo', 'dolphin', 'dome', 'dragon', 'drum',
  'eagle', 'earth', 'echo', 'elbow', 'elm', 'ember', 'falcon', 'feather', 'fern', 'ferry', 'field', 'fig', 'flag', 'flame', 'flute', 'forest',
  'fossil', 'fox', 'frost', 'galaxy', 'garden', 'gecko', 'gem', 'ginger', 'glacier', 'globe', 'goose', 'grape', 'gravel', 'guitar', 'harbour', 'harp',
  'hazel', 'hedge', 'heron', 'hill', 'honey', 'hoop', 'igloo', 'island', 'ivy', 'jacket', 'jade', 'jelly', 'jigsaw', 'jungle', 'kayak', 'kettle',
  'kite', 'koala', 'ladder', 'lagoon', 'lake', 'lantern', 'lemon', 'lily', 'lime', 'lion', 'llama', 'lobster', 'lotus', 'magnet', 'mango', 'maple',
  'marble', 'meadow', 'melon', 'meteor', 'mint', 'mitten', 'moon', 'moose', 'moss', 'mountain', 'muffin', 'nebula', 'needle', 'nest', 'noodle', 'oak',
  'oasis', 'ocean', 'olive', 'onion', 'orange', 'orbit', 'otter', 'owl', 'paddle', 'panda', 'paper', 'parrot', 'peach', 'pebble', 'pencil', 'pepper',
  'piano', 'pickle', 'pilot', 'pine', 'planet', 'plum', 'pocket', 'pond', 'poppy', 'puffin', 'pumpkin', 'quartz', 'quill', 'rabbit', 'radar', 'rain',
  'raven', 'reef', 'ribbon', 'river', 'robin', 'rocket', 'rose', 'ruby', 'saddle', 'sail', 'salmon', 'sand', 'scarf', 'seal', 'shell', 'silver',
  'sky', 'sled', 'snow', 'sock', 'spark', 'spoon', 'spruce', 'squid', 'star', 'stone', 'storm', 'summit', 'sun', 'swan', 'table', 'teapot',
  'tiger', 'timber', 'toast', 'tomato', 'torch', 'tower', 'train', 'tulip', 'tunnel', 'turtle', 'valley', 'violet', 'walnut', 'whale', 'willow', 'window',
  'yacht', 'yarn', 'yoyo', 'zebra', 'zigzag', 'basket', 'blanket', 'cookie', 'hammock', 'helmet', 'lizard', 'mammoth', 'pirate', 'rainbow', 'shadow', 'thunder',
] as const;

export function passcode(random: (n: number) => number = randomInt): string {
  return [0, 1, 2].map(() => PASSCODE_WORDS[random(PASSCODE_WORDS.length)]!).join('-');
}

/** A username from a first name: its letters (accents dropped), then digits. Null when the name has no usable letters. */
export function usernameStem(name: string): string {
  const letters = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 12);
  return letters.length >= 2 ? letters : 'student';
}

function candidate(stem: string): string {
  return `${stem}${randomInt(100, 1000)}`;
}

const namesSchema = z.object({
  names: z.array(z.string().max(100)).min(1, 'Add at least one name.').max(MAX_PER_REQUEST, `Add up to ${MAX_PER_REQUEST} names at a time.`),
});

export async function classLoginRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /** Make student accounts for a list of first names. The passcodes are in this response only. */
  app.post('/api/classes/:id/logins', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { names: raw } = parse(namesSchema, req.body);
    const cls = await teacherClass(db, id, auth, 'Only the teacher can make logins for the class.', { active: true });

    // Every name is checked before anything is made, so a typo never leaves half a class behind.
    const names: string[] = [];
    const problems: string[] = [];
    raw.forEach((line, i) => {
      if (!line.trim()) return;
      const r = displayNameSchema.safeParse(line);
      if (r.success) names.push(r.data);
      else problems.push(`Line ${i + 1}, “${line.trim().slice(0, 30)}”: ${r.error.issues[0]?.message ?? 'not a usable name.'}`);
    });
    if (problems.length) throw new AppError(400, 'validation_failed', problems.slice(0, 5).join(' '), { names: problems.slice(0, 5).join(' ') });
    if (!names.length) throw new AppError(400, 'validation_failed', 'Add at least one name.', { names: 'Add at least one name, one per line.' });
    const [n] = await db.select({ n: count() }).from(classMembers).where(eq(classMembers.classId, id));
    if ((n?.n ?? 0) + names.length > MAX_MEMBERS) throw conflict(`A class can have up to ${MAX_MEMBERS} students.`);

    const made: { userId: string; displayName: string; username: string; passcode: string }[] = [];
    // Hash first (slow on purpose), then write everything in one transaction.
    const prepared = await Promise.all(
      names.map(async (displayName) => {
        const code = passcode();
        return { displayName, code, hash: await hashSecret(code) };
      }),
    );
    await db.transaction(async (tx) => {
      for (const p of prepared) {
        const stem = usernameStem(p.displayName);
        let row: { id: string; username: string | null } | undefined;
        for (let attempt = 0; attempt < 25 && !row; attempt++) {
          const username = candidate(stem);
          const ok = usernameSchema.safeParse(username);
          if (!ok.success || containsBlockedLanguage(username)) continue;
          const taken = await tx.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
          if (taken.length) continue;
          try {
            [row] = await tx
              .insert(users)
              .values({ username, displayName: p.displayName, passwordHash: p.hash, accountType: 'student', ageBand: 'under13', preferences: defaultPreferences('under13'), friendCode: friendCode() })
              .onConflictDoNothing()
              .returning({ id: users.id, username: users.username });
          } catch (err) {
            if (!isUniqueViolation(err)) throw err;
          }
        }
        if (!row) throw new Error('Could not find a free username');
        await tx.insert(classMembers).values({ classId: id, userId: row.id });
        await tx.insert(classLogins).values({ userId: row.id, classId: id, createdBy: auth.user.id });
        made.push({ userId: row.id, displayName: p.displayName, username: row.username!, passcode: p.code });
      }
      // The passcodes themselves are never written to the audit log.
      await audit(deps, req, tx, { actor: auth, action: 'class.logins_created', targetType: 'class', targetId: id, targetName: cls.name, reason: `${made.length} student accounts` });
    });
    return { ok: true, accounts: made };
  });

  /** A new passcode for a student whose account was made for this class. Signs them out everywhere. */
  app.post('/api/classes/:id/logins/:uid/passcode', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id, uid } = parse(z.object({ id: z.string().uuid(), uid: z.string().uuid() }), req.params);
    await teacherClass(db, id, auth, 'Only the teacher can reset passcodes.', { active: true });
    const [row] = await db
      .select({ username: users.username, displayName: users.displayName })
      .from(classLogins)
      .innerJoin(classMembers, and(eq(classMembers.userId, classLogins.userId), eq(classMembers.classId, classLogins.classId)))
      .innerJoin(users, eq(users.id, classLogins.userId))
      .where(and(eq(classLogins.userId, uid), eq(classLogins.classId, id)))
      .limit(1);
    if (!row || !row.username) throw notFound('That student does not have a class login in this class. Use Sign-in help instead.');
    const code = passcode();
    const hash = await hashSecret(code);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: hash, failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, uid));
      await revokeAllSessions(tx, uid);
      await audit(deps, req, tx, { actor: auth, action: 'class.passcode_reset', targetType: 'user', targetId: uid, targetName: row.username!, reason: 'Teacher reset a class login' });
    });
    return { ok: true, account: { userId: uid, displayName: row.displayName, username: row.username, passcode: code } };
  });
}
