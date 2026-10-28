import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Pre, ScenarioSet } from '../chaos-scenarios.ts';

/*
 * Catalogue-suite scenarios for code-breakers cheats. See chaos-scenarios.ts for what each field does.
 *
 * Many Code Breakers cheats need a defence to knock out, a packet on offer,
 * a hack back open, notes to wipe or an event running. These play both games
 * on (identically, so they stay twins) until the moment comes. Nothing here
 * edits the game state by hand.
 */

const hackers = (sim: ChaosSim): Record<string, any> => sim.state().hackers;
const live = (sim: ChaosSim) => sim.ids.filter((id) => sim.rt.hasPlayer(id));
const rivals = (sim: ChaosSim, caster: string) => live(sim).filter((id) => id !== caster);

function until(sim: ChaosSim, pred: () => boolean, maxMs = 150_000) {
  for (let t = 0; t < maxMs && !pred() && sim.rt.status === 'running'; t += 250) sim.run(250);
  return pred();
}

const rivalHas = (what: (h: any) => boolean): Pre => (sim, caster) => void until(sim, () => rivals(sim, caster).some((id) => what(hackers(sim)[id])));
const callerHas = (what: (h: any, sim: ChaosSim) => boolean): Pre => (sim, caster) => void until(sim, () => what(hackers(sim)[caster], sim));

const eventOn: Pre = (sim) => void until(sim, () => Boolean(sim.state().event) && sim.state().event.endsAt > sim.now);
const noEvent: Pre = (sim) => void until(sim, () => !sim.state().event || sim.state().event.endsAt <= sim.now);
const offerOpen = callerHas((h) => Boolean(h?.offer));

/** Packet Loss goes to the richest rival first, and bots that lead prefer Hack packets: wait until that rival is about to take Bits. */
const richestTakesBits: Pre = (sim, caster) =>
  void until(sim, () => {
    const richest = rivals(sim, caster).sort((a, b) => hackers(sim)[b].bits - hackers(sim)[a].bits)[0];
    const kinds = ((richest && hackers(sim)[richest]?.offer?.packets) ?? []).map((p: any) => p.kind);
    return kinds.includes('bits') && !kinds.includes('hack');
  });

export const scenarios: ScenarioSet = {
  // The Vault cheats need a Heist.
  settings: { 'code-breakers': [{ heist: true }] },
  pre: {
    'code-breakers.firewall-breach': rivalHas((h) => h?.firewall > 0),
    'code-breakers.corrupted-backup': rivalHas((h) => h?.backup > 0),
    'code-breakers.brownout': rivalHas((h) => h?.surge > 0 || h?.double > 0),
    'code-breakers.2fa-outage': rivalHas((h) => h?.twoFactor === true),
    'code-breakers.jam-trace': rivalHas((h) => Boolean(h?.hackBack)),
    'code-breakers.memory-wipe': rivalHas((h) => Object.keys(h?.notes ?? {}).length > 0),
    'code-breakers.trace-intruder': callerHas((h, sim) => (h?.incidents ?? []).some((i: any) => i.at >= sim.now - 60_000)),
    'code-breakers.retry-script': callerHas((h, sim) => Object.values((h?.tried ?? {}) as Record<string, number>).some((at) => at > sim.now - 15_000)),
    'code-breakers.firewall-buyback': callerHas((h) => h?.firewall > 0),
    'code-breakers.zero-day': callerHas((h) => Boolean(h?.password) && !h.offer && !h.hack),
    'code-breakers.packet-reroll': offerOpen,
    'code-breakers.packet-x-ray': offerOpen,
    'code-breakers.packet-loss': richestTakesBits,
    'code-breakers.system-restore': eventOn,
    'code-breakers.event-overtime': eventOn,
    'code-breakers.start-storm': noEvent,
    'code-breakers.start-bounty': noEvent,
    'code-breakers.start-glitch': noEvent,
  },
  reactive: [
    'code-breakers.overclock',
    'code-breakers.packet-loss',
    'code-breakers.honeypot',
    'code-breakers.incident-response',
    'code-breakers.bug-bounty',
    'code-breakers.lag-spike',
  ],
  screen: ['code-breakers.packet-x-ray'],
};
