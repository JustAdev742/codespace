import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { createRng, hashString } from '@ludora/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import { gameParticipants, gameSessions, quests, userQuests } from '../../db/schema.ts';
import { isoWeek, nextDailyReset, nextWeeklyReset, utcDay } from '../../lib/time.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { credit, withOperation } from '../economy/service.ts';
import { addXp } from './levels.ts';
import { getRules } from '../economy/config.ts';
import { runningEvents } from '../events/service.ts';

const DAILY_COUNT = 3;
const WEEKLY_COUNT = 3;

export type QuestRow = typeof quests.$inferSelect;
export type QuestMetrics = Partial<Record<string, number>>;

function pickWeighted(pool: QuestRow[], count: number, seed: string): QuestRow[] {
  const rng = createRng(hashString(seed));
  const left = pool.slice();
  const out: QuestRow[] = [];
  // Never two quests on the same metric in one period: they would complete together.
  while (out.length < count && left.length) {
    const total = left.reduce((n, q) => n + Math.max(1, q.weight), 0);
    let roll = rng.next() * total;
    let idx = 0;
    for (; idx < left.length - 1; idx++) {
      roll -= Math.max(1, left[idx]!.weight);
      if (roll < 0) break;
    }
    const chosen = left.splice(idx, 1)[0]!;
    out.push(chosen);
    for (let i = left.length - 1; i >= 0; i--) if (left[i]!.metric === chosen.metric) left.splice(i, 1);
  }
  return out;
}

export function periodsFor(now = new Date()) {
  return { daily: utcDay(now), weekly: isoWeek(now) };
}

/** Event quests run weekly, in a period of their own so they never crowd out the regular weekly quests. */
export const eventPeriod = (eventKey: string, weekly: string) => `${eventKey}:${weekly}`;

/** Make sure today's, this week's and any running event's quests are assigned, then return them. */
export async function ensureQuests(db: DbOrTx, userId: string, now = new Date()) {
  const { daily, weekly } = periodsFor(now);
  const events = await runningEvents(db, now);
  const periods = [daily, weekly, ...events.map((e) => eventPeriod(e.key, weekly))];
  const existing = await db.select().from(userQuests).where(and(eq(userQuests.userId, userId), inArray(userQuests.period, periods)));
  const pool = await db.select().from(quests).where(eq(quests.active, true));
  const missing: (typeof userQuests.$inferInsert)[] = [];
  for (const [kind, period, count] of [['daily', daily, DAILY_COUNT], ['weekly', weekly, WEEKLY_COUNT]] as const) {
    if (existing.some((e) => e.period === period)) continue;
    const eligible = pool.filter((q) => q.kind === kind);
    for (const q of pickWeighted(eligible, count, `${userId}:${period}`)) missing.push({ userId, questId: q.id, period, target: q.target, progress: 0 });
  }
  for (const ev of events) {
    const period = eventPeriod(ev.key, weekly);
    if (existing.some((e) => e.period === period)) continue;
    for (const q of pool.filter((q) => q.kind === ev.questKind)) missing.push({ userId, questId: q.id, period, target: q.target, progress: 0 });
  }
  if (missing.length) await db.insert(userQuests).values(missing).onConflictDoNothing();
  const rows = await db
    .select({ uq: userQuests, q: quests })
    .from(userQuests)
    .innerJoin(quests, eq(quests.id, userQuests.questId))
    .where(and(eq(userQuests.userId, userId), inArray(userQuests.period, periods)));
  return { rows, daily, weekly, events: events.map((e) => ({ key: e.key, name: e.name, period: eventPeriod(e.key, weekly) })), resets: { daily: nextDailyReset(now).toISOString(), weekly: nextWeeklyReset(now).toISOString() } };
}

export interface QuestProgressNote {
  title: string;
  progress: number;
  target: number;
  completed: boolean;
}

/**
 * Advance quests whose metric appears in `metrics`. Values for `*_max`
 * style metrics (streak_in_game) replace progress if higher; the rest add.
 * `distinct_modes` is recomputed from game history.
 */
export async function bumpQuests(tx: DbOrTx, userId: string, metrics: QuestMetrics, now = new Date()): Promise<QuestProgressNote[]> {
  const { rows, daily } = await ensureQuests(tx, userId, now);
  const notes: QuestProgressNote[] = [];
  let dailyCompletedNow = 0;
  for (const { uq, q } of rows) {
    if (uq.completedAt) continue;
    let progress = uq.progress;
    if (q.metric === 'distinct_modes') {
      if (!metrics.distinct_modes) continue;
      const since = q.kind === 'daily' ? new Date(`${daily}T00:00:00Z`) : new Date(now.getTime() - 7 * 86_400_000);
      const res = await tx
        .select({ n: sql<number>`count(distinct ${gameSessions.modeId})::int` })
        .from(gameParticipants)
        .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
        .where(and(eq(gameParticipants.userId, userId), gte(gameSessions.endedAt, since)));
      progress = res[0]?.n ?? progress;
    } else if (q.metric === 'streak_in_game') {
      const v = metrics.streak_in_game ?? 0;
      if (v <= progress) continue;
      progress = v;
    } else {
      const v = metrics[q.metric] ?? 0;
      if (!v) continue;
      progress += v;
    }
    progress = Math.min(progress, uq.target);
    const completed = progress >= uq.target;
    await tx
      .update(userQuests)
      .set({ progress, ...(completed ? { completedAt: now } : {}) })
      .where(and(eq(userQuests.userId, userId), eq(userQuests.questId, uq.questId), eq(userQuests.period, uq.period)));
    if (completed && q.kind === 'daily') dailyCompletedNow++;
    notes.push({ title: q.title, progress, target: uq.target, completed });
  }
  if (dailyCompletedNow && !('daily_quests' in metrics)) {
    notes.push(...(await bumpQuests(tx, userId, { daily_quests: dailyCompletedNow }, now)).filter((n) => n.title));
  }
  return notes;
}

export async function claimQuest(db: Db, userId: string, questId: string, period: string) {
  return withOperation(db, userId, `quest:${questId}:${period}`, 'quest_claim', async (tx, opId) => {
    const rows = await tx
      .select({ uq: userQuests, q: quests })
      .from(userQuests)
      .innerJoin(quests, eq(quests.id, userQuests.questId))
      .where(and(eq(userQuests.userId, userId), eq(userQuests.questId, questId), eq(userQuests.period, period)))
      .for('update', { of: userQuests });
    const row = rows[0];
    if (!row) throw notFound('That quest is not one of yours.');
    if (!row.uq.completedAt) throw new AppError(409, 'invalid_state', 'Finish the quest first.');
    if (row.uq.claimedAt) throw new AppError(409, 'conflict', 'Already claimed.');
    const reward = row.q.reward as { sparks?: number; moonstones?: number; xp?: number; frost_tickets?: number };
    await tx.update(userQuests).set({ claimedAt: new Date() }).where(and(eq(userQuests.userId, userId), eq(userQuests.questId, questId), eq(userQuests.period, period)));
    for (const currency of ['sparks', 'moonstones', 'frost_tickets'] as const) {
      const amount = reward[currency] ?? 0;
      if (amount > 0) await credit(tx, { userId, currency, amount, reason: 'quest_reward', refType: 'quest', refId: `${questId}:${period}`, opId });
    }
    const xp = reward.xp ? await addXp(tx, userId, reward.xp, await getRules(tx), opId) : null;
    return { questId, period, reward, levelUp: xp && xp.to > xp.from ? { from: xp.from, to: xp.to } : null };
  });
}

