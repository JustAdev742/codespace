import type { SyncState } from '../../mechanics/syncRounds.ts';
import { KINDLING_EVERY } from '../../modes/lantern-out/index.ts';
import type { PlayerId } from '../../sdk/types.ts';
import { odds, rollOdds, target, transfer } from '../cheats/kit.ts';
import { defineCheats } from '../registry.ts';
import type { ChaosApi, CheatDef } from '../types.ts';

/*
 * Cheats that only make sense in Lantern Out: every player holds a row of
 * lanterns, a wrong or missed answer blows one out, and at none left they
 * are out until a revival round lets them relight one. Kindling relights a
 * lantern for three right in a row. Clock changes, answer blocking, streak
 * resets and revives are universal cheats, so they are not repeated here.
 *
 * Lantern Out's state as cheats see it: `s.sync` (syncRounds), `s.lanterns`
 * (through the `lanterns` meter, which never lets chaos blow out a last
 * lantern and never goes above the starting count), `s.outAt`, `s.revival`
 * (whether this round is a revival round, fixed as it starts), `s.last`
 * (what the last closed round did, for the reveal), `s.teamOutAt`.
 * The adapter's read-only `opened` and `closed` meters tick when a question
 * opens or closes, so effects that act at those moments hook them.
 *
 * Writing to the `lanterns` meter for a player who is out relights them (its
 * minimum is 1), so every cheat checks who is lit before it writes.
 */

const MODE = 'lantern-out';
const M = [MODE] as const;
const L = ['meter:lanterns'] as const;

type Settings = { lives?: number; reviveEvery?: number; lastTeam?: boolean };
type Last = { round: number; blown: PlayerId[]; out: PlayerId[]; relit: PlayerId[]; kindled: PlayerId[]; slow: PlayerId[] };

const opts = (api: ChaosApi) => api.ctx.settings as Settings;
const sync = (api: ChaosApi): SyncState => api.s.sync;
const lives = (api: ChaosApi) => Number(opts(api).lives) || 3;
const lit = (api: ChaosApi, id: PlayerId) => api.get('lanterns', id);
const isRevival = (api: ChaosApi) => api.s.revival.on && api.s.revival.round === sync(api).round;
const lanterns = (n: number) => `${n} ${n === 1 ? 'lantern' : 'lanterns'}`;

/** Relighting someone who is out mid-question would change who may answer it halfway through, which the mode never does. */
function betweenQuestions(api: ChaosApi): { error: string } | null {
  const phase = sync(api).phase;
  if (phase === 'done') return { error: 'The game is over.' };
  return phase === 'question' ? { error: 'Wait until this question closes.' } : null;
}

/**
 * Whether keeping `id` lit right now would leave the game's own end in their
 * favour: they would be the last player (or, with Last Team Lit, the last
 * team) with a lantern while the mode had put everyone out. Protection stands
 * aside then: deciding the game is never chaos's call.
 */
function wouldDecide(api: ChaosApi, id: PlayerId): boolean {
  const s = api.s;
  const team = api.teamOf(id);
  const lastTeam = Boolean(opts(api).lastTeam) && s.startTeams >= 2 && team !== null;
  return !api.ids().some((o) => o !== id && lit(api, o) > 0 && (!lastTeam || api.teamOf(o) !== team));
}

/** Take a lantern the mode just blew out off the record of the round that blew it, so the reveal stays honest. */
function unblow(api: ChaosApi, id: PlayerId) {
  const s = api.s;
  const last = s.last as Last | null;
  if (last && last.round === sync(api).round) {
    last.blown = last.blown.filter((x) => x !== id);
    last.out = last.out.filter((x) => x !== id);
    last.slow = last.slow.filter((x) => x !== id);
  }
  const team = api.teamOf(id);
  if (team && s.teamOutAt?.[team] === sync(api).round) {
    delete s.teamOutAt[team];
    api.feed(`The ${api.teams().find((t) => t.id === team)?.name ?? 'team'} still have a lantern lit after all.`, 'good');
  }
}

/* ------------------------------ lanterns ------------------------------- */

const swaps: CheatDef[] = [
  {
    id: 'lantern-out.gust',
    name: 'Gust of Wind',
    category: 'troll',
    description: 'Blows out one of an opponent\'s lanterns. It never blows out their last one.',
    target: 'opponent',
    modes: M,
    needs: L,
    cost: 35,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      if (lit(api, t) < 2) return { error: `${api.name(t)} is down to their last lantern (or none), and chaos never blows out the last one.` };
      api.add('lanterns', t, -1);
      api.feed(`A gust of wind blew out one of ${api.name(t)}'s lanterns.`, 'bad');
    },
  },
  {
    id: 'lantern-out.borrow-flame',
    name: 'Borrow a Flame',
    category: 'troll',
    description: 'Takes one lantern from an opponent who has two or more and lights it in your row. You need a lantern lit yourself and room for one more (never more than everyone started with).',
    target: 'opponent',
    modes: M,
    needs: L,
    cost: 40,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      if (lit(api, c.caster) <= 0) return { error: 'Your lanterns are all out: you have nowhere to carry a flame.' };
      if (lit(api, c.caster) >= lives(api)) return { error: 'Your row is full.' };
      if (lit(api, t) < 2) return { error: `${api.name(t)} is down to their last lantern (or none).` };
      transfer(api, 'lanterns', t, c.caster, 1);
      api.feed(`${api.name(c.caster)} borrowed a flame from ${api.name(t)}.`, 'info');
    },
  },
  {
    id: 'lantern-out.lend-a-light',
    name: 'Lend a Light',
    category: 'advantage',
    description: 'Gives one of your lanterns to another player (you need two or more; they need room for one). If they are out, it relights them and brings them back, but only between questions.',
    target: 'player',
    hostile: false,
    modes: M,
    needs: L,
    cost: 20,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      if (t === c.caster) return { error: 'Pick someone other than yourself.' };
      if (lit(api, c.caster) < 2) return { error: 'You need two or more lanterns to lend one.' };
      if (lit(api, t) >= lives(api)) return { error: `${api.name(t)}'s row is full.` };
      const wasOut = lit(api, t) <= 0;
      if (wasOut) {
        const no = betweenQuestions(api);
        if (no) return no;
      }
      transfer(api, 'lanterns', c.caster, t, 1);
      api.feed(wasOut ? `${api.name(c.caster)} lent ${api.name(t)} a light: they are back in the game!` : `${api.name(c.caster)} lent ${api.name(t)} a lantern.`, 'good');
    },
  },
  {
    id: 'lantern-out.lantern-swap',
    name: 'Lantern Swap',
    category: 'troll',
    description: 'You and an opponent swap rows: you take their number of lanterns and they take yours. Both of you need a lantern lit.',
    target: 'opponent',
    modes: M,
    needs: L,
    cost: 50,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const mine = lit(api, c.caster);
      const theirs = lit(api, t);
      if (mine <= 0 || theirs <= 0) return { error: 'Both of you need a lantern lit to swap.' };
      if (mine === theirs) return { error: `You and ${api.name(t)} have the same number of lanterns.` };
      api.set('lanterns', c.caster, theirs);
      api.set('lanterns', t, mine);
      api.feed(`${api.name(c.caster)} swapped lanterns with ${api.name(t)}: ${lanterns(theirs)} for ${lanterns(mine)}.`, 'big');
    },
  },
  {
    id: 'lantern-out.lamp-oil',
    name: 'Lamp Oil',
    category: 'economy',
    description: 'Buy one more lantern for half your points (rounded up). You need a lantern lit and room for one more (never more than everyone started with).',
    target: 'self',
    modes: M,
    needs: ['meter:score', ...L],
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const pts = api.score(c.caster);
      if (lit(api, c.caster) <= 0) return { error: 'Your lanterns are all out.' };
      if (lit(api, c.caster) >= lives(api)) return { error: 'Your row is full.' };
      if (pts <= 0) return { error: 'You have no points to pay with.' };
      const paid = -api.addScore(c.caster, -Math.ceil(pts / 2));
      api.add('lanterns', c.caster, 1);
      api.feed(`${api.name(c.caster)} bought lamp oil for ${paid} points and lit another lantern.`, 'info');
    },
  },
  {
    id: 'lantern-out.lantern-carousel',
    name: 'Lantern Carousel',
    category: 'troll',
    description: 'Every row of lanterns still lit moves on one place round the circle: each player who still has a lantern takes the number of lanterns the previous lit player had. Players who are out are skipped, and the total number of lit lanterns stays the same.',
    target: 'room',
    hostile: true,
    modes: M,
    needs: L,
    cost: 55,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => {
      const row = api.ids().filter((id) => lit(api, id) > 0);
      const counts = row.map((id) => lit(api, id));
      if (row.length < 2 || new Set(counts).size < 2) return { error: 'Every lit row has the same number of lanterns, so turning the carousel would change nothing.' };
      row.forEach((id, i) => api.set('lanterns', id, counts[(i - 1 + row.length) % row.length]!));
      api.feed('The lantern carousel turned: every lit row moved on one place.', 'big');
    },
  },
  {
    id: 'lantern-out.will-o-wisp',
    name: 'Wandering Wisp',
    category: 'random',
    description: `Follow the wandering wisp and see what it does. Odds: ${odds([['it relights one of your lanterns', 40], ['it blows out a lantern of a random opponent who has two or more', 40], ['it blows out one of yours', 20]])}. You need two or more lanterns and room for one more, and someone must have two or more to lose.`,
    target: 'self',
    modes: M,
    needs: L,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const mine = lit(api, c.caster);
      const victims = api.opponents(c.caster).filter((id) => lit(api, id) >= 2);
      if (mine < 2 || mine >= lives(api)) return { error: 'You need two or more lanterns and room for one more to follow the wisp.' };
      if (!victims.length) return { error: 'No opponent has two or more lanterns for the wisp to take.' };
      const what = rollOdds(api, [['relight', 40], ['blow', 40], ['backfire', 20]] as const);
      if (what === 'relight') {
        api.add('lanterns', c.caster, 1);
        api.feed(`The wisp relit one of ${api.name(c.caster)}'s lanterns.`, 'good');
      } else if (what === 'blow') {
        const t = api.rng.pick(victims);
        api.add('lanterns', t, -1);
        api.feed(`The wisp blew out one of ${api.name(t)}'s lanterns.`, 'bad');
      } else {
        api.add('lanterns', c.caster, -1);
        api.feed(`The wisp led ${api.name(c.caster)} astray and blew out one of their lanterns.`, 'bad');
      }
    },
  },
];

/* ------------------------------- weather ------------------------------- */

const weather: CheatDef[] = [
  {
    id: 'lantern-out.windbreak',
    name: 'Windbreak',
    category: 'advantage',
    description: 'For 30 seconds, a player you choose (you or anyone else) loses no lanterns: wrong and missed answers and the slowest flame cannot blow theirs out. It stands aside if everyone else (or every other team, in Last Team Lit) is out, because that would hand them the game.',
    target: 'player',
    hostile: false,
    modes: M,
    needs: L,
    cost: 40,
    cooldownMs: 75_000,
    durationMs: 30_000,
    priority: 50,
    apply: (api, c) => (lit(api, target(c)) > 0 ? undefined : { error: `${api.name(target(c))} has no lantern lit to protect.` }),
    hooks: {
      delta: {
        lanterns: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) >= 0 || wouldDecide(api, t)) return;
          const saved = -d[t]!;
          d[t] = 0;
          unblow(api, t);
          api.feed(`Windbreak: ${api.name(t)} kept ${saved === 1 ? 'a lantern' : `${saved} lanterns`} lit.`, 'good');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Windbreak', tone: 'good' }),
  },
  {
    id: 'lantern-out.downdraft',
    name: 'Downdraft',
    category: 'troll',
    description: 'For 30 seconds, every lantern an opponent loses takes a second one with it. The downdraft never blows out their last lantern itself.',
    target: 'opponent',
    modes: M,
    needs: L,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 30_000,
    priority: 20,
    apply: (api, c) => (lit(api, target(c)) >= 2 ? undefined : { error: `${api.name(target(c))} is down to their last lantern (or none).` }),
    hooks: {
      delta: {
        lanterns: (api, fx, d) => {
          const t = target(fx);
          const now = lit(api, t);
          if ((d[t] ?? 0) >= 0 || now <= 0) return;
          const extra = Math.max(1, now + d[t]!) - now;
          if (!extra) return;
          d[t]! += extra;
          api.feed(`A downdraft blew out ${lanterns(-extra)} more of ${api.name(t)}'s.`, 'bad');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Downdraft', tone: 'bad' }),
  },
  {
    id: 'lantern-out.moth-to-the-flame',
    name: 'Moth to the Flame',
    category: 'economy',
    description: 'For 40 seconds, every time an opponent loses a lantern, one of yours relights (up to the number you started with, and only while you still have one lit).',
    target: 'opponent',
    modes: M,
    needs: L,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 40_000,
    priority: 30,
    apply: (api, c) => {
      if (lit(api, c.caster) <= 0) return { error: 'Your lanterns are all out.' };
      if (lit(api, c.caster) >= lives(api)) return { error: 'Your row is full, so there is nothing to relight.' };
    },
    hooks: {
      delta: {
        lanterns: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) >= 0 || !api.ids().includes(fx.caster)) return;
          // Never relight a moth whose own last lantern just went out (that would be a revival), and never past a full row.
          const mine = lit(api, fx.caster);
          if (mine <= 0 || mine >= lives(api)) return;
          d[fx.caster] = (d[fx.caster] ?? 0) + 1;
          api.feed(`${api.name(t)} lost a lantern and ${api.name(fx.caster)}'s moth relit one.`, 'info');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'A moth is near your flame', tone: 'bad' }),
  },
  {
    id: 'lantern-out.flicker-curse',
    name: 'Flicker Curse',
    category: 'troll',
    description: 'For 45 seconds, whenever an opponent answers right but someone else answered right faster, they lose a lantern anyway. Never their last one, and never in a revival round.',
    target: 'opponent',
    modes: M,
    needs: L,
    cost: 40,
    cooldownMs: 60_000,
    durationMs: 45_000,
    apply: (api, c) => (lit(api, target(c)) >= 2 ? undefined : { error: `${api.name(target(c))} is down to their last lantern (or none).` }),
    hooks: {
      delta: {
        closed: (api, fx, d) => {
          if ((d.game ?? 0) <= 0 || isRevival(api)) return;
          const t = target(fx);
          const answers = sync(api).answers;
          const right = api.ids().filter((id) => answers[id]?.correct);
          const mine = answers[t];
          if (right.length < 2 || !mine?.correct || lit(api, t) < 2) return;
          if (mine.responseMs <= Math.min(...right.map((id) => answers[id]!.responseMs))) return;
          api.add('lanterns', t, -1);
          const last = api.s.last as Last | null;
          if (last && last.round === sync(api).round) last.blown.push(t);
          api.feed(`${api.name(t)} was right, but not first: the flicker curse blew out one of their lanterns.`, 'bad');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Flicker curse: be first or lose a lantern', tone: 'bad' }),
  },
];

/* ---------------------------- revival rounds --------------------------- */

const revivals: CheatDef[] = [
  {
    id: 'lantern-out.call-revival',
    name: 'Call a Revival',
    category: 'round',
    description: 'The next question becomes a revival round: only players who are out may answer it, and a right answer relights one lantern. Never on the last question, and only while someone is out.',
    target: 'room',
    hostile: false,
    modes: M,
    needs: ['revival'],
    cost: 40,
    cooldownMs: 90_000,
    durationMs: 90_000,
    stacking: 'reject',
    apply: (api) => {
      const s = sync(api);
      if (s.phase === 'done') return { error: 'The game is over.' };
      if (!api.players().some((p) => p.connected && lit(api, p.id) <= 0)) return { error: 'Nobody is out, so there is nobody to revive.' };
      if (s.round + 1 >= s.order.length - 1) return { error: 'The next question is the last one, and the last question is never a revival round.' };
      const every = Number(opts(api).reviveEvery) || 0;
      const nextNumber = s.round + 2;
      if (every > 0 && nextNumber % every === 0) return { error: 'The next question is already due to be a revival round.' };
    },
    hooks: {
      delta: {
        opened: (api, fx, d) => {
          const s = sync(api);
          if ((d.game ?? 0) <= 0 || s.phase !== 'question') return;
          api.endEffect(fx.eid, 'used');
          if (isRevival(api)) return;
          if (s.round >= s.order.length - 1) return;
          if (!api.players().some((p) => p.connected && lit(api, p.id) <= 0)) {
            api.feed('The revival that was called found nobody out, so this is a normal question.', 'info');
            return;
          }
          api.s.revival = { round: s.round, on: true };
          api.feed('A revival was called: players who are out can relight a lantern.', 'big');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Revival called for the next question', tone: 'info' }),
    overlayFor: 'all',
  },
  {
    id: 'lantern-out.snuff-revival',
    name: 'Snuff the Revival',
    category: 'troll',
    description: 'The next revival round (within 2 minutes) is cancelled before it starts and played as a normal question instead, so nobody who is out can relight a lantern in it.',
    target: 'room',
    hostile: true,
    modes: M,
    needs: ['revival'],
    cost: 35,
    cooldownMs: 90_000,
    durationMs: 120_000,
    stacking: 'reject',
    apply: (api) => (api.players().some((p) => p.connected && lit(api, p.id) <= 0) ? undefined : { error: 'Nobody is out, so there is no revival to snuff.' }),
    hooks: {
      delta: {
        opened: (api, fx, d) => {
          if ((d.game ?? 0) <= 0 || sync(api).phase !== 'question' || !isRevival(api)) return;
          api.s.revival = { round: sync(api).round, on: false };
          api.endEffect(fx.eid, 'used');
          api.feed('The revival round was snuffed out: this is a normal question.', 'bad');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'The next revival is snuffed', tone: 'bad' }),
    overlayFor: 'all',
  },
  {
    id: 'lantern-out.dry-tinder',
    name: 'Dry Tinder',
    category: 'advantage',
    description: 'Kindling only: your answer streak jumps so that your next right answer completes a run of three, and Kindling relights a lantern if you have lost one. A streak can never be longer than the questions asked so far.',
    target: 'self',
    modes: M,
    needs: ['meter:streak', 'kindling'],
    cost: 25,
    cooldownMs: 50_000,
    apply: (api, c) => {
      if (lit(api, c.caster) <= 0) return { error: 'Your lanterns are all out.' };
      const now = api.get('streak', c.caster);
      let want = now;
      while ((want + 1) % KINDLING_EVERY !== 0) want++;
      if (want === now) return { error: 'Your next right answer already completes a run of three.' };
      if (api.set('streak', c.caster, want) !== want - now) return { error: 'Not enough questions have been asked yet for a streak that long.' };
      api.feed('Dry tinder: your next right answer will kindle.', 'good', [c.caster]);
    },
  },
];

defineCheats([...swaps, ...weather, ...revivals]);
