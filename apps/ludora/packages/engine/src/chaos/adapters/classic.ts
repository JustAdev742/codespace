import { syncParts, syncScoreMeter } from './helpers.ts';
import type { ChaosAdapter, MeterDef } from '../types.ts';

/** Answer streaks drive Classic's streak bonus and the Glim Chain multiplier. A streak can never be longer than the questions asked so far. */
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

/**
 * 1 while a player is still in an elimination game, 0 once knocked out.
 * Chaos can only ever write 1 (bring a knocked-out player back), never knock
 * anyone out; late joiners who are only watching (-1) cannot be brought in.
 * Packs bend it with delta hooks to keep a player in when the mode knocks them out.
 */
const standing: MeterDef = {
  key: 'standing',
  label: 'Still in the game',
  scope: 'player',
  get: (s, id) => (s.out?.[id] === undefined ? 1 : 0),
  set: (s, id, v) => {
    if (v >= 1 && s.out?.[id] !== undefined && s.out[id] !== -1) delete s.out[id];
  },
  min: 1,
  max: () => 1,
};

/** In Unison bonus points a team has earned. */
const teamBonus: MeterDef = {
  key: 'teamBonus',
  label: 'Unison bonus',
  scope: 'team',
  get: (s, id) => s.teamBonus?.[id] ?? 0,
  set: (s, id, v) => {
    if (s.teamBonus) s.teamBonus[id] = v;
  },
};

/** Questions closed so far. Read-only: packs watch it (delta hooks) to act the moment a question closes. */
const closed: MeterDef = { key: 'closed', label: 'Questions closed', scope: 'global', get: (s) => s.sync.roundsPlayed, set: () => {} };

export const classicAdapter: ChaosAdapter = {
  modeId: 'classic',
  meters: [syncScoreMeter(), streak, standing, teamBonus, closed],
  ...syncParts(),
  features: (settings) => {
    const f: string[] = [];
    if (Number(settings.wrongPenalty) > 0) f.push('losses');
    if (settings.encore) f.push('encore');
    if (settings.comeback) f.push('comeback');
    if (settings.suddenDeath || settings.knockout) f.push('knockouts');
    // Streaks pay out through the streak bonus or the Glim Chain multiplier; Split the Pot ignores them.
    if (settings.scoring === 'streak' || (settings.streakBonus !== false && settings.scoring !== 'pot')) f.push('streaks');
    if (Number(settings.unisonBonus) > 0) f.push('unison');
    if (settings.scoring === 'pot') f.push('pot');
    return f;
  },
  isOut: (s, id) => s.out?.[id] !== undefined,
  // Knocked-out players come back; late joiners who are only watching (-1) do not.
  revive: (s, id) => {
    if (s.out?.[id] === undefined || s.out[id] === -1) return false;
    delete s.out[id];
    return true;
  },
};
