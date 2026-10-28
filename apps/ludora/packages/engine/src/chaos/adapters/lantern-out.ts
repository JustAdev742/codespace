import { syncParts, syncScoreMeter } from './helpers.ts';
import type { ChaosAdapter, MeterDef } from '../types.ts';

const lanterns: MeterDef = {
  key: 'lanterns',
  label: 'Lanterns lit',
  scope: 'player',
  get: (s, id) => s.lanterns[id] ?? 0,
  set: (s, id, v) => {
    if (!(id in s.lanterns)) return;
    s.lanterns[id] = v;
    if (v > 0) delete s.outAt[id];
  },
  // Chaos can blow out lanterns but never the last one: going out is the mode's call.
  min: 1,
  // Nobody ever holds more lanterns than everyone started with (kindling stops there too).
  max: (_s, _id, ctx) => Number(ctx.settings.lives) || 3,
};

/** Correct answers in a row, which Kindling counts. Never longer than the questions asked so far. */
const streak: MeterDef = {
  key: 'streak',
  label: 'Answer streak',
  scope: 'player',
  get: (s, id) => s.sync.streaks[id] ?? 0,
  set: (s, id, v) => {
    if (id in s.sync.streaks) s.sync.streaks[id] = v;
  },
  max: (s) => Math.max(0, s.sync.round + 1),
};

/** Read-only round counters packs watch (delta hooks) to act the moment a question opens or closes. */
const opened: MeterDef = { key: 'opened', label: 'Questions opened', scope: 'global', get: (s) => s.sync.round + 1, set: () => {} };
const closed: MeterDef = { key: 'closed', label: 'Questions closed', scope: 'global', get: (s) => s.sync.roundsPlayed, set: () => {} };

export const lanternOutAdapter: ChaosAdapter = {
  modeId: 'lantern-out',
  meters: [syncScoreMeter(), lanterns, streak, opened, closed],
  ...syncParts(),
  isOut: (s, id) => (s.lanterns[id] ?? 0) <= 0,
  revive: (s, id) => {
    if ((s.lanterns[id] ?? 0) > 0 || s.leftAt[id] !== undefined) return false;
    s.lanterns[id] = 1;
    delete s.outAt[id];
    return true;
  },
  features: (settings) => {
    const f = ['lanterns', 'knockouts'];
    if (Number(settings.reviveEvery) > 0) f.push('revival');
    if (settings.kindling) f.push('kindling');
    return f;
  },
};
