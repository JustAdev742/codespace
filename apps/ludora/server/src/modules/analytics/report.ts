import { sql } from 'drizzle-orm';
import { questionSchema, type Question } from '@ludora/shared';
import type { DbOrTx } from '../../db/client.ts';
import { answerEvents } from '../../db/schema.ts';
import type { SetRow } from '../sets/access.ts';

export interface QuestionStat {
  questionId: string;
  prompt: string;
  type: string;
  /** Players who answered it at least once. */
  players: number;
  /** Share of those players whose first try was right (0-1). */
  firstTryRate: number;
  /** All tries, including retries in puzzle modes. */
  attempts: number;
  avgResponseMs: number;
}

/** The set's questions by id, for putting prompts next to statistics. */
export function questionsById(set: SetRow | null): Map<string, Question> {
  const out = new Map<string, Question>();
  for (const raw of (set?.questions as unknown[] | undefined) ?? []) {
    const r = questionSchema.safeParse(raw);
    if (r.success) out.set(r.data.id, r.data);
  }
  return out;
}

/**
 * How each question went across some games. A question counts once per
 * player, judged on their first try, so retries in puzzle modes and
 * self-graded flashcards do not distort it. Hardest questions first.
 */
export async function questionReport(db: DbOrTx, gameIds: readonly string[], set: SetRow | null): Promise<QuestionStat[]> {
  if (!gameIds.length) return [];
  const ids = sql.join(gameIds.map((id) => sql`${id}::uuid`), sql`, `);
  const first = await db.execute<{ question_id: string; players: string; right: string; avg_ms: string }>(sql`
    select question_id, count(*) as players, sum(case when correct then 1 else 0 end) as right, avg(response_ms) as avg_ms
    from (
      select distinct on (game_id, player_key, question_id) question_id, correct, response_ms
      from ${answerEvents}
      where game_id in (${ids}) and kind <> 'self'
      order by game_id, player_key, question_id, id
    ) f
    group by question_id`);
  const tries = await db.execute<{ question_id: string; n: string }>(sql`
    select question_id, count(*) as n from ${answerEvents} where game_id in (${ids}) and kind <> 'self' group by question_id`);
  const triesBy = new Map(tries.rows.map((r) => [r.question_id, Number(r.n)]));
  const byId = questionsById(set);
  return first.rows
    .map((r) => {
      const q = byId.get(r.question_id);
      const players = Number(r.players);
      return {
        questionId: r.question_id,
        prompt: q?.prompt ?? 'A question that is no longer in the set',
        type: q?.type ?? 'unknown',
        players,
        firstTryRate: players ? Number(r.right) / players : 0,
        attempts: triesBy.get(r.question_id) ?? players,
        avgResponseMs: Math.round(Number(r.avg_ms) || 0),
      };
    })
    .sort((a, b) => a.firstTryRate - b.firstTryRate || b.players - a.players);
}
