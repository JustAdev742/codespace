import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import '../src/chaos/cheats/index.ts';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { VAULT } from '../src/modes/code-breakers/meta.ts';

/* Exact behaviour of the Code Breakers cheat pack: amounts, limits, refusals, expiry. */

/* eslint-disable @typescript-eslint/no-explicit-any */

function network(settings: Record<string, unknown> = {}, opts: { warm?: number; common?: Record<string, unknown> } = {}) {
  const sim = new ChaosSim({ modeId: 'code-breakers', questions: MIXED_SET, players: 4, seed: 11, settings: { events: false, ...settings }, common: opts.common ?? {} });
  sim.run(opts.warm ?? 20_000);
  return sim;
}

const h = (sim: ChaosSim, id: string): any => sim.state().hackers[id];
const cast = (sim: ChaosSim, by: string, cheat: string, target?: string) => sim.cast(by, { cheatId: `code-breakers.${cheat}`, target: target ?? null });
const still = (sim: ChaosSim, ...ids: string[]) => ids.forEach((id) => sim.idle.add(id));

/** Play `id` by hand, always answering right, until `stop` holds. `pick` chooses packets (-1 leaves it to the bot). */
function playUntil(sim: ChaosSim, id: string, stop: () => boolean, pick?: (kinds: string[]) => number, maxMs = 180_000) {
  sim.idle.add(id);
  const rng = createRng(3);
  for (let t = 0; t < maxMs && !stop() && sim.rt.status === 'running'; t += 200) {
    const me = h(sim, id);
    const choice = me.offer && pick ? pick(me.offer.packets.map((p: any) => p.kind)) : -1;
    const action = choice >= 0 ? { type: 'pick', offer: me.offer.seq, index: choice } : sim.rt.botAction(id, 1, rng);
    if (action) sim.rt.act(id, action);
    if (stop()) break;
    sim.run(200);
  }
  if (!stop()) throw new Error('the situation never came up');
}

const bitsOffer = (sim: ChaosSim, id: string) => () => Boolean(h(sim, id).offer?.packets.some((p: any) => p.kind === 'bits'));
const pickBits = (sim: ChaosSim, id: string) => {
  const o = h(sim, id).offer;
  return sim.rt.act(id, { type: 'pick', offer: o.seq, index: o.packets.findIndex((p: any) => p.kind === 'bits') });
};

/** Hack `target` from `by` with Zero-Day, then guess right or wrong. */
function zeroDayGuess(sim: ChaosSim, by: string, target: string, right: boolean) {
  playUntil(sim, by, () => !h(sim, by).offer && !h(sim, by).hack, () => -1);
  expect(cast(sim, by, 'zero-day').ok).toBe(true);
  expect(sim.rt.act(by, { type: 'target', playerId: target }).ok).toBe(true);
  const view = sim.rt.view({ kind: 'player', playerId: by }) as any;
  const options = view.you.hack.options.map((o: any) => o.text) as string[];
  const index = options.findIndex((o) => (o === h(sim, target).password) === right);
  return sim.rt.act(by, { type: 'guess', seq: h(sim, by).hack.seq, index });
}

describe('code-breakers pack: packets', () => {
  it('Overclocked Chip pays half as much again on a Bits packet, and the card shows it', () => {
    const a = network();
    const b = network();
    playUntil(a, 'p1', bitsOffer(a, 'p1'), () => -1);
    playUntil(b, 'p1', bitsOffer(b, 'p1'), () => -1);
    expect(cast(a, 'p1', 'overclock').ok).toBe(true);
    const [beforeA, beforeB] = [h(a, 'p1').bits, h(b, 'p1').bits];
    pickBits(a, 'p1');
    pickBits(b, 'p1');
    const base = h(b, 'p1').bits - beforeB;
    expect(base).toBeGreaterThan(0);
    expect(h(a, 'p1').bits - beforeA).toBe(base + Math.max(1, Math.round(base / 2)));
    expect(h(a, 'p1').opened.delta).toBe(h(a, 'p1').bits - beforeA);
    expect(h(a, 'p1').opened.detail).toContain('Overclocked Chip');
  });

  it('Packet Loss halves a rival’s Bits packet and says how much never arrived', () => {
    const a = network();
    const b = network();
    playUntil(a, 'p1', bitsOffer(a, 'p1'), () => -1);
    playUntil(b, 'p1', bitsOffer(b, 'p1'), () => -1);
    expect(cast(a, 'p2', 'packet-loss', 'p1').ok).toBe(true);
    const [beforeA, beforeB] = [h(a, 'p1').bits, h(b, 'p1').bits];
    pickBits(a, 'p1');
    pickBits(b, 'p1');
    const base = h(b, 'p1').bits - beforeB;
    expect(h(a, 'p1').bits - beforeA).toBe(base - Math.floor(base / 2));
    expect(h(a, 'p1').opened.title).toBe(`+${String(h(a, 'p1').bits - beforeA)} bits`);
    expect(h(a, 'p1').opened.detail).toContain('never arrived');
  });

  it('Packet Reroll draws a fresh offer; Packet X-Ray shows what is inside until a packet is picked', () => {
    const sim = network();
    playUntil(sim, 'p1', () => Boolean(h(sim, 'p1').offer), () => -1);
    const seq = h(sim, 'p1').offer.seq;
    expect(cast(sim, 'p1', 'packet-reroll').ok).toBe(true);
    expect(h(sim, 'p1').offer.seq).toBeGreaterThan(seq);
    expect(h(sim, 'p1').offer.packets).toHaveLength(3);

    expect(cast(sim, 'p1', 'packet-x-ray').ok).toBe(true);
    const banner = sim.view('p1').overlays.find((o: any) => o.kind === 'banner') as any;
    expect(banner.text).toMatch(/^Left: .+\. Middle: .+\. Right: .+\.$/);
    const o = h(sim, 'p1').offer;
    sim.rt.act('p1', { type: 'pick', offer: o.seq, index: 0 });
    sim.run(500);
    expect(sim.chaos().effects.some((e) => e.cheatId === 'code-breakers.packet-x-ray')).toBe(false);
    expect(sim.view('p1').overlays.some((o: any) => o.kind === 'banner')).toBe(false);
  });

  it('Lag Spike stops a rival opening packets for 10 seconds', () => {
    const sim = network();
    playUntil(sim, 'p1', () => Boolean(h(sim, 'p1').offer), () => -1);
    expect(cast(sim, 'p2', 'lag-spike', 'p1').ok).toBe(true);
    const o = h(sim, 'p1').offer;
    const r = sim.rt.act('p1', { type: 'pick', offer: o.seq, index: 0 });
    expect(r.ok).toBe(false);
    sim.run(10_500);
    expect(sim.rt.act('p1', { type: 'pick', offer: o.seq, index: 0 }).ok).toBe(true);
  });
});

describe('code-breakers pack: passwords and notes', () => {
  it('Brute Force crosses off decoys but always leaves one standing', () => {
    const sim = network();
    still(sim, 'p1', 'p2');
    expect(cast(sim, 'p1', 'brute-force', 'p2').ok).toBe(true);
    sim.run(41_000);
    expect(cast(sim, 'p1', 'brute-force', 'p2').ok).toBe(true);
    const crossed = h(sim, 'p1').notes.p2.crossed as string[];
    expect(crossed).toHaveLength(2);
    expect(crossed).not.toContain(h(sim, 'p2').password);
    sim.run(41_000);
    const third = cast(sim, 'p1', 'brute-force', 'p2');
    expect(third.ok).toBe(false);
    expect(h(sim, 'p1').notes.p2.crossed).toHaveLength(2);
  });

  it('Brute Force counts what teammates crossed off when team intel shares notes', () => {
    const sim = network({ teamIntel: true }, { common: { teamCount: 2 } });
    // p1 and p3 share a team; p2 is on the other.
    still(sim, 'p1', 'p2', 'p3');
    expect(cast(sim, 'p3', 'brute-force', 'p2').ok).toBe(true);
    expect(cast(sim, 'p1', 'brute-force', 'p2').ok).toBe(true);
    sim.run(41_000);
    expect(cast(sim, 'p1', 'brute-force', 'p2').ok).toBe(false);
    const known = new Set([...h(sim, 'p1').notes.p2.crossed, ...h(sim, 'p3').notes.p2.crossed]);
    expect(known.size).toBe(2);
    expect(known.has(h(sim, 'p2').password)).toBe(false);
  });

  it('Data Leak crosses the same decoy off for every other player, never the password', () => {
    const sim = network();
    still(sim, ...sim.ids);
    expect(cast(sim, 'p1', 'data-leak', 'p2').ok).toBe(true);
    const lists = ['p1', 'p3', 'p4'].map((id) => h(sim, id).notes.p2?.crossed ?? []);
    const shared = lists[0]!.filter((d: string) => lists.every((l) => l.includes(d)));
    expect(shared).toHaveLength(1);
    expect(h(sim, 'p2').decoys).toContain(shared[0]);
    for (const l of lists) expect(l).not.toContain(h(sim, 'p2').password);
  });

  it('Quick Rekey changes the password, wipes what hackers knew and starts the change wait', () => {
    const sim = network();
    still(sim, 'p1', 'p2');
    expect(cast(sim, 'p2', 'brute-force', 'p1').ok).toBe(true);
    const { password, version } = h(sim, 'p1');
    expect(cast(sim, 'p1', 'quick-rekey').ok).toBe(true);
    expect(h(sim, 'p1').password).not.toBe(password);
    expect(h(sim, 'p1').version).toBe(version + 1);
    expect(h(sim, 'p2').notes.p1).toBeUndefined();
    expect(h(sim, 'p1').passwordReadyAt).toBe(sim.now + 30_000);
  });

  it('Memory Wipe forgets a rival’s notes, and refuses when there are none', () => {
    const sim = network();
    still(sim, 'p1', 'p2');
    expect(cast(sim, 'p1', 'brute-force', 'p2').ok).toBe(true);
    expect(cast(sim, 'p2', 'memory-wipe', 'p1').ok).toBe(true);
    expect(h(sim, 'p1').notes).toEqual({});
    sim.run(61_000);
    expect(cast(sim, 'p2', 'memory-wipe', 'p1').ok).toBe(false);
  });
});

describe('code-breakers pack: hacking', () => {
  it('Zero-Day opens a hack without a Hack packet, and not while a packet waits', () => {
    const sim = network();
    playUntil(sim, 'p1', () => Boolean(h(sim, 'p1').offer), () => -1);
    expect(cast(sim, 'p1', 'zero-day').ok).toBe(false);
    playUntil(sim, 'p1', () => !h(sim, 'p1').offer && !h(sim, 'p1').hack, () => -1);
    expect(cast(sim, 'p1', 'zero-day').ok).toBe(true);
    expect(h(sim, 'p1').hack).toMatchObject({ stage: 'target', source: 'hack' });
    expect(sim.rt.act('p1', { type: 'target', playerId: 'p2' }).ok).toBe(true);
    expect(h(sim, 'p1').hack.stage).toBe('guess');
  });

  it('Honeypot makes a wrong guess pay 60 bits; Trace Intruder then opens a hack back on the guesser; Jam the Trace closes it', () => {
    const sim = network();
    still(sim, 'p2', 'p3');
    expect(cast(sim, 'p2', 'honeypot').ok).toBe(true);
    const before = h(sim, 'p2').bits;
    expect(zeroDayGuess(sim, 'p1', 'p2', false).ok).toBe(true);
    expect(h(sim, 'p2').bits - before).toBe(60);
    expect(h(sim, 'p2').incidents[0]).toMatchObject({ kind: 'intrusion', by: 'p1', bits: 60 });

    expect(cast(sim, 'p2', 'trace-intruder').ok).toBe(true);
    expect(h(sim, 'p2').hackBack).toMatchObject({ playerId: 'p1', until: sim.now + 30_000 });
    expect(cast(sim, 'p3', 'jam-trace', 'p2').ok).toBe(true);
    expect(h(sim, 'p2').hackBack).toBeNull();
  });

  it('Bug Bounty pays 20 bits for a failed hack', () => {
    const sim = network();
    still(sim, 'p2');
    expect(cast(sim, 'p1', 'bug-bounty').ok).toBe(true);
    expect(zeroDayGuess(sim, 'p1', 'p2', false).ok).toBe(true);
    const before = h(sim, 'p1').bits;
    sim.run(300);
    expect(h(sim, 'p1').bits - before).toBe(20);
  });

  it('Incident Response puts a firewall up after a hack lands, once', () => {
    const sim = network();
    still(sim, ...sim.ids);
    const victim = ['p2', 'p3', 'p4'].find((id) => h(sim, id).firewall === 0 && !h(sim, id).twoFactor && h(sim, id).bits > 0);
    expect(victim).toBeDefined();
    expect(cast(sim, victim!, 'incident-response').ok).toBe(true);
    expect(zeroDayGuess(sim, 'p1', victim!, true).ok).toBe(true);
    expect(h(sim, victim!).incidents[0].kind).toBe('hacked');
    expect(h(sim, victim!).firewall).toBe(1);
    sim.run(600);
    expect(sim.chaos().effects.some((e) => e.cheatId === 'code-breakers.incident-response')).toBe(false);
  });

  it('Retry Script clears the wait on targets you just tried', () => {
    const sim = network();
    still(sim, 'p2');
    expect(zeroDayGuess(sim, 'p1', 'p2', false).ok).toBe(true);
    expect(h(sim, 'p1').tried.p2).toBe(sim.now);
    expect(cast(sim, 'p1', 'retry-script').ok).toBe(true);
    expect(h(sim, 'p1').tried.p2).toBeUndefined();
    expect(cast(sim, 'p1', 'retry-script').ok).toBe(false);
  });
});

describe('code-breakers pack: defences', () => {
  it('Firewall Patch, Firewall Breach, Cloud Backup, Corrupted Backup, Power Surge and Brownout move the real counters', () => {
    const sim = network();
    still(sim, ...sim.ids);
    const fw = h(sim, 'p1').firewall;
    if (fw < 2) {
      expect(cast(sim, 'p1', 'firewall-patch').ok).toBe(true);
      expect(h(sim, 'p1').firewall).toBe(fw + 1);
    }
    expect(cast(sim, 'p2', 'firewall-breach', 'p1').ok).toBe(true);
    expect(h(sim, 'p1').firewall).toBe(Math.min(2, fw + 1) - 1);

    if (h(sim, 'p3').backup === 0) expect(cast(sim, 'p3', 'cloud-backup').ok).toBe(true);
    expect(cast(sim, 'p3', 'cloud-backup').ok).toBe(false);
    expect(cast(sim, 'p4', 'corrupted-backup', 'p3').ok).toBe(true);
    expect(h(sim, 'p3').backup).toBe(0);

    sim.run(50_000);
    expect(cast(sim, 'p4', 'power-surge').ok).toBe(true);
    expect(h(sim, 'p4').surge).toBeGreaterThanOrEqual(3);
    expect(cast(sim, 'p1', 'brownout', 'p4').ok).toBe(true);
    expect(h(sim, 'p4')).toMatchObject({ surge: 0, double: 0 });
  });

  it('Firewall Buyback sells a firewall for 80 bits, and never past Bits to win', () => {
    const sim = network({ goalBits: 250 });
    still(sim, ...sim.ids);
    expect(h(sim, 'p1').bits).toBeLessThan(250);
    for (let i = 0; i < 6 && h(sim, 'p1').bits < 249; i++) {
      if (h(sim, 'p1').firewall === 0) expect(cast(sim, 'p1', 'firewall-patch').ok).toBe(true);
      const before = h(sim, 'p1').bits;
      expect(cast(sim, 'p1', 'firewall-buyback').ok).toBe(true);
      expect(h(sim, 'p1').bits).toBe(Math.min(249, before + 80));
      sim.run(50_000);
    }
    expect(h(sim, 'p1').bits).toBe(249);
    expect(sim.rt.status).toBe('running');
    if (h(sim, 'p1').firewall === 0) expect(cast(sim, 'p1', 'firewall-patch').ok).toBe(true);
    expect(cast(sim, 'p1', 'firewall-buyback').ok).toBe(false);
  });

  it('Authenticator App lends 2FA for 45 seconds; 2FA Outage takes it away for 20 and blocks buying it meanwhile', () => {
    const sim = network();
    still(sim, ...sim.ids);
    const bare = ['p1', 'p2', 'p3', 'p4'].find((id) => !h(sim, id).twoFactor)!;
    const other = ['p1', 'p2', 'p3', 'p4'].find((id) => id !== bare)!;
    expect(cast(sim, bare, 'authenticator').ok).toBe(true);
    expect(h(sim, bare).twoFactor).toBe(true);
    // Knocking out borrowed 2FA is refused, so the two never fight over the switch.
    expect(cast(sim, other, '2fa-outage', bare).ok).toBe(false);
    sim.run(45_500);
    expect(h(sim, bare).twoFactor).toBe(false);

    const locked = network({ lockdown: true });
    still(locked, ...locked.ids);
    expect(cast(locked, 'p1', 'authenticator').ok).toBe(false);
    expect(cast(locked, 'p1', '2fa-outage', 'p2').ok).toBe(true);
    expect(h(locked, 'p2').twoFactor).toBe(false);
    expect(locked.rt.act('p2', { type: 'buy', item: 'twoFactor' }).ok).toBe(false);
    locked.run(20_500);
    expect(h(locked, 'p2').twoFactor).toBe(true);
  });
});

describe('code-breakers pack: events and the Vault', () => {
  it('Trigger a Glitch replaces decoys and wipes notes; one event at a time; System Restore and Event Overtime', () => {
    const sim = network();
    still(sim, 'p1', 'p2');
    expect(cast(sim, 'p1', 'brute-force', 'p2').ok).toBe(true);
    const { password, decoys, version } = h(sim, 'p2');
    expect(cast(sim, 'p3', 'start-glitch').ok).toBe(true);
    expect(sim.state().event).toMatchObject({ id: 'glitch', endsAt: sim.now + 20_000 });
    expect(h(sim, 'p2').password).toBe(password);
    expect(h(sim, 'p2').decoys).not.toEqual(decoys);
    expect(h(sim, 'p2').version).toBe(version + 1);
    expect(h(sim, 'p1').notes.p2).toBeUndefined();
    expect(cast(sim, 'p4', 'start-storm').ok).toBe(false);

    const ends = sim.state().event.endsAt;
    expect(cast(sim, 'p4', 'event-overtime').ok).toBe(true);
    expect(sim.state().event.endsAt).toBe(ends + 15_000);
    expect(cast(sim, 'p2', 'system-restore').ok).toBe(true);
    expect(sim.state().event).toBeNull();
    expect(cast(sim, 'p4', 'start-storm').ok).toBe(true);
    expect(sim.state().event.id).toBe('storm');
  });

  it('Vault Jackpot fills the Vault by half; Vault Rekey changes its password and wipes notes on it', () => {
    const sim = network({ heist: true });
    still(sim, ...sim.ids);
    const before = sim.state().vault.bits;
    expect(cast(sim, 'p1', 'vault-jackpot').ok).toBe(true);
    expect(sim.state().vault.bits).toBe(before + Math.round(before / 2));
    const { password, version } = sim.state().vault;
    expect(cast(sim, 'p2', 'vault-rekey').ok).toBe(true);
    expect(sim.state().vault.password).not.toBe(password);
    expect(sim.state().vault.version).toBe(version + 1);
    for (const id of sim.ids) expect(h(sim, id).notes[VAULT.id]).toBeUndefined();

    const plain = network();
    expect(cast(plain, 'p1', 'vault-jackpot').ok).toBe(false);
  });
});
