/*
 * Small helpers shared by the rule options of several modes. Game logic
 * only: never import this from a meta.ts file, which the browser loads.
 */
import type { AnswerKind, ModeContext, PlayerId } from '../sdk/types.ts';

/**
 * The same context, but every answer it records is of `kind`. Used when a
 * question comes back for a second go (an encore, a second chance), so the
 * repeat counts towards stats and reports without adding to streaks,
 * quick-answer counts or rewards a second time.
 */
export function recordingAs<C extends ModeContext>(ctx: C, kind: AnswerKind): C {
  return { ...ctx, recordAnswer: (rec) => ctx.recordAnswer({ ...rec, kind }) };
}

/** "A", "A and B", "A, B and C". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** A player's name, including players who have left. */
export function nameOf(ctx: ModeContext, id: PlayerId): string {
  return ctx.player(id)?.name ?? ctx.everyone().find((p) => p.id === id)?.name ?? 'A player';
}

/**
 * Players ranked in the bottom half by score: their rank (one more than the
 * number of players strictly ahead) is below the top half. Ties share the
 * higher rank, so nobody is behind while everyone is level, and a lone
 * player never is.
 */
export function bottomHalf(scores: Readonly<Record<PlayerId, number>>, ids: readonly PlayerId[]): PlayerId[] {
  const cut = Math.ceil(ids.length / 2);
  return ids.filter((id) => 1 + ids.filter((o) => (scores[o] ?? 0) > (scores[id] ?? 0)).length > cut);
}

export const roundTo10 = (n: number) => Math.round(n / 10) * 10;
