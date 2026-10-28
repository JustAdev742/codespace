import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AppDeps } from '../../app.ts';
import { users } from '../../db/schema.ts';
import type { AuthContext } from '../../http/context.ts';
import { writeAudit } from '../audit/service.ts';
import { knockBeats, SequenceTracker } from './sequence.ts';

/*
 * Chaos access for the whole server: the secret sequence tracker and the
 * account unlock, which lives in the database and is only ever set by a
 * completed sequence (or cleared by the player). There is no admin grant.
 */

export interface ChaosService {
  beats: number[];
  tracker: SequenceTracker;
  isUnlocked(userId: string): Promise<boolean>;
  setUnlocked(auth: AuthContext, unlocked: boolean): Promise<void>;
}

const services = new WeakMap<AppDeps, ChaosService>();

/** The reactions on a player's reaction bar; the ritual only asks for ones a player can actually send. */
export const RITUAL_REACTIONS = ['wave', 'laugh', 'wow', 'clap', 'heart', 'fire', 'think', 'gg'] as const;

export function chaosService(deps: AppDeps): ChaosService {
  const existing = services.get(deps);
  if (existing) return existing;
  const secret = deps.config.CHAOS_SECRET ?? createHmac('sha256', deps.config.IP_HASH_KEY).update('ludora-chaos-sequence').digest('hex');
  const beats = knockBeats(secret);
  const service: ChaosService = {
    beats,
    tracker: new SequenceTracker(beats, RITUAL_REACTIONS),
    async isUnlocked(userId) {
      const rows = await deps.db.select({ at: users.chaosUnlockedAt }).from(users).where(eq(users.id, userId)).limit(1);
      return Boolean(rows[0]?.at);
    },
    async setUnlocked(auth, unlocked) {
      await deps.db.transaction(async (tx) => {
        await tx.update(users).set({ chaosUnlockedAt: unlocked ? new Date() : null }).where(eq(users.id, auth.user.id));
        await writeAudit(tx, deps.config.APP_ENV, {
          actor: auth,
          action: unlocked ? 'chaos.unlocked' : 'chaos.forgotten',
          targetType: 'user',
          targetId: auth.user.id,
          targetName: auth.user.displayName,
        });
      });
      for (const room of deps.rooms.list()) room.setChaosUnlocked(auth.user.id, unlocked);
    },
  };
  services.set(deps, service);
  return service;
}
