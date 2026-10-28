import type { SyncState } from '../../mechanics/syncRounds.ts';
import { POT_PER_PLAYER, potShares } from '../../modes/classic/index.ts';
import type { PlayerId } from '../../sdk/types.ts';
import { target } from '../cheats/kit.ts';
import { defineCheats } from '../registry.ts';
import type { ChaosApi, CheatDef } from '../types.ts';

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
const settings = (api: ChaosApi) => api.ctx.settings as { scale?: string; comeback?: boolean; unisonBonus?: number };
const scale = (api: ChaosApi) => Number(settings(api).scale) || 1;
/** Still in when the question that just closed was scored: the mode shares pots and checks unison before it knocks anyone out. */
const inAtClose = (api: ChaosApi, id: PlayerId) => api.s.out[id] === undefined || api.s.out[id] === sync(api).round;
/** How much of a question an answer earns in Split the Pot (as the mode counts it). */
const creditOf = (a: { correct: boolean; partial: number }) => (a.correct ? 1 : a.partial >= 0.5 ? a.partial : 0);

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

defineCheats([...streaks, ...questions, ...knockouts, ...rules]);
