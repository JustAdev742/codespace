import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import { MAX_MULTIPLIER, multiplierFor, overdriveMultiplier, STREAK_FOR_BOOST } from '../../modes/time-attack/index.ts';
import type { ModeContext } from '../../sdk/types.ts';
import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

/** Cheats never take a run's clock below this many seconds (a run already below it keeps what it has). */
export const CLOCK_FLOOR_S = 3;
/** The highest multiplier cheats may give in overdrive, where the mode itself has no top. */
export const OVERDRIVE_CHEAT_CAP = 9;

const clockMs = (ctx: ModeContext) => (Number(ctx.settings.clock) || 60) * 1000;
const run = (s: any, id: string) => (s.runs[id] && !s.runs[id].over ? s.runs[id] : null);
// Some callers (the catalogue suite's meter reader) pass a bare context without a clock.
const nowOf = (ctx: ModeContext, r: { startedAt: number }) => (typeof ctx?.now === 'function' ? ctx.now() : r.startedAt);

/** Seconds left on a run's clock (0 once the run is over). */
function secondsLeft(s: any, id: string, ctx: ModeContext): number {
  const r = run(s, id);
  return r ? Math.max(0, (r.endsAt - nowOf(ctx, r)) / 1000) : 0;
}

const multiplierOf = (inRow: number, ctx: ModeContext) => (ctx.settings.overdrive ? overdriveMultiplier(inRow) : multiplierFor(inRow));

export const timeAttackAdapter: ChaosAdapter = {
  modeId: 'time-attack',
  meters: [
    fieldMeter('score', 'Points', (s: any) => s.runs, 'score'),
    {
      key: 'clock',
      label: 'Seconds left',
      scope: 'player',
      integer: false,
      get: secondsLeft,
      set: (s, id, v, ctx) => {
        const r = run(s, id);
        if (!r) return;
        r.endsAt = Math.round(ctx.now() + v * 1000);
        ctx.setTimer(`end:${id}`, r.endsAt + DEADLINE_GRACE_MS);
      },
      // Never runs a clock out (only the run's own timer ends a run), and never above the time it started with.
      min: (s, id, ctx) => Math.min(CLOCK_FLOOR_S, secondsLeft(s, id, ctx)),
      max: (s, id, ctx) => (run(s, id) ? Math.max(secondsLeft(s, id, ctx), clockMs(ctx) / 1000) : 0),
    },
    {
      key: 'multiplier',
      label: 'Multiplier',
      scope: 'player',
      get: (s, id) => s.runs[id]?.multiplier ?? 1,
      // A multiplier comes from a run of correct answers, so the run's count is set to match it.
      set: (s, id, v, ctx) => {
        const r = run(s, id);
        if (!r) return;
        r.multiplier = v;
        if (multiplierOf(r.inRow, ctx) !== v) r.inRow = (v - 1) * STREAK_FOR_BOOST;
      },
      min: 1,
      max: (s, id, ctx) => {
        const cur = s.runs[id]?.multiplier ?? 1;
        if (!run(s, id)) return cur;
        return Math.max(cur, ctx.settings.overdrive ? OVERDRIVE_CHEAT_CAP : MAX_MULTIPLIER);
      },
    },
  ],
  ...streamParts((s: any, id) => (s.runs[id] && !s.runs[id].over ? s.runs[id].stream : null)),
  isOut: (s, id) => Boolean(s.runs[id]?.over),
  features: (st) => {
    const f: string[] = [];
    if (Number(st.penaltySeconds ?? 0) > 0 && !st.suddenDeath) f.push('penalties');
    if (Number(st.bonusSeconds ?? 0) > 0) f.push('bonus-time');
    return f;
  },
};
