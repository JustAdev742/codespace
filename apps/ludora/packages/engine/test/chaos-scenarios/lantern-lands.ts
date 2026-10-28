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

export const scenarios: ScenarioSet = {
  pre: {
    'lantern-lands.raze': rivalForts,
    'lantern-lands.earthquake': rivalForts,
    'lantern-lands.rust': rivalForts,
    'lantern-lands.fort-plunder': rivalForts,
    'lantern-lands.clear-skies': someEvent,
    'lantern-lands.long-weather': someEvent,
  },
  post: { 'lantern-lands.wardstones': rivalRaids },
};
