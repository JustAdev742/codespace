import { DEADLINE_GRACE_MS, type SyncState } from '../../mechanics/syncRounds.ts';
import type { RoundWin } from '../../modes/quick-draw/index.ts';
import type { PlayerId } from '../../sdk/types.ts';
import { isAnswer, target } from '../cheats/kit.ts';
import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';

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
 *
 * The mode's rules, kept here: reaching the target is a win only the mode
 * hands out, so no cheat adds the point that would reach it (the score
 * meter stops one short, and bonuses check first so they never clip the
 * mode's own winning point). Chaos never records an answer or rewrites the
 * list of round wins; it can only take back a wrong answer (so its player
 * may try again) or refuse an answer before the mode sees it.
 */

const MODE = 'quick-draw';
const M = [MODE] as const;
const S = ['meter:score'] as const;

const sync = (api: ChaosApi): SyncState => api.s.sync;
const wins = (api: ChaosApi): RoundWin[] => api.s.wins;
const inGame = (api: ChaosApi, id: PlayerId) => api.ids().includes(id);
const points = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`;
const names = (api: ChaosApi, ids: PlayerId[]) => ids.map((id) => api.name(id)).join(', ');

/** Whether a point can still be added without reaching the target, which only the mode may hand out. */
function belowTarget(api: ChaosApi, id: PlayerId, extra = 1): boolean {
  const max = api.meter('score')?.max?.(api.s, id, api.ctx) ?? Number.MAX_SAFE_INTEGER;
  return api.get('score', id) + extra <= max;
}

function questionOpen(api: ChaosApi): { error: string } | null {
  const s = sync(api);
  return s.phase === 'question' && s.iid ? null : { error: 'No question is open right now.' };
}

/** The round a "this question" effect applies to: the open one, or the next if none is open. */
const roundOf = (api: ChaosApi): number => (sync(api).phase === 'question' ? sync(api).round : sync(api).round + 1);

/** End a "this question" effect once its question has closed. */
function endWithRound(api: ChaosApi, fx: ActiveEffect) {
  const s = sync(api);
  const r = Number(fx.data.round);
  if (s.round > r || (s.round === r && s.phase !== 'question' && s.phase !== 'intro')) api.endEffect(fx.eid, 'used');
}

/**
 * The round `id` has just won, inside the mode transaction that won it (a
 * delta hook on the score): the newest win is theirs, it is for the round
 * being played, their score went up, and this effect has not paid for it yet.
 */
function justWon(api: ChaosApi, fx: ActiveEffect, id: PlayerId, d: Record<string, number>): RoundWin | null {
  const win = wins(api).at(-1);
  if (!win || win.playerId !== id || win.round !== sync(api).round || (d[id] ?? 0) <= 0 || Number(fx.data.paid ?? -1) === win.round) return null;
  return win;
}

/** Add one bonus point to the round winner in a score delta hook, if it would not reach the target. */
function bonusPoint(api: ChaosApi, fx: ActiveEffect, id: PlayerId, win: RoundWin, d: Record<string, number>): boolean {
  if (!belowTarget(api, id)) return false;
  fx.data.paid = win.round;
  d[id] = (d[id] ?? 0) + 1;
  return true;
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
  /* ------------------------------ who may answer ------------------------------ */
  {
    id: 'quick-draw.turnabout',
    name: 'Turnabout',
    category: 'troll',
    description: 'Turn the open question around: everyone who has answered it wrong (you included) gets another try, and every other player who has not answered yet is locked out of it. A point lost to the penalty stays lost. Needs someone who has answered wrong and someone else still to answer.',
    target: 'everyone-else',
    modes: M,
    needs: ['sync'],
    cost: 40,
    cooldownMs: 60_000,
    durationMs: 30_000,
    stacking: 'reject',
    undoable: false,
    apply: (api, c, fx) => {
      const closed = questionOpen(api);
      if (closed) return closed;
      const s = sync(api);
      const missed = api.ids().filter((id) => s.answers[id] && !s.answers[id]!.correct);
      if (!missed.length) return { error: 'Nobody has answered this question wrong yet.' };
      const locked = c.targets.filter((id) => !s.answers[id]);
      if (!locked.length) return { error: 'Everyone else has already answered this question.' };
      for (const id of missed) delete s.answers[id];
      fx!.targets = locked;
      fx!.data.iid = s.iid;
      fx!.endsAt = Math.min(fx!.endsAt, s.deadline + DEADLINE_GRACE_MS);
      api.feed(`Turnabout! ${names(api, missed)} can try this question again, and ${names(api, locked)} cannot answer it.`, 'big');
    },
    hooks: {
      gate: (api, fx, _id, action) => (isAnswer(action) && sync(api).iid === fx.data.iid ? { block: 'Turnabout: you are locked out of this question.' } : undefined),
    },
    overlay: () => ({ kind: 'badge', text: 'Turnabout: locked out of this question', tone: 'bad' }),
  },
  {
    id: 'quick-draw.lasso',
    name: 'Lasso',
    category: 'troll',
    description: 'Lasso an opponent: for 30 seconds, they cannot answer a question until someone else has answered it wrong.',
    target: 'opponent',
    modes: M,
    needs: ['sync'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 30_000,
    hooks: {
      gate: (api, _fx, id, action) => {
        const s = sync(api);
        if (!isAnswer(action) || s.phase !== 'question') return;
        // While the question is open, any answer on it is a wrong one: a right answer closes it.
        if (Object.entries(s.answers).some(([pid, a]) => pid !== id && !a.correct)) return;
        return { block: 'Lassoed: you can answer once someone else has answered this question wrong.' };
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Lassoed: wait for someone to miss', tone: 'bad' }),
  },
  {
    id: 'quick-draw.saddle-sore',
    name: 'Saddle Sore',
    category: 'troll',
    description: 'For 45 seconds, every wrong answer an opponent gives also makes them sit out the next question. A miss late on still costs them the next question, even once the 45 seconds are up.',
    target: 'opponent',
    modes: M,
    // Watches the misses meter, which every Quick Draw game has.
    needs: ['sync'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 45_000,
    tickMs: 1000,
    apply: (_api, _c, fx) => void (fx!.data.until = fx!.endsAt),
    hooks: {
      delta: {
        misses: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0 || api.now() > Number(fx.data.until)) return;
          fx.data.sitOut = sync(api).round + 1;
          fx.endsAt = Math.max(fx.endsAt, api.now() + 2000);
          api.feed(`${api.name(t)} is saddle sore and sits out the next question.`, 'bad');
        },
      },
      gate: (api, fx, _id, action) => (isAnswer(action) && sync(api).round === Number(fx.data.sitOut ?? -1) ? { block: 'Saddle sore: you sit out this question after your miss.' } : undefined),
      // Waits for the question they sit out to close, then ends (but not before its own 45 seconds).
      tick: (api, fx) => {
        const s = sync(api);
        const out = fx.data.sitOut === undefined ? null : Number(fx.data.sitOut);
        const waiting = out !== null && (s.round < out || (s.round === out && (s.phase === 'question' || s.phase === 'intro')));
        if (waiting) fx.endsAt = Math.max(fx.endsAt, api.now() + 2000);
        else if (api.now() >= Number(fx.data.until)) api.endEffect(fx.eid, 'expired');
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Saddle sore: a miss costs you the next question', tone: 'bad' }),
  },
  {
    id: 'quick-draw.rookie-round',
    name: 'Rookie Round',
    category: 'round',
    description: 'On the open question (or the next, if none is open), only players who have not won a round yet this game can answer. Needs someone who has won a round and someone who has not.',
    target: 'room',
    hostile: true,
    modes: M,
    needs: ['sync'],
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 90_000,
    tickMs: 250,
    stacking: 'reject',
    apply: (api, _c, fx) => {
      const won = new Set(wins(api).map((w) => w.playerId));
      const veterans = api.ids().filter((id) => won.has(id));
      if (!veterans.length) return { error: 'Nobody has won a round yet.' };
      if (veterans.length === api.ids().length) return { error: 'Everyone here has won a round already.' };
      fx!.targets = veterans;
      fx!.data.round = roundOf(api);
      api.feed(`Rookie round! Only players who have not won a round yet can answer ${sync(api).phase === 'question' ? 'this question' : 'the next question'}.`, 'big');
    },
    hooks: {
      tick: endWithRound,
      gate: (api, fx, _id, action) => (isAnswer(action) && sync(api).round === Number(fx.data.round) ? { block: 'Rookie round: only players who have not won a round yet can answer this one.' } : undefined),
    },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Rookie round: round winners sit this one out', tone: 'info' }),
  },
  /* -------------------------------- round wins -------------------------------- */
  {
    id: 'quick-draw.tumbleweed-jackpot',
    name: 'Tumbleweed Jackpot',
    category: 'round',
    description: 'For 60 seconds, every round that closes with nobody winning it rolls a point into a jackpot, and the next player to win a round takes the jackpot on top of their own point (never the point that would reach the target to win). A jackpot still unclaimed when the 60 seconds are up is lost.',
    target: 'room',
    hostile: false,
    modes: M,
    needs: ['sync', ...S],
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 60_000,
    tickMs: 250,
    stacking: 'reject',
    apply: (api, _c, fx) => void Object.assign(fx!.data, { played: sync(api).roundsPlayed, pot: 0 }),
    hooks: {
      // Watch for each round closing: with no winner it feeds the jackpot, with one it pays out.
      tick: (api, fx) => {
        const s = sync(api);
        if (s.roundsPlayed <= Number(fx.data.played)) return;
        fx.data.played = s.roundsPlayed;
        const pot = Number(fx.data.pot);
        const win = wins(api).find((w) => w.round === s.round);
        if (!win) {
          fx.data.pot = pot + 1;
          api.feed(`A tumbleweed rolls by: nobody won that round, so the jackpot is now ${points(pot + 1)}.`, 'info');
          return;
        }
        if (!pot || !inGame(api, win.playerId)) return;
        const got = api.add('score', win.playerId, pot);
        if (got <= 0) return;
        fx.data.pot = pot - got;
        api.feed(`${api.name(win.playerId)} won the tumbleweed jackpot: ${points(got)} on top of the round.`, 'big');
      },
      end: (api, fx) => {
        const pot = Number(fx.data.pot ?? 0);
        if (pot > 0) api.feed(`The tumbleweed jackpot of ${points(pot)} rolled away unclaimed.`, 'info');
      },
    },
    overlayFor: 'all',
    overlay: (fx) => ({ kind: 'badge', text: `Tumbleweed jackpot: ${points(Number(fx.data.pot ?? 0))}`, tone: 'info' }),
  },
  {
    id: 'quick-draw.lightning-draw',
    name: 'Lightning Draw',
    category: 'score',
    description: 'For 45 seconds, every round you win inside the first quarter of the question\'s time (5 seconds on a 20-second question) scores an extra point (never the point that would reach the target to win).',
    target: 'self',
    modes: M,
    needs: ['sync', ...S],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 45_000,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const me = fx.caster;
          const win = justWon(api, fx, me, d);
          const s = sync(api);
          if (!win || win.responseMs > (s.deadline - s.startedAt) / 4 || !bonusPoint(api, fx, me, win, d)) return;
          api.feed(`Lightning draw! ${api.name(me)} won in ${(win.responseMs / 1000).toFixed(1)} s and scores an extra point.`, 'good');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Lightning draw: quick wins score double', tone: 'good' }),
  },
  {
    id: 'quick-draw.winning-streak',
    name: 'Winning Streak',
    category: 'score',
    description: 'For 60 seconds, every round you win straight after winning the round before it scores an extra point (never the point that would reach the target to win).',
    target: 'self',
    modes: M,
    needs: ['sync', ...S],
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 60_000,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const me = fx.caster;
          const win = justWon(api, fx, me, d);
          const before = wins(api).at(-2);
          if (!win || before?.playerId !== me || before.round !== win.round - 1 || !bonusPoint(api, fx, me, win, d)) return;
          api.feed(`Winning streak! ${api.name(me)} took two rounds in a row and scores an extra point.`, 'good');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Winning streak: back-to-back wins score double', tone: 'good' }),
  },
  {
    id: 'quick-draw.bold-claim',
    name: 'Bold Claim',
    category: 'score',
    description: 'Stake a claim on the open question (or the next, if none is open): if you win it, it scores 2 points instead of 1; if you answer it wrong, you lose a point, on top of any penalty (never below 0). Never the point that would reach the target to win.',
    target: 'self',
    modes: M,
    needs: [...S, 'sync', 'meter:misses'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 90_000,
    tickMs: 250,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const s = sync(api);
      if (s.phase === 'question' && s.answers[c.caster]) return { error: 'You have already answered this question.' };
      fx!.data.round = roundOf(api);
    },
    hooks: {
      tick: endWithRound,
      delta: {
        score: (api, fx, d) => {
          const me = fx.caster;
          const win = justWon(api, fx, me, d);
          if (!win || win.round !== Number(fx.data.round)) return;
          api.endEffect(fx.eid, 'used');
          if (bonusPoint(api, fx, me, win, d)) api.feed(`${api.name(me)} made good on a bold claim: 2 points for that round.`, 'good');
        },
        misses: (api, fx, d) => {
          const me = fx.caster;
          if ((d[me] ?? 0) <= 0 || sync(api).round !== Number(fx.data.round)) return;
          api.endEffect(fx.eid, 'used');
          const lost = -api.add('score', me, -1);
          api.feed(lost > 0 ? `${api.name(me)}'s bold claim fell flat: a wrong answer, and a point lost.` : `${api.name(me)}'s bold claim fell flat, but they had no point to lose.`, 'bad');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Bold claim: win it for 2, miss it for -1', tone: 'info' }),
  },
];

defineCheats(cheats);
