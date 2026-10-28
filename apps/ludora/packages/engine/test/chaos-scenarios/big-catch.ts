import type { ChaosSim } from '../../src/testing/chaos.ts';
import { LURES, MAX_LURE, SET_SIZE, TANK_SIZE } from '../../src/modes/big-catch/meta.ts';
import { speciesById } from '../../src/modes/big-catch/species.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/*
 * Catalogue-suite scenarios for big-catch cheats. See chaos-scenarios.ts for what each field does.
 *
 * Most Big Catch cheats need a moment: a line in the water, a fish biting, a
 * catch on the table not yet sold or kept, fish in a tank, a lure bought or
 * an event on. These play both games on (identically, so they stay twins)
 * until the moment comes. Nothing here edits the game state by hand; the
 * only moves made for a player are ones the mode offers (reel, buy a lure),
 * made the same way in both games.
 *
 * No settings variations are needed: every pack cheat works with the
 * defaults (the waters rotate and events are on), and Trophy Hunt is covered
 * by the pack's own tests.
 */

const fishers = (sim: ChaosSim): Record<string, any> => sim.state().fishers;
const live = (sim: ChaosSim) => sim.ids.filter((id) => sim.rt.hasPlayer(id));
const rivals = (sim: ChaosSim, caster: string) => live(sim).filter((id) => id !== caster);
const inWater = (f: any) => f?.line.phase === 'waiting' || f?.line.phase === 'biting';

function until(sim: ChaosSim, pred: () => boolean, maxMs = 120_000) {
  for (let t = 0; t < maxMs && !pred() && sim.rt.status === 'running'; t += 250) sim.run(250);
  return pred();
}

const rivalHas = (what: (f: any) => boolean): Pre => (sim, caster) => void until(sim, () => rivals(sim, caster).some((id) => what(fishers(sim)[id])));
/** For cheats only the player in a situation can cast: play on until someone is in it. The suite tries every caster in turn, so that player gets the cast. */
const someoneHas = (what: (f: any) => boolean): Pre => (sim) => void until(sim, () => live(sim).some((id) => what(fishers(sim)[id])));
/** For cheats anyone may cast but that only show on their caster's own line. */
const callerHas = (what: (f: any) => boolean, maxMs = 60_000): Pre => (sim, caster) => void until(sim, () => what(fishers(sim)[caster]), maxMs);

const waiting = (f: any) => f?.line.phase === 'waiting';
const landed = (f: any) => f?.line.phase === 'landed';
const oneShort = (f: any) => {
  if (!f || f.tank.length >= TANK_SIZE) return false;
  const counts: Record<string, number> = {};
  for (const fish of f.tank) counts[speciesById(fish.species)!.rarity] = (counts[speciesById(fish.species)!.rarity] ?? 0) + 1;
  return Object.values(counts).some((n) => n % SET_SIZE === SET_SIZE - 1);
};
const canBuyLure = (f: any) => f && f.lure < MAX_LURE && f.wallet >= LURES[f.lure + 1]!.price;

const eventOn: Pre = (sim) => void until(sim, () => Boolean(sim.state().event) && sim.state().event.endsAt > sim.now);
const noEvent: Pre = (sim) => void until(sim, () => !sim.state().event || sim.state().event.endsAt <= sim.now);

/** Two players with lines in the same water, so lines can be crossed. */
const twoLines: Pre = (sim) =>
  void until(sim, () => {
    const out = live(sim).filter((id) => inWater(fishers(sim)[id]));
    return out.some((a) => out.some((b) => a !== b && fishers(sim)[a].line.water === fishers(sim)[b].line.water));
  });

/** The caster reels before the bite, as players sometimes do. */
const reelTooSoon: Post = (sim, caster) => void sim.rt.act(caster, { type: 'reel' });
/** The caster looks away and does not reel at all, so the fish would get away. */
const looksAway: Post = (sim, caster) => void sim.idle.add(caster);
/** The caster buys the next lure, which they can afford. */
const buysLure: Post = (sim, caster) => {
  const f = fishers(sim)[caster];
  if (canBuyLure(f)) sim.rt.act(caster, { type: 'lure', level: f.lure + 1 });
};

/**
 * Fifty-Fifty (a universal cheat) only shows on a multiple-choice question with three or more
 * choices. Big Catch bots answer only once they are out of casts, so the question on a screen
 * changes slowly; in Big Catch, play on until the caster has one. Other modes are left alone.
 */
const mcqOnScreen: Pre = (sim, caster) => {
  if (sim.rt.mode.meta.id !== 'big-catch') return;
  const choices = () => {
    const q = (sim.rt.view({ kind: 'player', playerId: caster }) as any)?.you?.question?.q;
    return q?.type === 'mcq' ? q.choices.length : 0;
  };
  until(sim, () => choices() >= 3);
};

export const scenarios: ScenarioSet = {
  pre: {
    'adv.fifty-fifty': mcqOnScreen,
    'big-catch.hungry-fish': someoneHas(waiting),
    'big-catch.fish-finder': someoneHas(inWater),
    'big-catch.patient-bobber': callerHas(waiting),
    'big-catch.lucky-sinker': callerHas(waiting),
    'big-catch.strong-line': callerHas(waiting),
    'big-catch.landing-net': callerHas(waiting),
    'big-catch.perfect-strike': callerHas(waiting),
    'big-catch.tackle-sale': callerHas(canBuyLure, 120_000),
    'big-catch.trade-in': someoneHas((f) => f?.lure >= 1),
    'big-catch.double-or-splash': someoneHas(landed),
    'big-catch.fish-auction': someoneHas((f) => f?.tank.length > 0),
    'big-catch.matching-fish': someoneHas(oneShort),
    'big-catch.fish-swap': (sim) => void until(sim, () => live(sim).filter((id) => fishers(sim)[id]?.tank.length > 0).length >= 2),
    'big-catch.crossed-lines': twoLines,
    'big-catch.sunken-log': rivalHas(inWater),
    'big-catch.cheeky-seagull': rivalHas(landed),
    'big-catch.bait-thief': rivalHas((f) => f?.casts > 0),
    'big-catch.weedy-lure': rivalHas((f) => f?.lure >= 1),
    'big-catch.dinner-bell': noEvent,
    'big-catch.golden-hour-now': noEvent,
    'big-catch.call-the-school': noEvent,
    'big-catch.still-water': eventOn,
    'big-catch.slack-tide': eventOn,
    'big-catch.change-of-tide': eventOn,
  },
  post: {
    'big-catch.patient-bobber': reelTooSoon,
    'big-catch.lucky-sinker': reelTooSoon,
    'big-catch.strong-line': looksAway,
    'big-catch.landing-net': looksAway,
    'big-catch.tackle-sale': buysLure,
  },
  casters: { 'big-catch.tackle-sale': 'richest' },
  screen: ['big-catch.fish-finder'],
  reactive: [
    'big-catch.perfect-strike',
    'big-catch.lucky-scales',
    'big-catch.skinny-fish',
    'big-catch.secret-spot',
    'big-catch.golden-bait',
    'big-catch.chum-bucket',
    'big-catch.noisy-boat',
    'big-catch.tangled-line',
    'big-catch.rusty-reel',
    'big-catch.patient-bobber',
    'big-catch.lucky-sinker',
    'big-catch.strong-line',
    'big-catch.landing-net',
    'big-catch.tackle-sale',
  ],
};
