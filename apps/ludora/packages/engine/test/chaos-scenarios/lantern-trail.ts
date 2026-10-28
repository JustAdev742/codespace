import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for lantern-trail cheats. See chaos-scenarios.ts for what each field does. */

/** Somebody other than the caster holds a Golden ticket, so there is one to snatch. */
const rivalHasTicket: Pre = (sim, caster) => {
  const walkers = sim.state().walkers as Record<string, { tickets: number }>;
  if (Object.entries(walkers).some(([id, w]) => id !== caster && w.tickets > 0)) return;
  const rival = sim.ids.find((id) => id !== caster && sim.rt.hasPlayer(id));
  if (rival) sim.cast(rival, { cheatId: 'lantern-trail.forged-ticket' });
};

/** A player jumps to just behind the nearest stall, so their next roll walks them past it and they can buy. */
const toTheStall =
  (who: 'caster' | 'target'): Post =>
  (sim, caster, _def, target) => {
    const id = who === 'caster' ? caster : target;
    if (id) sim.cast(id, { cheatId: 'lantern-trail.stall-sniffer' });
  };

export const scenarios: ScenarioSet = {
  pre: { 'lantern-trail.ticket-snatch': rivalHasTicket },
  post: {
    // These act when someone buys a Golden Lantern (or tries to).
    'lantern-trail.haggler': toTheStall('caster'),
    'lantern-trail.lantern-levy': toTheStall('target'),
    'lantern-trail.shutters-down': (sim, caster, def, target) => {
      // The target needs the coins for a lantern as well as a stall in reach.
      if (target) sim.cast(target, { cheatId: 'lantern-trail.coin-shower' });
      toTheStall('target')(sim, caster, def, target);
    },
  },
  // Buying needs coins: the richest caster can afford a lantern.
  casters: { 'lantern-trail.haggler': 'richest' },
  reactive: ['lantern-trail.nailed-down', 'lantern-trail.haggler', 'lantern-trail.lantern-levy', 'lantern-trail.shutters-down'],
};
