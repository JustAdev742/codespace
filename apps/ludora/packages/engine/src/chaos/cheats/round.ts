import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, SCORE, setDeadline } from './kit.ts';

/*
 * Category E: round and game. Cheats that bend the shared round everyone is
 * playing: its clock, when it closes, and what it is worth. They work in
 * the modes built on synchronized rounds (Classic, Quick Draw, Lantern Out,
 * Glim Duels) and change the same deadline and timer the mode itself uses.
 */

const SYNC = ['sync'] as const;
const SYNC_SCORE = ['sync', ...SCORE] as const;

function openQuestion(api: ChaosApi) {
  const sync = api.sync();
  return sync && sync.phase === 'question' && sync.iid ? sync : null;
}

/** The round a "this round" effect applies to: the open one, or the next if none is open. */
function roundOf(api: ChaosApi): number {
  const sync = api.sync()!;
  return sync.phase === 'question' ? sync.round : sync.round + 1;
}

/** End a round effect once its round is over. */
function endWithRound(api: ChaosApi, fx: ActiveEffect) {
  const sync = api.sync();
  if (!sync) return;
  if (sync.round > Number(fx.data.round) || (sync.round === Number(fx.data.round) && sync.phase !== 'question' && sync.phase !== 'intro')) api.endEffect(fx.eid, 'used');
}

const inRound = (api: ChaosApi, fx: ActiveEffect) => {
  const sync = api.sync();
  return Boolean(sync && sync.round === Number(fx.data.round));
};

/** Shared shape of the "this round is worth..." cheats. */
function roundRule(id: string, name: string, description: string, cost: number, bend: (api: ChaosApi, fx: ActiveEffect, d: Record<string, number>) => void, badge: string, extra: Partial<CheatDef> = {}): CheatDef {
  return {
    id,
    name,
    category: 'round',
    description,
    target: 'room',
    needs: SYNC_SCORE,
    cost,
    cooldownMs: 60_000,
    durationMs: 90_000,
    tickMs: 250,
    tags: ['round-rule'],
    conflicts: ['round-rule'],
    stacking: 'reject',
    priority: 25,
    apply: (api, _c, fx) => void (fx!.data.round = roundOf(api)),
    hooks: {
      tick: endWithRound,
      delta: { score: (api, fx, d) => void (inRound(api, fx) && bend(api, fx, d)) },
    },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: badge, tone: 'info' }),
    ...extra,
  };
}

/** Change the time allowed for each new question while the effect lasts. */
function pace(api: ChaosApi, fx: ActiveEffect, factor: number) {
  const sync = openQuestion(api);
  if (!sync || fx.data.last === sync.iid) return;
  fx.data.last = sync.iid;
  const limit = sync.deadline - sync.startedAt;
  setDeadline(api, sync.startedAt + Math.round(limit * factor));
}

const clock: CheatDef[] = [
  {
    id: 'round.rush',
    name: 'Rush Hour',
    category: 'round',
    description: 'The open question closes 5 seconds from now.',
    target: 'room',
    hostile: true,
    needs: SYNC,
    cost: 25,
    cooldownMs: 30_000,
    apply: (api) => {
      const sync = openQuestion(api);
      if (!sync) return { error: 'No question is open right now.' };
      if (sync.deadline - api.now() <= 5000) return { error: 'It closes in less than 5 seconds anyway.' };
      return setDeadline(api, api.now() + 5000) ?? undefined;
    },
    undoable: false,
  },
  {
    id: 'round.overtime',
    name: 'Overtime',
    category: 'round',
    description: 'The open question stays open 10 seconds longer.',
    target: 'room',
    hostile: false,
    needs: SYNC,
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api) => {
      const sync = openQuestion(api);
      if (!sync) return { error: 'No question is open right now.' };
      return setDeadline(api, sync.deadline + 10_000) ?? undefined;
    },
  },
  {
    id: 'round.skip',
    name: 'Slam the Door',
    category: 'round',
    description: 'The open question closes right now. Anyone who has not answered misses it.',
    target: 'room',
    hostile: true,
    needs: SYNC,
    cost: 45,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => (openQuestion(api) ? (setDeadline(api, api.now()) ?? undefined) : { error: 'No question is open right now.' }),
  },
  {
    id: 'round.fast-forward',
    name: 'Fast Forward',
    category: 'round',
    description: 'Skips the wait between questions: the next question comes up now.',
    target: 'room',
    hostile: false,
    needs: SYNC,
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api) => {
      const sync = api.sync()!;
      if (sync.phase === 'question' || sync.phase === 'done') return { error: 'Use this between questions.' };
      // Host-paced rooms wait for the host to press next; chaos does not take that from them.
      if (sync.phaseEndsAt === null) return { error: 'The host is moving this game on by hand.' };
      sync.phaseEndsAt = api.now();
      api.ctx.setTimer('sync', api.now());
    },
  },
  {
    id: 'round.linger',
    name: 'Linger',
    category: 'round',
    description: 'The answer reveal (or leaderboard) on screen now stays up 8 seconds longer.',
    target: 'room',
    hostile: false,
    needs: SYNC,
    cost: 15,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api) => {
      const sync = api.sync()!;
      if ((sync.phase !== 'reveal' && sync.phase !== 'leaderboard') || sync.phaseEndsAt === null) return { error: 'Use this while an answer or the leaderboard is showing.' };
      sync.phaseEndsAt += 8000;
      api.ctx.setTimer('sync', sync.phaseEndsAt);
    },
  },
  {
    id: 'round.speed-round',
    name: 'Speed Round',
    category: 'round',
    description: 'For 45 seconds, every new question gives half the usual time.',
    target: 'room',
    hostile: true,
    needs: SYNC,
    cost: 35,
    cooldownMs: 90_000,
    durationMs: 45_000,
    tickMs: 250,
    tags: ['pace'],
    conflicts: ['pace'],
    apply: (api, _c, fx) => void (fx!.data.last = openQuestion(api)?.iid ?? null),
    hooks: { tick: (api, fx) => pace(api, fx, 0.5) },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Speed round', tone: 'info' }),
  },
  {
    id: 'round.slow-round',
    name: 'Slow Motion',
    category: 'round',
    description: 'For 45 seconds, every new question gives one and a half times the usual time.',
    target: 'room',
    hostile: false,
    needs: SYNC,
    cost: 25,
    cooldownMs: 90_000,
    durationMs: 45_000,
    tickMs: 250,
    tags: ['pace'],
    conflicts: ['pace'],
    apply: (api, _c, fx) => void (fx!.data.last = openQuestion(api)?.iid ?? null),
    hooks: { tick: (api, fx) => pace(api, fx, 1.5) },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Slow motion', tone: 'info' }),
  },
  {
    id: 'round.last-call',
    name: 'Last Call',
    category: 'round',
    description: 'The open question closes as soon as one more player answers it.',
    target: 'room',
    hostile: true,
    needs: SYNC,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 30_000,
    tickMs: 250,
    stacking: 'reject',
    apply: (api, _c, fx) => {
      const sync = openQuestion(api);
      if (!sync) return { error: 'No question is open right now.' };
      fx!.data.iid = sync.iid;
      fx!.data.count = Object.keys(sync.answers).length;
    },
    hooks: {
      tick: (api, fx) => {
        const sync = api.sync();
        if (!sync || sync.iid !== fx.data.iid || sync.phase !== 'question') return api.endEffect(fx.eid, 'used');
        if (Object.keys(sync.answers).length > Number(fx.data.count)) {
          setDeadline(api, api.now());
          api.feed('Last call! The question is closed.', 'info');
          api.endEffect(fx.eid, 'used');
        }
      },
    },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Last call', tone: 'info' }),
  },
];

const worth: CheatDef[] = [
  roundRule('round.double-round', 'Double Round', 'Every point anyone scores on this question (or the next, if none is open) counts twice.', 30, (_api, _fx, d) => {
    for (const id of Object.keys(d)) if (d[id]! > 0) d[id]! *= 2;
  }, 'Double round'),
  roundRule('round.blank-round', 'Blank Round', 'Nobody scores anything on this question (or the next, if none is open).', 35, (_api, _fx, d) => {
    for (const id of Object.keys(d)) if (d[id]! > 0) d[id] = 0;
  }, 'Blank round', { hostile: true }),
  roundRule('round.negative-round', 'Upside-Down Round', 'On this question (or the next), every point scored is taken away instead.', 45, (_api, _fx, d) => {
    for (const id of Object.keys(d)) if (d[id]! > 0) d[id] = -d[id]!;
  }, 'Upside-down round', { hostile: true }),
  roundRule('round.lucky-round', 'Lucky Round', `On this question (or the next), every score is multiplied at random. Odds each time: ${odds([['×1', 50], ['×2', 35], ['×3', 15]])}.`, 30, (api, _fx, d) => {
    for (const id of Object.keys(d)) if (d[id]! > 0) d[id]! *= rollOdds(api, [[1, 50], [2, 35], [3, 15]]);
  }, 'Lucky round'),
  roundRule('round.buzzer-round', 'Buzzer Round', 'On this question (or the next), the question closes the moment anyone scores.', 30, (api, _fx, d) => {
    if (Object.values(d).some((v) => v > 0) && openQuestion(api)) setDeadline(api, api.now());
  }, 'Buzzer round', { hostile: true }),
  {
    ...roundRule('round.spotlight', 'Spotlight', 'On this question (or the next), only the player you choose can score.', 40, (_api, fx, d) => {
      for (const id of Object.keys(d)) if (id !== fx.targets[0] && d[id]! > 0) d[id] = 0;
    }, 'Spotlight'),
    target: 'player',
    hostile: false,
    overlay: (fx) => ({ kind: 'badge', text: 'Spotlight', tone: 'info', playerId: fx.targets[0] }),
  },
];

defineCheats([...clock, ...worth]);
