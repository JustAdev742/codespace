import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for lantern-lands cheats. See chaos-scenarios.ts for what each field does. */

const teamOf = (sim: ChaosSim, id: string) => sim.state().members[id]?.team as number | undefined;
const rivalOf = (sim: ChaosSim, id: string) => sim.ids.find((x) => sim.rt.hasPlayer(x) && teamOf(sim, x) !== teamOf(sim, id));

/** A player on another team puts up forts along their edge, so cheats that knock forts down have some to hit. */
const rivalForts: Pre = (sim, caster) => {
  const rival = rivalOf(sim, caster);
  if (rival) sim.cast(rival, { cheatId: 'lantern-lands.palisade' });
};

/** Someone else starts a room event, so cheats that change the running event have one. */
const someEvent: Pre = (sim, caster) => {
  if (sim.state().event) return;
  const other = sim.ids.find((x) => x !== caster && sim.rt.hasPlayer(x));
  if (other) sim.cast(other, { cheatId: 'lantern-lands.call-weather', params: { event: 'bloom' } });
};

/** A rival with energy raids one of the caster's team's lands (Wardstones should stop it). */
const rivalRaids: Post = (sim, caster) => {
  const s = sim.state();
  const mine = teamOf(sim, caster);
  for (const id of sim.ids) {
    if (!sim.rt.hasPlayer(id) || teamOf(sim, id) === mine) continue;
    sim.cast(id, { cheatId: 'lantern-lands.rally' });
    const view = sim.rt.view({ kind: 'player', playerId: id }) as { you: { options: { raid: number[] } } | null };
    const land = view.you?.options.raid.find((l) => s.owner[l] === mine && !s.map.shrines.includes(l));
    if (land !== undefined) {
      sim.rt.act(id, { type: 'raid', land });
      return;
    }
  }
};

/**
 * A teammate of the caster puts up forts along the team's edge with Hex Palisade (bots rarely build
 * forts), so cheats that move or take down the team's own forts have some away from its rival border.
 */
const teamForts: Pre = (sim, caster) => {
  const mate = sim.ids.find((x) => x !== caster && sim.rt.hasPlayer(x) && teamOf(sim, x) === teamOf(sim, caster));
  sim.cast(mate ?? caster, { cheatId: 'lantern-lands.palisade' });
};

type MapView = { you: { energy: number; options: { claim: number[]; fortify: number[]; raid: number[] } } | null };

/** The caster makes one map move straight after the cast (topping up energy with a Rally if they have none). */
function casterMoves(pick: (sim: ChaosSim, you: NonNullable<MapView['you']>) => { type: string; land: number } | null): Post {
  return (sim, caster) => {
    const you = () => (sim.rt.view({ kind: 'player', playerId: caster }) as MapView).you;
    if (you() && you()!.energy < 1) sim.cast(caster, { cheatId: 'lantern-lands.rally' });
    const me = you();
    const move = me && me.energy >= 1 ? pick(sim, me) : null;
    if (move) sim.rt.act(caster, move);
  };
}

const plain = (sim: ChaosSim, l: number) => !sim.state().map.shrines.includes(l);
/** Fortify a land of their own, or raid a rival land that still has a fort. */
const buildsOrRaids = casterMoves((sim, you) => {
  const fort = you.options.fortify.find((l) => plain(sim, l));
  if (fort !== undefined) return { type: 'fortify', land: fort };
  const raid = sim.state().event?.kind === 'storm' ? undefined : you.options.raid.find((l) => plain(sim, l) && sim.state().fort[l] > 0);
  return raid === undefined ? null : { type: 'raid', land: raid };
});
/** Claim an empty land, or capture a rival land with no fort left. */
const claimsOrCaptures = casterMoves((sim, you) => {
  const claim = you.options.claim[0];
  if (claim !== undefined) return { type: 'claim', land: claim };
  const capture = sim.state().event?.kind === 'storm' ? undefined : you.options.raid.find((l) => plain(sim, l) && sim.state().fort[l] === 0);
  return capture === undefined ? null : { type: 'raid', land: capture };
});

export const scenarios: ScenarioSet = {
  pre: {
    'lantern-lands.raze': rivalForts,
    'lantern-lands.earthquake': rivalForts,
    'lantern-lands.rust': rivalForts,
    'lantern-lands.fort-plunder': rivalForts,
    'lantern-lands.clear-skies': someEvent,
    'lantern-lands.long-weather': someEvent,
    'lantern-lands.regroup': teamForts,
    'lantern-lands.salvage': teamForts,
  },
  post: {
    'lantern-lands.wardstones': rivalRaids,
    'lantern-lands.twin-lanterns': buildsOrRaids,
    'lantern-lands.foundations': claimsOrCaptures,
  },
};
