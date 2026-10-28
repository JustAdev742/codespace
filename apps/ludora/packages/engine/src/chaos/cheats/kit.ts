import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import type { PlayerId } from '../../sdk/types.ts';
import { getCheat } from '../registry.ts';
import type { ActiveEffect, CastInput, ChaosApi, CheatDef, ParamValues } from '../types.ts';

/*
 * Small shared pieces for writing cheats. Scores in different modes run on
 * very different scales (a Classic answer is worth about 1,000 points, a
 * Tug of War pull is worth 1), so cheats move shares of a score, never flat
 * amounts, and a share of anything above zero is at least 1.
 */

export const SCORE = ['meter:score'] as const;
export const CURRENCY = ['meter:currency'] as const;

/** p percent of v, rounded, and at least 1 when v is positive. */
export function share(v: number, p: number): number {
  if (v <= 0) return 0;
  return Math.max(1, Math.round((v * p) / 100));
}

/**
 * Scale a gain by a factor so it always changes when the factor says it
 * should: in modes that score 1 at a time, ×1.25 still adds at least 1 and
 * ×0.5 still takes at least 1 away.
 */
export function scaleGain(v: number, f: number): number {
  if (v <= 0 || f === 1) return v;
  const r = Math.round(v * f);
  return f > 1 ? Math.max(v + 1, r) : Math.max(0, Math.min(v - 1, r));
}

/** Split `total` into `n` near-equal whole shares; leftover units go to random shares. */
export function splitEvenly(api: { rng: { int(a: number, b: number): number } }, total: number, n: number): number[] {
  const each = Math.floor(total / n);
  const out = Array.from({ length: n }, () => each);
  for (let left = total - each * n; left > 0; left--) out[api.rng.int(0, n - 1)]! += 1;
  return out;
}

/** Move up to `amount` of a meter from one player to another. Returns what actually moved. */
export function transfer(api: ChaosApi, meter: string, from: PlayerId, to: PlayerId, amount: number): number {
  if (amount <= 0 || from === to) return 0;
  const taken = -api.add(meter, from, -amount);
  if (taken <= 0) return 0;
  const given = api.add(meter, to, taken);
  // If the receiver could not hold it all (a cap), the rest goes back.
  if (given < taken) api.add(meter, from, taken - given);
  return given;
}

export const target = (cast: CastInput | ActiveEffect) => cast.targets[0]!;

export function inGame(api: ChaosApi, id: PlayerId): boolean {
  return api.ids().includes(id);
}

/** Players ranked by score with their rank, highest first. */
export function standings(api: ChaosApi, meter = 'score'): { id: PlayerId; v: number }[] {
  return api.ranked(meter).map((id) => ({ id, v: api.get(meter, id) }));
}

/** Whether a player is in the bottom half of the standings. */
export function inBottomHalf(api: ChaosApi, id: PlayerId, meter = 'score'): boolean {
  const order = api.ranked(meter);
  const i = order.indexOf(id);
  return i >= Math.floor(order.length / 2) && order.length > 1;
}

export function needsOthers(api: ChaosApi, caster: PlayerId): { error: string } | null {
  return api.others(caster).length ? null : { error: 'Nobody else is in the game.' };
}

/** Error unless somebody has more than zero of a meter. */
export function nothingToTake(api: ChaosApi, id: PlayerId, meter = 'score'): { error: string } | null {
  return api.get(meter, id) > 0 ? null : { error: `${api.name(id)} has nothing to take.` };
}

/* ------------------------------ questions ------------------------------ */

export function currentReveal(api: ChaosApi, id: PlayerId): { iid: string; reveal: unknown; choices: number } | null {
  const iid = api.question(id);
  if (!iid) return null;
  try {
    const inst = api.ctx.questions.instance(iid);
    return { iid, reveal: api.ctx.questions.reveal(iid), choices: inst.order?.length ?? 0 };
  } catch {
    return null;
  }
}

/** The choice token a multiple-choice answer action picks, if it is one. */
export function pickedChoice(action: unknown): string | null {
  const a = action as { answer?: { type?: string; choiceId?: unknown } } | null;
  return a?.answer?.type === 'mcq' && typeof a.answer.choiceId === 'string' ? a.answer.choiceId : null;
}

/** The token syncRounds records for an answer action (multiple choice or true/false), as in its answer tally. */
export function answerToken(action: unknown): string | null {
  const a = action as { answer?: { type?: string; choiceId?: unknown; value?: unknown } } | null;
  if (a?.answer?.type === 'mcq' && typeof a.answer.choiceId === 'string') return a.answer.choiceId;
  if (a?.answer?.type === 'truefalse' && typeof a.answer.value === 'boolean') return String(a.answer.value);
  return null;
}

export function isAnswer(action: unknown): boolean {
  return Boolean(action && typeof action === 'object' && 'answer' in (action as object));
}

/* -------------------------------- rounds ------------------------------- */

/** Move the open question's deadline (syncRounds modes). */
export function setDeadline(api: ChaosApi, at: number): { error: string } | null {
  const sync = api.sync();
  if (!sync || sync.phase !== 'question') return { error: 'No question is open right now.' };
  sync.deadline = Math.max(api.now(), at);
  sync.phaseEndsAt = sync.deadline;
  api.ctx.setTimer('sync', sync.deadline === api.now() ? api.now() : sync.deadline + DEADLINE_GRACE_MS);
  return null;
}

/* -------------------------------- random ------------------------------- */

const META_TAG = 'meta-random';

/** Build a cast for a cheat with default parameters and random targets, for roulette-style cheats. */
export function randomCast(api: ChaosApi, def: CheatDef, caster: PlayerId): CastInput | null {
  const others = api.opponents(caster);
  const params: ParamValues = {};
  for (const p of def.params ?? []) {
    if (p.kind === 'int' || p.kind === 'choice') params[p.key] = p.default;
    else {
      const pool = api.others(caster);
      if (!pool.length) return null;
      params[p.key] = api.rng.pick(pool);
    }
  }
  switch (def.target) {
    case 'self':
      return { caster, targets: [caster], team: null, params };
    case 'room':
      return { caster, targets: [], team: null, params };
    case 'everyone':
      return { caster, targets: api.ids(), team: null, params };
    case 'everyone-else':
      return others.length || api.others(caster).length ? { caster, targets: api.others(caster), team: null, params } : null;
    case 'opponent':
      return others.length ? { caster, targets: [api.rng.pick(others)], team: null, params } : null;
    case 'player':
      return { caster, targets: [api.rng.pick(api.ids())], team: null, params };
    default:
      return null;
  }
}

/** Cheats a roulette may pick in this game: not other random-pickers, not team-only, and supported here. */
export function roulettePool(api: ChaosApi, filter: (d: CheatDef) => boolean, all: () => CheatDef[]): CheatDef[] {
  return all().filter((d) => {
    if ((d.tags ?? []).includes(META_TAG)) return false;
    if (d.modes && !d.modes.includes(api.adapter.modeId)) return false;
    if ((d.needs ?? []).some((n) => !api.has(n))) return false;
    if (['enemy-team', 'my-team', 'teammate'].includes(d.target)) return false;
    return filter(d);
  });
}

export const RANDOM_META = META_TAG;

export function nameOfCheat(id: string): string {
  return getCheat(id)?.name ?? id;
}

/** Odds text for cheats with random outcomes; shown in their descriptions so players know the chances. */
export function odds(rows: readonly [string, number][]): string {
  return rows.map(([what, p]) => `${what} ${p}%`).join(', ');
}

/** Pick from weighted rows (weights in percent, summing to 100) with the chaos random stream. */
export function rollOdds<T>(api: ChaosApi, rows: readonly [T, number][]): T {
  let r = api.rng.next() * 100;
  for (const [v, w] of rows) {
    if (r < w) return v;
    r -= w;
  }
  return rows[rows.length - 1]![0];
}
