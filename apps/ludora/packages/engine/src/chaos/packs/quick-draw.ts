import { DEADLINE_GRACE_MS, type SyncState } from '../../mechanics/syncRounds.ts';
import type { PlayerId } from '../../sdk/types.ts';
import { isAnswer, target } from '../cheats/kit.ts';
import { defineCheats } from '../registry.ts';
import type { ChaosApi, CheatDef } from '../types.ts';

/*
 * Cheats that only make sense in Quick Draw: a buzzer race where the first
 * correct answer wins the round (a point), every player gets one try per
 * question, a wrong answer locks them out (and with One Voice locks out
 * their whole team), and `s.misses` counts every wrong answer. Clock
 * changes and plain answer blocking are universal cheats, so they are not
 * repeated here.
 *
 * Quick Draw's state as cheats see it: `s.sync` (syncRounds, closing on the
 * first correct answer), `s.wins` (every round won: round, player, time),
 * `s.penalised`, `s.misses`.
 */

const MODE = 'quick-draw';
const M = [MODE] as const;
const S = ['meter:score'] as const;

const sync = (api: ChaosApi): SyncState => api.s.sync;
const inGame = (api: ChaosApi, id: PlayerId) => api.ids().includes(id);

/** Whether a point can still be added without reaching the target, which only the mode may hand out. */
function belowTarget(api: ChaosApi, id: PlayerId, extra = 1): boolean {
  const max = api.meter('score')?.max?.(api.s, id, api.ctx) ?? Number.MAX_SAFE_INTEGER;
  return api.get('score', id) + extra <= max;
}

function questionOpen(api: ChaosApi): { error: string } | null {
  const s = sync(api);
  return s.phase === 'question' && s.iid ? null : { error: 'No question is open right now.' };
}

const cheats: CheatDef[] = [
  {
    id: 'quick-draw.reholster',
    name: 'Reholster',
    category: 'advantage',
    description: 'Take back your wrong answer to the open question and draw again: you get a second try. A point you lost to the penalty stays lost. With One Voice, your answer no longer locks your team out either.',
    target: 'self',
    modes: M,
    needs: ['sync'],
    cost: 35,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const closed = questionOpen(api);
      if (closed) return closed;
      const mine = sync(api).answers[c.caster];
      if (!mine) return { error: 'You have not answered this question yet.' };
      if (mine.correct) return { error: 'Your answer was right.' };
      delete sync(api).answers[c.caster];
      api.feed('Reholstered: you get another try at this question.', 'good', [c.caster]);
    },
  },
  {
    id: 'quick-draw.posse-pardon',
    name: 'Posse Pardon',
    category: 'advantage',
    description: 'One Voice only: when a teammate\'s wrong answer has locked your team out of the open question, the lock is lifted for everyone else on your team. That teammate still cannot answer it again.',
    target: 'teammate',
    modes: M,
    needs: ['teams', 'teamtry'],
    cost: 35,
    cooldownMs: 45_000,
    durationMs: 60_000,
    undoable: false,
    apply: (api, c, fx) => {
      const closed = questionOpen(api);
      if (closed) return closed;
      const t = target(c);
      const s = sync(api);
      if (!s.answers[t] || s.answers[t]!.correct) return { error: `${api.name(t)} has not answered this question wrong.` };
      const team = api.teamOf(c.caster);
      const mates = team ? api.members(team) : [];
      if (mates.some((id) => id !== t && s.answers[id] && !s.answers[id]!.correct)) return { error: 'Someone else on your team answered wrong too, so your team stays locked out.' };
      if (!mates.some((id) => id !== t && !s.answers[id])) return { error: 'Everyone else on your team has already answered.' };
      delete s.answers[t];
      // The pardoned teammate had their try; they sit out the rest of this question.
      fx!.data.iid = s.iid;
      fx!.endsAt = Math.min(fx!.endsAt, s.deadline + DEADLINE_GRACE_MS);
      api.feed(`Posse Pardon: your team can answer again. ${api.name(t)} sits this one out.`, 'good', mates);
    },
    hooks: {
      gate: (api, fx, _id, action) => {
        if (isAnswer(action) && sync(api).iid === fx.data.iid) return { block: 'You already had your try at this question (Posse Pardon).' };
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Sitting this one out', tone: 'info' }),
  },
  {
    id: 'quick-draw.duel-at-dawn',
    name: 'Duel at Dawn',
    category: 'troll',
    description: 'Call out an opponent: for 20 seconds, only you and they can answer. Everyone else\'s answers are refused. Needs at least three players.',
    target: 'everyone-else',
    modes: M,
    needs: ['sync'],
    params: [{ key: 'duelist', label: 'Who you call out', kind: 'player', filter: 'other' }],
    cost: 40,
    cooldownMs: 60_000,
    durationMs: 20_000,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const duelist = String(c.params.duelist);
      const shut = c.targets.filter((id) => id !== duelist);
      if (!shut.length) return { error: 'A duel needs at least one other player to watch it.' };
      fx!.targets = shut;
      fx!.data.text = `Duel: only ${api.name(c.caster)} and ${api.name(duelist)} can answer`;
      api.feed(`${api.name(c.caster)} called out ${api.name(duelist)}: a duel at dawn!`, 'big');
    },
    hooks: {
      gate: (_api, fx, _id, action) => (isAnswer(action) ? { block: `${String(fx.data.text)}. Wait for the duel to end.` } : undefined),
    },
    overlay: (fx) => ({ kind: 'badge', text: String(fx.data.text ?? 'Duel at dawn'), tone: 'bad' }),
  },
  {
    id: 'quick-draw.shaky-trigger',
    name: 'Shaky Trigger Finger',
    category: 'troll',
    description: 'For 40 seconds, every wrong answer an opponent gives costs them a point, as in Steady Hand (with the penalty already on, it costs a second point). Scores never drop below 0.',
    target: 'opponent',
    modes: M,
    needs: [...S, 'meter:misses'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 40_000,
    hooks: {
      delta: {
        misses: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0) return;
          const lost = -api.add('score', t, -d[t]!);
          if (lost > 0) api.feed(`${api.name(t)}'s shaky trigger finger cost them ${lost} ${lost === 1 ? 'point' : 'points'}.`, 'bad');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Shaky trigger: misses cost a point', tone: 'bad' }),
  },
  {
    id: 'quick-draw.buzzard-bounty',
    name: 'Buzzard\'s Bounty',
    category: 'economy',
    description: 'For 40 seconds, every wrong answer an opponent gives pays you a point (never the point that would reach the target to win).',
    target: 'opponent',
    modes: M,
    needs: [...S, 'meter:misses'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 40_000,
    hooks: {
      delta: {
        misses: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0 || !inGame(api, fx.caster)) return;
          const got = api.add('score', fx.caster, d[t]!);
          if (got > 0) api.feed(`${api.name(t)} missed, and ${api.name(fx.caster)}'s buzzard picked up ${got} ${got === 1 ? 'point' : 'points'}.`, 'info');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'A buzzard is circling', tone: 'bad' }),
  },
  {
    id: 'quick-draw.wanted-poster',
    name: 'Wanted Poster',
    category: 'troll',
    description: 'Put an opponent on a wanted poster: for 45 seconds, whoever else wins a round also takes a point from them (never the point that would reach the target to win).',
    target: 'opponent',
    modes: M,
    needs: S,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 45_000,
    priority: 12,
    apply: (api, c) => (api.get('score', target(c)) > 0 ? undefined : { error: `${api.name(target(c))} has no points to put a price on.` }),
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const t = target(fx);
          const win = (api.s.wins as { round: number; playerId: PlayerId }[]).at(-1);
          if (!win || win.round !== sync(api).round || win.playerId === t || Number(fx.data.round ?? -1) === win.round) return;
          const w = win.playerId;
          if ((d[w] ?? 0) <= 0 || api.get('score', t) + (d[t] ?? 0) < 1 || !belowTarget(api, w)) return;
          fx.data.round = win.round;
          d[t] = (d[t] ?? 0) - 1;
          d[w] = (d[w] ?? 0) + 1;
          api.feed(`${api.name(w)} collected a point from wanted ${api.name(t)}.`, 'info');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Wanted: a point on your head', tone: 'bad' }),
  },
];

defineCheats(cheats);
