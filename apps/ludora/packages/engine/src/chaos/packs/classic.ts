import type { Difficulty } from '@ludora/shared';
import { DEADLINE_GRACE_MS, type SyncState } from '../../mechanics/syncRounds.ts';
import { chainPoints, classicPoints, climbFactor, POT_PER_PLAYER, potShares } from '../../modes/classic/index.ts';
import { roundTo10 } from '../../modes/rules.ts';
import type { PlayerId } from '../../sdk/types.ts';
import { share, target } from '../cheats/kit.ts';
import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';

/*
 * Cheats that only make sense in Classic: its answer streaks (streak bonus
 * and Glim Chain), the question list (encores, bonus and scrapped
 * questions), the knockout rules (Sudden Death, Fading Lights), comeback
 * points, the wrong-answer penalty and In Unison team bonuses. Clock
 * changes, streak saves, boosts and resets, revives and answer blocking are
 * universal cheats, so they are not repeated here.
 *
 * Classic's state as cheats see it: `s.sync` (syncRounds), `s.out` (round a
 * player was knocked out, -1 for late joiners who only watch), `s.baseRounds`
 * (questions before encores), `s.boosted` (comeback doubles this question),
 * `s.penalties` (penalty points lost this question), `s.teamBonus`.
 */

const MODE = 'classic';
const M = [MODE] as const;
const S = ['meter:score'] as const;
/** Streaks only matter when the streak bonus or the streak multiplier is on. */
const STREAK = ['meter:streak', 'streaks'] as const;

const sync = (api: ChaosApi): SyncState => api.s.sync;
const isOut = (api: ChaosApi, id: PlayerId) => api.s.out[id] !== undefined;
type Settings = { scale?: string; comeback?: boolean; unisonBonus?: number; speedBonus?: boolean; streakBonus?: boolean; scoring?: string };
const settings = (api: ChaosApi) => api.ctx.settings as Settings;
const scale = (api: ChaosApi) => Number(settings(api).scale) || 1;
/** Still in when the question that just closed was scored: the mode shares pots and checks unison before it knocks anyone out. */
const inAtClose = (api: ChaosApi, id: PlayerId) => api.s.out[id] === undefined || api.s.out[id] === sync(api).round;
/** How much of a question an answer earns in Split the Pot (as the mode counts it). */
const creditOf = (a: { correct: boolean; partial: number }) => (a.correct ? 1 : a.partial >= 0.5 ? a.partial : 0);
const fmt = (n: number) => n.toLocaleString('en-US');
const isEncore = (api: ChaosApi) => sync(api).round >= api.s.baseRounds;
const difficultyOf = (api: ChaosApi, qid: string | undefined): Difficulty | undefined => (qid ? api.ctx.questions.get(qid).difficulty : undefined);
/** Ladder of Lights keeps the questions in this order of difficulty (no difficulty counts as medium). */
const climbRank = (d: Difficulty | undefined) => (d === 'easy' ? 0 : d === 'hard' ? 2 : 1);
const scoringOf = (api: ChaosApi) => {
  const v = settings(api).scoring;
  return v === 'streak' || v === 'pot' || v === 'climb' ? v : 'standard';
};

/** The question a "this question" effect is for: the open one, or the next if none is open. */
const roundOf = (api: ChaosApi) => (sync(api).phase === 'question' ? sync(api).round : sync(api).round + 1);
/** End a "this question" effect once its question has closed (or been passed). */
function endWithRound(api: ChaosApi, fx: ActiveEffect) {
  const s = sync(api);
  const round = Number(fx.data.round);
  if (s.phase === 'done' || s.round > round || (s.round === round && s.phase !== 'question')) api.endEffect(fx.eid, 'used');
}

/* Classic's own score rule, for cheats that re-score an answer with a different answer time. */
type RoundResult = { correct: boolean; partial: number; responseMs: number; limitMs: number; streak: number };

/**
 * What the mode's score rule gives `id` for an answer like `r` to the open
 * question: the scoring option, the climb's difficulty factor, half points
 * for an encore and comeback doubles, exactly as the mode works them out.
 * The wrong-answer penalty is not points, so it is not part of this.
 */
function pointsFor(api: ChaosApi, id: PlayerId, r: RoundResult): number {
  const st = settings(api);
  const s = sync(api);
  const speedBonus = Boolean(st.speedBonus);
  let pts = 0;
  switch (scoringOf(api)) {
    case 'standard':
      pts = classicPoints(r, { speedBonus, streakBonus: Boolean(st.streakBonus), scale: scale(api) });
      break;
    case 'streak':
      pts = chainPoints(r, { speedBonus, scale: scale(api) });
      break;
    case 'climb':
      pts = roundTo10(classicPoints(r, { speedBonus, streakBonus: Boolean(st.streakBonus), scale: scale(api) }) * climbFactor(difficultyOf(api, s.order[s.round])));
      break;
    case 'pot':
      return 0;
  }
  if (pts > 0 && isEncore(api)) pts = roundTo10(pts / 2);
  if (pts > 0 && st.comeback && api.s.boosted.includes(id)) pts *= 2;
  return Math.max(0, Math.round(pts));
}

/**
 * Re-score the answer `id` has just given (in this very move) as if it had
 * taken `responseMs`, and return the extra points (negative for fewer). Null
 * when there is no such answer, or when the points on it are not what the
 * mode's own rule gives (something else already changed them), so a cheat
 * never re-scores an answer it cannot account for.
 */
function rescore(api: ChaosApi, id: PlayerId, responseMs: (a: { responseMs: number }, limitMs: number) => number): number | null {
  const s = sync(api);
  const a = s.answers[id];
  if (!a || a.at !== api.now()) return null;
  const limitMs = s.deadline - s.startedAt;
  const base = { correct: a.correct, partial: a.partial, limitMs, streak: s.streaks[id] ?? 0 };
  if (pointsFor(api, id, { ...base, responseMs: a.responseMs }) !== a.points) return null;
  const extra = pointsFor(api, id, { ...base, responseMs: Math.max(0, Math.min(limitMs, responseMs(a, limitMs))) }) - a.points;
  if (!extra) return 0;
  a.points += extra;
  // If this answer closed the question, the leaderboard's gain was already taken from it.
  if (s.phase !== 'question') s.lastGain[id] = a.points;
  return extra;
}

/** Error unless `id` can still answer the open question. */
function canStillAnswer(api: ChaosApi, id: PlayerId): { error: string } | null {
  const s = sync(api);
  if (s.phase !== 'question' || !s.iid) return { error: 'No question is open right now.' };
  if (isOut(api, id)) return { error: `${api.name(id)} is out of this game.` };
  if (s.answers[id]) return { error: `${api.name(id)} has already answered this question.` };
  return null;
}

/* ------------------------------- streaks ------------------------------- */

const streaks: CheatDef[] = [
  {
    id: 'classic.streak-swap',
    name: 'Streak Swap',
    category: 'advantage',
    description: 'You and an opponent trade answer streaks, along with the streak bonus (or Glim Chain multiplier) each one is building towards.',
    target: 'opponent',
    modes: M,
    needs: STREAK,
    cost: 30,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      const mine = api.get('streak', c.caster);
      const theirs = api.get('streak', t);
      if (mine === theirs) return { error: `You and ${api.name(t)} already have the same streak.` };
      api.set('streak', c.caster, theirs);
      api.set('streak', t, mine);
    },
  },
  {
    id: 'classic.cold-streak',
    name: 'Cold Streak',
    category: 'troll',
    description: 'For 30 seconds, an opponent\'s answer streak cannot grow, so their streak bonus (or Glim Chain multiplier) stops climbing. Their points for each answer still count.',
    target: 'opponent',
    modes: M,
    needs: STREAK,
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 30_000,
    priority: 40,
    hooks: { delta: { streak: (_api, fx, d) => void ((d[target(fx)] ?? 0) > 0 && (d[target(fx)] = 0)) } },
    overlay: () => ({ kind: 'badge', text: 'Streak frozen', tone: 'bad' }),
  },
  {
    id: 'classic.cash-in-streak',
    name: 'Cash In the Streak',
    category: 'economy',
    description: 'Turn your answer streak into points now: 100 points for each answer in it (200 with Double points). Your streak goes back to 0.',
    target: 'self',
    modes: M,
    needs: [...S, ...STREAK],
    cost: 20,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const n = api.get('streak', c.caster);
      if (n <= 0) return { error: 'You have no streak to cash in.' };
      const got = api.addScore(c.caster, n * 100 * scale(api));
      api.set('streak', c.caster, 0);
      api.feed(`${api.name(c.caster)} cashed in a streak of ${n} for ${got} points.`, 'good');
    },
  },
];

/* ------------------------------ questions ------------------------------ */

const questions: CheatDef[] = [
  {
    id: 'classic.curtain-call',
    name: 'Curtain Call',
    category: 'round',
    description: 'Encore games only: the question on screen (or the one just answered) comes back once at the end of the game as an encore, for half points.',
    target: 'room',
    hostile: false,
    modes: M,
    needs: ['encore'],
    cost: 20,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api) => {
      const s = sync(api);
      if (s.phase !== 'question' && s.phase !== 'reveal') return { error: 'Wait for a question to be on screen.' };
      if (s.round >= api.s.baseRounds) return { error: 'This question is already an encore.' };
      const qid = s.order[s.round]!;
      if (s.order.slice(s.round + 1).includes(qid)) return { error: 'This question is already coming back as an encore.' };
      s.order.push(qid);
      api.feed('Curtain call: this question comes back as an encore at the end.', 'info');
    },
  },
  {
    id: 'classic.cut-the-encore',
    name: 'Cut the Encore',
    category: 'round',
    description: 'Encore games only: throws out the last encore waiting at the end of the game, so that question does not come back. Never the last question left.',
    target: 'room',
    hostile: false,
    modes: M,
    needs: ['encore'],
    cost: 20,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api) => {
      const s = sync(api);
      if (s.phase === 'done') return { error: 'The game is over.' };
      const last = s.order.length - 1;
      if (last <= s.round || last < api.s.baseRounds) return { error: 'No encore is waiting to be played.' };
      if (last - s.round < 2) return { error: 'That is the last question left, so it stays.' };
      s.order.pop();
      api.feed('An encore was cut: one question fewer at the end.', 'info');
    },
  },
  {
    id: 'classic.bonus-question',
    name: 'Bonus Round Ticket',
    category: 'round',
    description: 'Adds one more question from the set (one this game was not going to ask) before any encores, so the game runs one question longer.',
    target: 'room',
    hostile: false,
    modes: M,
    needs: ['sync'],
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const s = sync(api);
      if (s.phase === 'done') return { error: 'The game is over.' };
      if (s.round >= api.s.baseRounds) return { error: 'The encores have started, so no more questions can be added.' };
      const spare = api.ctx.questions.ids().filter((q) => !s.order.includes(q));
      if (!spare.length) return { error: 'Every question in the set is already in this game.' };
      s.order.splice(api.s.baseRounds, 0, api.rng.pick(spare));
      api.s.baseRounds++;
      api.feed('A bonus question was added to the game.', 'info');
    },
  },
  {
    id: 'classic.scrap-question',
    name: 'Scrap the Next Card',
    category: 'round',
    description: 'Throws out the next question before anyone sees it, so the game is one question shorter. Never the last question left.',
    target: 'room',
    hostile: false,
    modes: M,
    needs: ['sync'],
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const s = sync(api);
      if (s.phase === 'done') return { error: 'The game is over.' };
      const next = s.round + 1;
      if (next >= api.s.baseRounds) return { error: 'The next question is an encore (or there is none), so there is nothing to scrap.' };
      if (s.order.length - 1 - s.round < 2) return { error: 'That is the last question left, so it stays.' };
      s.order.splice(next, 1);
      api.s.baseRounds--;
      api.feed('The next question was scrapped.', 'info');
    },
  },
];

/* ------------------------------ knockouts ------------------------------ */

const knockouts: CheatDef[] = [
  {
    id: 'classic.spotlight-immunity',
    name: 'Spotlight Immunity',
    category: 'advantage',
    description: 'Sudden Death and Fading Lights only: for 40 seconds, the first time the game would knock out a player you choose (you or anyone else), they stay in. Nobody is knocked out in their place. It cannot save them when everyone else is out too, because that would hand them the game.',
    target: 'player',
    modes: M,
    needs: ['knockouts'],
    cost: 40,
    cooldownMs: 90_000,
    durationMs: 40_000,
    priority: 50,
    apply: (api, c) => (isOut(api, target(c)) ? { error: `${api.name(target(c))} is already out.` } : undefined),
    hooks: {
      delta: {
        standing: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) >= 0) return;
          // Keeping the only player left standing in would decide the game, which is never chaos's call.
          if (!api.ids().some((id) => id !== t && !isOut(api, id))) return;
          d[t] = 0;
          api.feed(`${api.name(t)} was about to go out, but Spotlight Immunity kept them in the game.`, 'big');
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Immune to knockouts', tone: 'good' }),
  },
];

/* ---------------------------- rule options ----------------------------- */

const rules: CheatDef[] = [
  {
    id: 'classic.underdog-disguise',
    name: 'Underdog Disguise',
    category: 'advantage',
    description: 'Comeback points only: you score double for the open question, as if you were in the bottom half of the leaderboard. Cast it before you answer.',
    target: 'self',
    modes: M,
    needs: ['comeback'],
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const no = canStillAnswer(api, c.caster);
      if (no) return no;
      if (api.s.boosted.includes(c.caster)) return { error: 'You already score double for this question.' };
      api.s.boosted.push(c.caster);
      api.feed('Underdog Disguise: you score double for this question.', 'good', [c.caster]);
    },
  },
  {
    id: 'classic.revoke-comeback',
    name: 'Revoke the Comeback',
    category: 'troll',
    description: 'Comeback points only: an opponent who would score double for the open question (bottom half of the leaderboard) loses that boost. Only before they answer.',
    target: 'opponent',
    modes: M,
    needs: ['comeback'],
    cost: 25,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = canStillAnswer(api, t);
      if (no) return no;
      if (!api.s.boosted.includes(t)) return { error: `${api.name(t)} does not have comeback points for this question.` };
      api.s.boosted = api.s.boosted.filter((id: PlayerId) => id !== t);
      api.feed('Your comeback double points for this question were revoked.', 'bad', [t]);
    },
  },
  {
    id: 'classic.penalty-collector',
    name: 'Ember Collector',
    category: 'economy',
    description: 'Wrong-answer penalty games only: for 40 seconds, the points other players lose to the penalty are paid to you.',
    target: 'self',
    modes: M,
    needs: [...S, 'losses'],
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 40_000,
    // Runs before other effects bend the change, so it only ever collects real penalties.
    priority: 5,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          if (!api.ids().includes(fx.caster)) return;
          let got = 0;
          for (const [id, v] of Object.entries(d)) if (id !== fx.caster && v < 0 && (api.s.penalties[id] ?? 0) > 0) got += -v;
          if (got) d[fx.caster] = (d[fx.caster] ?? 0) + got;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Collecting penalties', tone: 'good' }),
  },
  {
    id: 'classic.off-key',
    name: 'Off-Key',
    category: 'troll',
    description: 'In Unison only: the next unison bonus another team earns (within 60 seconds) goes to your team instead.',
    target: 'enemy-team',
    modes: M,
    needs: ['teams', 'unison'],
    cost: 35,
    cooldownMs: 75_000,
    durationMs: 60_000,
    priority: 10,
    apply: (api, c) => (api.teamOf(c.caster) ? undefined : { error: 'You are not on a team.' }),
    hooks: {
      delta: {
        teamBonus: (api, fx, d) => {
          const mine = api.teamOf(fx.caster);
          const theirs = fx.team;
          if (!mine || !theirs || (d[theirs] ?? 0) <= 0) return;
          const bonus = d[theirs]!;
          d[mine] = (d[mine] ?? 0) + bonus;
          d[theirs] = 0;
          const name = (id: string) => api.teams().find((t) => t.id === id)?.name ?? 'a team';
          api.feed(`Off-Key! The ${name(theirs)}' unison bonus of ${bonus} went to the ${name(mine)}.`, 'big');
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Singing off-key', tone: 'bad' }),
  },
  {
    id: 'classic.stand-in-singer',
    name: 'Stand-In Singer',
    category: 'advantage',
    description: 'In Unison only: for 60 seconds, the first question that every player on your team but one gets right still earns your team the unison bonus. Your team needs at least two players.',
    target: 'my-team',
    modes: M,
    needs: ['teams', 'unison'],
    cost: 35,
    cooldownMs: 75_000,
    durationMs: 60_000,
    apply: (_api, c) => (c.targets.length >= 2 ? undefined : { error: 'Your team needs at least two players for a stand-in.' }),
    hooks: {
      delta: {
        closed: (api, fx, d) => {
          if ((d.game ?? 0) <= 0 || !fx.team) return;
          const s = sync(api);
          // The same players the mode's own unison check counts.
          const members = api.players().filter((p) => p.teamId === fx.team && p.connected && inAtClose(api, p.id) && p.joinedAt <= s.startedAt);
          if (members.length < 2) return;
          const right = members.filter((p) => s.answers[p.id]?.correct).length;
          // All right: the mode paid the bonus itself. Two or more wrong: no stand-in can cover that.
          if (right !== members.length - 1) return;
          const got = api.add('teamBonus', fx.team, Number(settings(api).unisonBonus) || 0);
          if (got <= 0) return;
          api.feed(`A stand-in singer covered the missing voice: +${got} unison bonus for the ${api.teams().find((t) => t.id === fx.team)?.name ?? 'team'}.`, 'good');
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Stand-in singer ready', tone: 'good' }),
  },
  {
    id: 'classic.double-dip',
    name: 'Double Dip',
    category: 'score',
    description: 'Split the Pot only: when the open question closes, your answer counts twice in sharing out its pot, as if two of you had answered, so everyone else\'s share of the same pot shrinks to make room. Only if your answer earns a share.',
    target: 'self',
    modes: M,
    needs: ['pot'],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 60_000,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const s = sync(api);
      if (s.phase !== 'question') return { error: 'No question is open right now.' };
      if (isOut(api, c.caster)) return { error: 'You are out of this game.' };
      fx!.data.round = s.round;
    },
    hooks: {
      delta: {
        closed: (api, fx, d) => {
          if ((d.game ?? 0) <= 0) return;
          const s = sync(api);
          api.endEffect(fx.eid, 'used');
          if (s.round !== Number(fx.data.round)) return;
          const credits: Record<PlayerId, number> = {};
          for (const [pid, a] of Object.entries(s.answers)) credits[pid] = creditOf(a);
          const mine = credits[fx.caster] ?? 0;
          if (mine <= 0) {
            api.feed('Double Dip: your answer earned no share of the pot, so there was nothing to double.', 'info', [fx.caster]);
            return;
          }
          if (Object.values(credits).filter((c) => c > 0).length < 2) {
            api.feed('Double Dip: you had the whole pot to yourself anyway.', 'info', [fx.caster]);
            return;
          }
          // The pot exactly as the mode worked it out when the question closed.
          const inGame = api.players().filter((p) => inAtClose(api, p.id)).length;
          const pot = POT_PER_PLAYER * Math.max(1, inGame) * scale(api) * (s.round >= api.s.baseRounds ? 0.5 : 1);
          const shares = potShares(pot, { ...credits, [fx.caster]: mine * 2 });
          for (const pid of Object.keys(credits)) {
            const a = s.answers[pid]!;
            if (!(credits[pid]! > 0)) continue;
            const want = (shares[pid] ?? 0) * (settings(api).comeback && api.s.boosted.includes(pid) ? 2 : 1);
            const moved = api.add('score', pid, want - a.points);
            a.points += moved;
            s.lastGain[pid] = a.points;
          }
          api.feed(`${api.name(fx.caster)} double dipped: their answer counted twice in sharing the pot.`, 'big');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Double dipping the pot', tone: 'good' }),
  },
];

/* ------------------------------- the clock ------------------------------ */

/** Speed only scores with the speed bonus on, outside Split the Pot, and not in Fading Lights (see the adapter's 'speed bonus'). */
const SPEED = [...S, 'speed bonus'] as const;

const clock: CheatDef[] = [
  {
    id: 'classic.stopped-clock',
    name: 'Stopped Clock',
    category: 'score',
    description: 'Your answer to the open question (or the next, if none is open) scores the whole speed bonus, as if you had answered the moment it appeared. Cast it before you answer. Only with the speed bonus on, and not in Split the Pot or Fading Lights.',
    target: 'self',
    modes: M,
    needs: SPEED,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 90_000,
    tickMs: 250,
    stacking: 'reject',
    // Before multipliers (20), so they multiply the re-scored answer.
    priority: 5,
    apply: (api, c, fx) => {
      const s = sync(api);
      if (s.phase === 'done') return { error: 'The game is over.' };
      if (isOut(api, c.caster)) return { error: 'You are out of this game.' };
      if (s.phase === 'question' && s.answers[c.caster]) return { error: 'You have already answered this question.' };
      fx!.data.round = roundOf(api);
    },
    hooks: {
      tick: endWithRound,
      delta: {
        score: (api, fx, d) => {
          const me = fx.caster;
          if ((d[me] ?? 0) <= 0 || sync(api).round !== Number(fx.data.round)) return;
          const extra = rescore(api, me, () => 0);
          if (extra === null) return;
          api.endEffect(fx.eid, 'used');
          if (extra <= 0) return;
          d[me]! += extra;
          api.feed(`Stopped Clock: your answer scored the whole speed bonus, ${fmt(extra)} more points.`, 'good', [me]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Stopped clock: full speed bonus', tone: 'good' }),
  },
  {
    id: 'classic.tortoise-round',
    name: 'Tortoise Round',
    category: 'round',
    description: 'On the open question (or the next, if none is open), the speed bonus runs backwards for everyone: the slower a right answer, the more it scores, so an answer in the last moment gets the whole bonus and an instant one gets none. Only with the speed bonus on, and not in Split the Pot or Fading Lights.',
    target: 'room',
    modes: M,
    needs: SPEED,
    cost: 35,
    cooldownMs: 75_000,
    durationMs: 90_000,
    tickMs: 250,
    stacking: 'reject',
    priority: 5,
    apply: (api, _c, fx) => {
      const s = sync(api);
      if (s.phase === 'done') return { error: 'The game is over.' };
      const round = roundOf(api);
      if (round >= s.order.length) return { error: 'There is no question left to play.' };
      if (s.phase === 'question' && Object.keys(s.answers).length) return { error: 'Someone has already answered this question. Cast it before anyone answers.' };
      fx!.data.round = round;
    },
    hooks: {
      tick: endWithRound,
      delta: {
        score: (api, fx, d) => {
          if (sync(api).round !== Number(fx.data.round)) return;
          for (const id of Object.keys(d)) {
            if ((d[id] ?? 0) <= 0) continue;
            const extra = rescore(api, id, (a, limitMs) => limitMs - a.responseMs);
            if (extra) d[id]! += extra;
          }
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Tortoise round: slow answers score more', tone: 'info' }),
    overlayFor: 'all',
  },
];

/* --------------------------- the question list -------------------------- */

const deck: CheatDef[] = [
  {
    id: 'classic.fresh-deal',
    name: 'Fresh Card Deal',
    category: 'round',
    description: 'The question on screen is swapped for one from the set that this game was not going to ask, with a fresh clock. Only while nobody has answered it, and never an encore. In Ladder of Lights the new question has the same difficulty.',
    target: 'room',
    hostile: false,
    modes: M,
    needs: ['sync'],
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const s = sync(api);
      if (s.phase !== 'question' || !s.iid) return { error: 'No question is open right now.' };
      if (Object.keys(s.answers).length) return { error: 'Someone has already answered this question, so it stays.' };
      if (isEncore(api)) return { error: 'This is an encore, a question coming back, so it stays.' };
      const qid = s.order[s.round]!;
      if (s.order.slice(s.round + 1).includes(qid)) return { error: 'This question is due to come back as an encore, so it stays.' };
      const rank = scoringOf(api) === 'climb' ? climbRank(difficultyOf(api, qid)) : null;
      const spare = api.ctx.questions.ids().filter((q) => !s.order.includes(q) && (rank === null || climbRank(difficultyOf(api, q)) === rank));
      if (!spare.length) return { error: 'Every question in the set that could take its place is already in this game.' };
      const next = api.rng.pick(spare);
      // Exactly what the mode does when it opens a question.
      s.order[s.round] = next;
      s.iid = api.ctx.questions.present(next);
      s.answers = {};
      s.startedAt = api.now();
      s.deadline = s.startedAt + api.ctx.questions.timeLimitMs(s.iid);
      s.phaseEndsAt = s.deadline;
      api.ctx.setTimer('sync', s.deadline + DEADLINE_GRACE_MS);
      api.feed('Fresh deal: the question on screen was swapped for a new one, with a fresh clock.', 'info');
    },
  },
  {
    id: 'classic.sneak-preview',
    name: 'Sneak Preview',
    category: 'advantage',
    description: 'Your screen shows the words of the next question (not its choices) until it opens, so you can start thinking early. It disappears if the next question changes.',
    target: 'self',
    modes: M,
    needs: ['sync'],
    cost: 25,
    cooldownMs: 50_000,
    durationMs: 60_000,
    tickMs: 250,
    apply: (api, _c, fx) => {
      const s = sync(api);
      if (s.phase === 'done') return { error: 'The game is over.' };
      const next = s.order[s.round + 1];
      if (!next) return { error: 'This is the last question.' };
      fx!.data.round = s.round;
      fx!.data.qid = next;
      fx!.data.text = `Coming up next: ${api.ctx.questions.get(next).prompt}`;
    },
    hooks: {
      // The preview is of one question: it goes once that question opens, or when it is no longer next.
      tick: (api, fx) => {
        const s = sync(api);
        if (s.round !== Number(fx.data.round) || s.order[s.round + 1] !== fx.data.qid) api.endEffect(fx.eid, 'used');
      },
    },
    overlay: (fx) => ({ kind: 'banner', text: String(fx.data.text ?? ''), tone: 'info' }),
  },
];

/* --------------------------- knockouts and pots ------------------------- */

const twists: CheatDef[] = [
  {
    id: 'classic.reprieve-bell',
    name: 'Reprieve Bell',
    category: 'round',
    description: 'Sudden Death and Fading Lights only: nobody is knocked out when the open question (or the next, if none is open) closes. The knockout rule is back for the question after that.',
    target: 'room',
    hostile: false,
    modes: M,
    needs: ['knockouts'],
    cost: 40,
    cooldownMs: 90_000,
    durationMs: 90_000,
    tickMs: 250,
    stacking: 'reject',
    priority: 50,
    apply: (api, _c, fx) => {
      const s = sync(api);
      if (s.phase === 'done') return { error: 'The game is over.' };
      const round = roundOf(api);
      if (round >= s.order.length) return { error: 'There is no question left to play.' };
      fx!.data.round = round;
    },
    hooks: {
      tick: endWithRound,
      delta: {
        standing: (api, fx, d) => {
          if (sync(api).round !== Number(fx.data.round)) return;
          const kept = Object.keys(d).filter((id) => (d[id] ?? 0) < 0);
          if (!kept.length) return;
          for (const id of kept) d[id] = 0;
          api.feed(`The reprieve bell rang: ${kept.map((id) => api.name(id)).join(', ')} ${kept.length === 1 ? 'stays' : 'stay'} in the game.`, 'big');
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Reprieve: nobody goes out on this question', tone: 'info' }),
    overlayFor: 'all',
  },
  {
    id: 'classic.rollover',
    name: 'Rollover Pot',
    category: 'round',
    description: 'Split the Pot only: if nobody gets the open question right, its pot is not lost but added to the next question\'s pot, and it keeps rolling on until someone wins it (for up to 2 and a half minutes).',
    target: 'room',
    hostile: false,
    modes: M,
    needs: ['pot'],
    cost: 30,
    cooldownMs: 75_000,
    durationMs: 150_000,
    stacking: 'reject',
    apply: (api, _c, fx) => {
      const s = sync(api);
      if (s.phase !== 'question') return { error: 'No question is open right now.' };
      fx!.data.round = s.round;
      fx!.data.carry = 0;
    },
    hooks: {
      delta: {
        closed: (api, fx, d) => {
          if ((d.game ?? 0) <= 0) return;
          const s = sync(api);
          const carry = Number(fx.data.carry);
          // Until it has something to carry, it watches only the question it was cast on.
          if (!carry && s.round !== Number(fx.data.round)) return;
          const credits: Record<PlayerId, number> = {};
          for (const [pid, a] of Object.entries(s.answers)) credits[pid] = creditOf(a);
          const winners = Object.keys(credits).filter((pid) => credits[pid]! > 0);
          if (!winners.length) {
            // The pot exactly as the mode worked it out when the question closed.
            const inGame = api.players().filter((p) => inAtClose(api, p.id)).length;
            const pot = POT_PER_PLAYER * Math.max(1, inGame) * scale(api) * (isEncore(api) ? 0.5 : 1);
            fx.data.carry = carry + pot;
            api.feed(`Rollover! The unclaimed ${fmt(pot)} points roll on: the next question's pot is ${fmt(carry + pot)} points bigger.`, 'big');
            return;
          }
          api.endEffect(fx.eid, 'used');
          if (!carry) {
            api.feed('Rollover Pot: somebody got that one, so there was nothing to roll over.', 'info', [fx.caster]);
            return;
          }
          const shares = potShares(carry, credits);
          for (const pid of winners) {
            const got = (shares[pid] ?? 0) * (settings(api).comeback && api.s.boosted.includes(pid) ? 2 : 1);
            const moved = api.add('score', pid, got);
            s.answers[pid]!.points += moved;
            s.lastGain[pid] = s.answers[pid]!.points;
          }
          api.feed(`The rollover of ${fmt(carry)} points was shared by ${winners.map((id) => api.name(id)).join(', ')}.`, 'big');
        },
      },
      end: (api, fx, reason) => {
        if (reason === 'expired' && Number(fx.data.carry) > 0) api.feed(`Nobody won the rollover of ${fmt(Number(fx.data.carry))} points in time, so it is gone.`, 'info');
      },
    },
    overlay: (fx) => ({ kind: 'badge', text: Number(fx.data.carry) > 0 ? `Rollover: +${fmt(Number(fx.data.carry))} in the pot` : 'Rollover pot', tone: 'info' }),
    overlayFor: 'all',
  },
];

/* ------------------------------- wagers -------------------------------- */

const wagers: CheatDef[] = [
  {
    id: 'classic.back-yourself',
    name: 'Back Yourself',
    category: 'score',
    description: 'Stake a fifth of your points on your answer to the open question. When it closes: right, and you win the stake on top of what the answer scores; wrong, partly right or not answered, and you lose the stake. Cast it before you answer.',
    target: 'self',
    modes: M,
    needs: [...S, 'sync'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 90_000,
    tickMs: 250,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const no = canStillAnswer(api, c.caster);
      if (no) return no;
      const pts = api.score(c.caster);
      if (pts <= 0) return { error: 'You have no points to stake.' };
      fx!.data.round = sync(api).round;
      fx!.data.stake = share(pts, 20);
      api.feed(`You staked ${fmt(share(pts, 20))} points on your answer.`, 'info', [c.caster]);
    },
    hooks: {
      tick: (api, fx) => {
        // The question closed some other way (the game ended): nothing to settle.
        const s = sync(api);
        if (s.phase === 'done' || s.round > Number(fx.data.round)) api.endEffect(fx.eid, 'used');
      },
      delta: {
        closed: (api, fx, d) => {
          const s = sync(api);
          if ((d.game ?? 0) <= 0 || s.round !== Number(fx.data.round)) return;
          api.endEffect(fx.eid, 'used');
          const me = fx.caster;
          const stake = Number(fx.data.stake);
          if (s.answers[me]?.correct) {
            const won = api.addScore(me, stake);
            api.feed(`${api.name(me)} backed themselves and won ${fmt(won)} points.`, 'good');
          } else {
            const lost = -api.addScore(me, -stake);
            api.feed(`${api.name(me)} backed themselves and lost ${fmt(lost)} points.`, 'bad');
          }
        },
      },
    },
    overlay: (fx) => ({ kind: 'badge', text: `Backing yourself: ${fmt(Number(fx.data.stake ?? 0))} staked`, tone: 'info' }),
  },
  {
    id: 'classic.sizzling-answers',
    name: 'Sizzling Answers',
    category: 'troll',
    description: 'For 40 seconds, every question that closes with a wrong answer from an opponent (given while this lasts) costs them 200 points (400 with Double points), on top of any wrong-answer penalty. Partly right answers that earn points are safe, not answering costs nothing, and scores never drop below 0.',
    target: 'opponent',
    modes: M,
    needs: [...S, 'sync'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 40_000,
    hooks: {
      delta: {
        closed: (api, fx, d) => {
          if ((d.game ?? 0) <= 0) return;
          const t = target(fx);
          const a = sync(api).answers[t];
          if (!a || creditOf(a) > 0 || a.at < fx.startedAt) return;
          const lost = -api.addScore(t, -200 * scale(api));
          if (lost > 0) api.feed(`That answer sizzled: it cost you ${fmt(lost)} points.`, 'bad', [t]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Sizzling: wrong answers cost points', tone: 'bad' }),
  },
];

/* ------------------------- streaks and team bonus ----------------------- */

const more: CheatDef[] = [
  {
    id: 'classic.streak-snatch',
    name: 'Streak Snatch',
    category: 'troll',
    description: 'Take an opponent\'s answer streak: theirs drops to 0 and yours grows by as much, so the streak bonus (or Glim Chain multiplier) they were building is yours. A streak can never be longer than the questions asked so far, so anything past that is lost.',
    target: 'opponent',
    modes: M,
    needs: STREAK,
    cost: 30,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const t = target(c);
      const theirs = api.get('streak', t);
      if (theirs <= 0) return { error: `${api.name(t)} has no streak to take.` };
      const gained = api.add('streak', c.caster, theirs);
      if (gained <= 0) return { error: 'Your streak is already as long as it can be.' };
      api.set('streak', t, 0);
      api.feed(`${api.name(c.caster)} snatched your answer streak of ${theirs}.`, 'bad', [t]);
    },
  },
  {
    id: 'classic.harmony-swap',
    name: 'Harmony Swap',
    category: 'troll',
    description: 'In Unison only: your team and another team trade every unison bonus point they have earned so far.',
    target: 'enemy-team',
    modes: M,
    needs: ['teams', 'unison'],
    cost: 40,
    cooldownMs: 90_000,
    apply: (api, c) => {
      const mine = api.teamOf(c.caster);
      const theirs = c.team;
      if (!mine || !theirs) return { error: 'You are not on a team.' };
      const a = api.get('teamBonus', mine);
      const b = api.get('teamBonus', theirs);
      if (a === b) return { error: 'Both teams have the same unison bonus, so swapping would change nothing.' };
      api.set('teamBonus', mine, b);
      api.set('teamBonus', theirs, a);
      const name = (id: string) => api.teams().find((t) => t.id === id)?.name ?? 'a team';
      api.feed(`Harmony swap: the ${name(mine)} and the ${name(theirs)} traded unison bonuses (${fmt(a)} for ${fmt(b)}).`, 'big');
    },
  },
];

defineCheats([...streaks, ...questions, ...knockouts, ...rules, ...clock, ...deck, ...twists, ...wagers, ...more]);
