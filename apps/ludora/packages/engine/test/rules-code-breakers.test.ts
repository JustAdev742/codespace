import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { codeBreakers, drawPacket } from '../src/modes/code-breakers/index.ts';
import {
  BITS_ODDS,
  BOOST_ODDS,
  DEFENCE_ODDS,
  EVENT_TIMING,
  HACK_ODDS,
  INTRUSION_BITS,
  KIND_WEIGHTS,
  OPTIONS,
  PASSWORD_CHOICES,
  SHOP,
  STEAL,
  TIMING,
  VAULT,
  variants,
  type PacketKind,
} from '../src/modes/code-breakers/meta.ts';
import { bitsAmount, contentWeights, kindWeights, levelMultiplier, oddsTable, stealAmount, stealRule } from '../src/modes/code-breakers/odds.ts';
import { findAnswerLeaks, simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { drive, MCQ, type Driven, type Seat } from './rule-helpers.ts';

/*
 * Code Breakers rules, driven through a real GameRuntime on a fake clock.
 * Multiple-choice questions, so `right` and `wrong` are known. Packet
 * contents and real passwords are read from the game state, never from a
 * view; a view shows only a packet's kind, and a password only to its owner
 * (or as one of four look-alike options to a hacker mid-guess).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const pickVariant = (id: string) => variants.find((v) => v.meta.id === id)!;

/** A game with events off unless a test asks for them. Every player's password is chosen up front. */
function game(o: { players?: Seat[]; settings?: Record<string, unknown>; common?: Record<string, number>; teams?: number; seed?: number; choose?: boolean } = {}) {
  const h = drive(codeBreakers, { players: o.players ?? ['a', 'b'], questions: MCQ, teams: o.teams ?? 0, seed: o.seed ?? 7, common: o.common ?? {}, settings: { events: false, ...o.settings } });
  if (o.choose !== false) for (const seat of o.players ?? ['a', 'b']) choose(h, typeof seat === 'string' ? seat : seat.id, 0);
  return h;
}

const hk = (h: Driven, id: string) => h.state().hackers[id];
const bitsOf = (h: Driven, id: string): number => hk(h, id).bits;
const v = (h: Driven, id: string): any => h.view(id);
const you = (h: Driven, id: string): any => h.view(id).you;

const choose = (h: Driven, id: string, index: number) => h.rt.act(id, { type: 'choosePassword', index });
const pick = (h: Driven, id: string, index: number) => h.rt.act(id, { type: 'pick', offer: hk(h, id).offer.seq, index });
const guess = (h: Driven, id: string, index: number) => h.rt.act(id, { type: 'guess', seq: hk(h, id).hack.seq, index });
const target = (h: Driven, id: string, who: string) => h.rt.act(id, { type: 'target', playerId: who });
const buy = (h: Driven, id: string, item: 'firewall' | 'twoFactor' | 'password') => h.rt.act(id, { type: 'buy', item });

type P = { kind: PacketKind; content: string };

interface FillOpts {
  /** A throwaway player any forced hack is aimed at, so it never touches the real target. */
  sink?: string;
  /** Keep this player's defences clean: prefer a forced hack over opening a firewall or backup. */
  clean?: boolean;
}

/** The real password of a target (a player or the vault). */
function secretPassword(h: Driven, targetId: string): string {
  return targetId === VAULT.id ? h.state().vault.password : hk(h, targetId).password;
}

/** The option index that is the target's real password, as this hacker sees the options. */
function rightIndex(h: Driven, id: string, targetId: string): number {
  const opts = (you(h, id).hack.options as { text: string }[]).map((o) => o.text);
  return opts.indexOf(secretPassword(h, targetId));
}

/** An option this hacker can get wrong on the current target (never the real password). */
function wrongIndex(h: Driven, id: string): number {
  const real = secretPassword(h, hk(h, id).hack.target);
  const opts = (you(h, id).hack.options as { text: string }[]).map((o) => o.text);
  const at = opts.findIndex((t) => t !== real);
  return at >= 0 ? at : 0;
}

/** Which packet a filler should open, avoiding anything that would spoil a test. */
function fillerIndex(h: Driven, id: string, opts: FillOpts): number {
  const packets = hk(h, id).offer.packets as P[];
  const score = (p: P) => {
    if (p.kind === 'bits') return 0;
    if (p.kind === 'boost') return 1;
    if (p.kind === 'defence' && p.content === 'password') return 2;
    // When keeping a player clean, a forced hack is always better than gaining a firewall or backup.
    if (p.kind === 'hack') return opts.clean ? 3 : opts.sink ? 4 : 9;
    // Last resort for a clean earner: a firewall is strippable later, a backup is not, so prefer the firewall.
    if (p.kind === 'defence') return opts.clean ? (p.content === 'firewall' ? 6 : 7) : 3;
    return 9;
  };
  let best = 0;
  packets.forEach((p, i) => {
    if (score(p) < score(packets[best]!)) best = i;
  });
  return best;
}

/** Resolve whatever a player has open (choosing, an offer, a hack flow) until a question shows. */
function settle(h: Driven, id: string, opts: FillOpts = {}) {
  for (let i = 0; i < 100; i++) {
    const s = hk(h, id);
    if (!s) return;
    if (s.choosing) {
      choose(h, id, 0);
      continue;
    }
    if (s.hack) {
      if (s.hack.stage === 'target') {
        const open = (you(h, id).hack.targets as any[]).filter((t) => !t.blocked);
        const want = opts.sink && open.find((t) => t.playerId === opts.sink);
        const chosen = want ?? open[0];
        if (!chosen) {
          h.tick(TIMING.targetSec * 1000 + 1);
          continue;
        }
        expect(target(h, id, chosen.playerId).ok).toBe(true);
        continue;
      }
      if (s.hack.stage === 'verify') {
        h.answer(id, 'wrong');
        continue;
      }
      expect(guess(h, id, wrongIndex(h, id)).ok).toBe(true); // a filler hack never actually steals
      continue;
    }
    if (s.offer) {
      expect(pick(h, id, fillerIndex(h, id, opts)).ok).toBe(true);
      continue;
    }
    return;
  }
  throw new Error(`${id} could not settle`);
}

/** Answer right until an offer holds a matching packet; return its index, offer left open. */
function offerWith(h: Driven, id: string, match: (p: P) => boolean, opts: FillOpts = {}, tries = 1500): number {
  for (let i = 0; i < tries; i++) {
    settle(h, id, opts);
    expect(h.answer(id, 'right').ok).toBe(true);
    const packets = hk(h, id).offer.packets as P[];
    const at = packets.findIndex(match);
    if (at >= 0) return at;
    pick(h, id, fillerIndex(h, id, opts));
  }
  throw new Error(`no matching packet turned up for ${id}`);
}

/** Give a player at least `n` bits from Bits packets, keeping their defences clean. */
function earn(h: Driven, id: string, n: number, sink?: string) {
  const opts: FillOpts = { sink, clean: true };
  for (let guard = 0; bitsOf(h, id) < n && guard < 800; guard++) {
    pick(h, id, offerWith(h, id, (p) => p.kind === 'bits', opts));
    settle(h, id, opts);
  }
  expect(bitsOf(h, id)).toBeGreaterThanOrEqual(n);
}

/** Open a hack packet and choose `targetId`, leaving the guess open. Returns the index of the target's real password. */
function hackTo(h: Driven, id: string, targetId: string, opts: { kind?: 'hack' | 'hint'; sink?: string } = {}): number {
  const at = offerWith(h, id, (p) => p.kind === 'hack' && p.content === (opts.kind ?? 'hack'), { sink: opts.sink });
  expect(pick(h, id, at).ok).toBe(true);
  expect(hk(h, id).hack.stage).toBe('target');
  expect(target(h, id, targetId).ok).toBe(true);
  expect(hk(h, id).hack.stage).toBe('guess');
  return rightIndex(h, id, targetId);
}

/* ---------------------------------- odds ---------------------------------- */

describe('Code Breakers odds', () => {
  it('every table adds up to 100', () => {
    const sum = (rows: readonly { weight: number }[]) => rows.reduce((n, r) => n + r.weight, 0);
    expect(Object.values(KIND_WEIGHTS).reduce((n, w) => n + w, 0)).toBe(100);
    for (const rows of [BITS_ODDS, BOOST_ODDS, HACK_ODDS, DEFENCE_ODDS]) expect(sum(rows)).toBe(100);
    expect(kindWeights({ lockdown: false })).toEqual({ bits: 46, boost: 14, hack: 22, defence: 18 });
    // Lockdown moves the lost hack weight to bits, so the kinds still total 100.
    expect(kindWeights({ lockdown: true })).toEqual({ bits: 56, boost: 14, hack: 12, defence: 18 });
    for (const lockdown of [false, true]) expect(oddsTable({ lockdown, event: null, level: 1, surge: 0, double: 0, firewall: 0, backup: 0 }).reduce((n, g) => n + g.percent, 0)).toBeCloseTo(100, 0);
  });

  it('seeded sampling lands near the published odds', () => {
    for (const lockdown of [false, true]) {
      const rng = createRng(2024);
      const n = 60_000;
      const kinds: Record<string, number> = {};
      const contents: Record<string, number> = {};
      for (let i = 0; i < n; i++) {
        const p = drawPacket({ lockdown }, rng);
        kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
        contents[p.content] = (contents[p.content] ?? 0) + 1;
      }
      const w = kindWeights({ lockdown });
      for (const kind of Object.keys(w)) expect(Math.abs(kinds[kind]! / n - w[kind as PacketKind] / 100), `${kind} ${String(lockdown)}`).toBeLessThan(0.01);
      for (const kind of ['bits', 'boost', 'hack', 'defence'] as const) {
        const rows = contentWeights(kind);
        const total = rows.reduce((s, r) => s + r.weight, 0);
        for (const r of rows) expect(Math.abs((contents[r.id] ?? 0) / kinds[kind]! - r.weight / total), r.id).toBeLessThan(0.02);
      }
    }
  });

  it('steal takes a share of the target, with a floor and a cap; a bounty doubles both', () => {
    expect(stealRule(false, false)).toEqual(STEAL.normal);
    expect(stealRule(true, false)).toEqual(STEAL.lockdown);
    expect(stealRule(false, true)).toEqual({ percent: 40, min: STEAL.normal.min, max: 800 });
    expect(stealAmount(1000, STEAL.normal)).toBe(200);
    expect(stealAmount(20, STEAL.normal)).toBe(STEAL.normal.min); // the floor
    expect(stealAmount(5, STEAL.normal)).toBe(5); // never more than they have
    expect(stealAmount(5000, STEAL.normal)).toBe(STEAL.normal.max); // the cap
    expect(stealAmount(0, STEAL.normal)).toBe(0);
  });
});

/* ------------------------------- passwords -------------------------------- */

describe('Code Breakers passwords', () => {
  it('offers three passphrases; choosing one makes it the password with three decoys', () => {
    const h = game({ choose: false });
    const offered = you(h, 'a').choosing.options as string[];
    expect(offered).toHaveLength(PASSWORD_CHOICES);
    expect(you(h, 'a').password).toBeNull();
    expect(you(h, 'a').question).toBeNull();
    expect(choose(h, 'a', 1).ok).toBe(true);
    expect(hk(h, 'a').password).toBe(offered[1]);
    // The decoys are the other two offered phrases plus one more, so there are four options in all.
    expect(hk(h, 'a').decoys).toHaveLength(OPTIONS - 1);
    for (const other of offered.filter((_, i) => i !== 1)) expect(hk(h, 'a').decoys).toContain(other);
    expect(you(h, 'a').password).toBe(offered[1]);
    expect(you(h, 'a').question).not.toBeNull();
    expect(choose(h, 'a', 0)).toMatchObject({ ok: false });
  });

  it('picks the first passphrase when the timer runs out, or when a player answers before choosing', () => {
    const timeout = game({ choose: false });
    const first = you(timeout, 'a').choosing.options[0];
    timeout.tick(TIMING.passwordSec * 1000);
    expect(hk(timeout, 'a').password).toBe(first);
    expect(hk(timeout, 'a').choosing).toBeNull();

    const early = game({ choose: false });
    const firstB = you(early, 'b').choosing.options[0];
    expect(early.rt.act('b', { type: 'answer', iid: 'q1', answer: { type: 'mcq', choiceId: 'c0' } }).ok).toBe(true);
    expect(hk(early, 'b').password).toBe(firstB);
    expect(you(early, 'b').question).not.toBeNull();
  });

  it('never shows a password in anyone else’s view, yet shows it to its owner', () => {
    const h = game({ players: ['a', 'b', 'c'] });
    earn(h, 'a', 60, 'b');
    earn(h, 'b', 60, 'c');
    earn(h, 'c', 60, 'a');
    // Nobody is mid-guess here, so each password must appear only in its owner's view.
    for (const owner of ['a', 'b', 'c']) {
      const password = hk(h, owner).password as string;
      expect(you(h, owner).password).toBe(password);
      for (const other of ['a', 'b', 'c']) {
        if (other === owner) continue;
        expect(JSON.stringify(h.view(other))).not.toContain(password);
      }
    }
    expect(JSON.stringify(h.host())).not.toContain(hk(h, 'a').password);
    for (const id of ['a', 'b', 'c']) expect(findAnswerLeaks(h.view(id))).toEqual([]);
  });

  it('during a guess the password is one of four options, with nothing marking which is real', () => {
    const h = game({ players: ['a', 'b', 's'] });
    hackTo(h, 'a', 'b', { sink: 's' });
    const password = hk(h, 'b').password as string;
    const options = you(h, 'a').hack.options as { text: string }[];
    expect(options).toHaveLength(OPTIONS);
    // The real password is present, but there is no field telling the hacker which one it is.
    expect(options.map((o) => o.text)).toContain(password);
    for (const o of options) expect(Object.keys(o)).toEqual(['text']);
    // It appears only among those options for A: not elsewhere in A's view, not on the host screen.
    const aWithoutOptions = { ...you(h, 'a'), hack: null };
    expect(JSON.stringify(aWithoutOptions)).not.toContain(password);
    expect(JSON.stringify(h.host())).not.toContain(password);
    // And B's own view shows B's password (B owns it), but no other player's does.
    expect(you(h, 'b').password).toBe(password);
  });

  it('decoy order is stable for a hacker and differs between hackers, and changes when the password changes', () => {
    const h = game({ players: ['a', 'b', 'c', 's'] });
    const orderFor = (hacker: string, tgt: string) => {
      const at = offerWith(h, hacker, (p) => p.kind === 'hack' && p.content === 'hack', { sink: 's' });
      pick(h, hacker, at);
      target(h, hacker, tgt);
      const opts = (you(h, hacker).hack.options as { text: string }[]).map((o) => o.text);
      // Read twice: the order must not shift between views.
      const again = (you(h, hacker).hack.options as { text: string }[]).map((o) => o.text);
      expect(again).toEqual(opts);
      guess(h, hacker, wrongIndex(h, hacker)); // clears the hack without stealing
      settle(h, hacker, { sink: 's' });
      h.tick(TIMING.guardSec * 1000 + 1);
      return opts;
    };
    const aSees = orderFor('a', 'c');
    const bSees = orderFor('b', 'c');
    expect([...aSees].sort()).toEqual([...bSees].sort()); // same four options
    expect(aSees).not.toEqual(bSees); // but a different order for each hacker
    expect(aSees).toHaveLength(OPTIONS);
  });
});

/* --------------------------------- packets -------------------------------- */

describe('Code Breakers packets', () => {
  it('a right answer offers three packets showing only their kind; a wrong answer brings the next question', () => {
    const h = game({ players: ['a'] });
    expect(h.answer('a', 'wrong').ok).toBe(true);
    expect(you(h, 'a')).toMatchObject({ offer: null, last: { correct: false, text: 'No packet' } });
    expect(you(h, 'a').question).not.toBeNull();

    expect(h.answer('a', 'right').ok).toBe(true);
    const v = you(h, 'a');
    expect(v.question).toBeNull();
    expect(v.last).toMatchObject({ correct: true, text: 'Pick a packet.' });
    expect(v.offer.packets).toHaveLength(3);
    for (const p of v.offer.packets) {
      expect(['bits', 'boost', 'hack', 'defence']).toContain(p.kind);
      expect('content' in p).toBe(false);
    }
    expect(h.rt.act('a', { type: 'answer', iid: 'q1', answer: { type: 'mcq', choiceId: 'c0' } })).toMatchObject({ ok: false, message: 'Pick a packet first.' });
    expect(pick(h, 'a', 0).ok).toBe(true);
    expect(you(h, 'a').offer).toBeNull();
    expect(you(h, 'a').opened.seq).toBe(v.offer.seq);
  });

  it('Bits packets pay bits, and every 5 right answers they pay more', () => {
    const h = game({ players: ['a'] });
    const first = offerWith(h, 'a', (p) => p.kind === 'bits');
    const before = bitsOf(h, 'a');
    const row = BITS_ODDS.find((r) => r.id === (hk(h, 'a').offer.packets[first] as P).content)!;
    const b0 = you(h, 'a').boosts;
    expect(pick(h, 'a', first).ok).toBe(true);
    // Level 1 at the start; any boost picked up along the way is applied too.
    expect(bitsOf(h, 'a') - before).toBe(bitsAmount(row.bits, { level: 1, event: null, surge: b0.surge, double: b0.double }));

    while (hk(h, 'a').stream.correct < 5) {
      settle(h, 'a');
      h.answer('a', 'right');
      pick(h, 'a', fillerIndex(h, 'a', {}));
    }
    expect(you(h, 'a').level).toBe(2);
    const at = offerWith(h, 'a', (p) => p.kind === 'bits');
    const row2 = BITS_ODDS.find((r) => r.id === (hk(h, 'a').offer.packets[at] as P).content)!;
    const was = bitsOf(h, 'a');
    const b2 = you(h, 'a').boosts;
    pick(h, 'a', at);
    expect(bitsOf(h, 'a') - was).toBe(bitsAmount(row2.bits, { level: 2, event: null, surge: b2.surge, double: b2.double }));
    expect(you(h, 'a').opened.detail).toContain('Level 2 bonus.');
  });
});

/* --------------------------------- hacking -------------------------------- */

describe('Code Breakers hacking', () => {
  it('a right guess takes 20% of the target’s bits and opens a hack-back window', () => {
    const h = game({ players: ['a', 'b', 's'] });
    earn(h, 'b', 300, 's');
    const idx = hackTo(h, 'a', 'b', { sink: 's' });
    const bBefore = bitsOf(h, 'b');
    const aBefore = bitsOf(h, 'a');
    const expected = stealAmount(bBefore, STEAL.normal);
    expect(expected).toBeGreaterThan(0);
    expect(guess(h, 'a', idx).ok).toBe(true);
    expect(bitsOf(h, 'b')).toBe(bBefore - expected);
    expect(bitsOf(h, 'a')).toBe(aBefore + expected);
    expect(you(h, 'a').result).toMatchObject({ outcome: 'stolen', bits: expected });
    expect(you(h, 'b').incidents[0]).toMatchObject({ kind: 'hacked', bits: expected, knows: true });
    expect(you(h, 'a').question).not.toBeNull();
    // B now has a free hack back on A within 30 seconds.
    expect(you(h, 'b').hackBack).toMatchObject({ playerId: 'a' });
  });

  it('a firewall absorbs a right guess and breaks; both are told', () => {
    const h = game({ players: ['a', 'b', 's'] });
    earn(h, 'b', SHOP.firewall.cost + 200, 's');
    expect(buy(h, 'b', 'firewall').ok).toBe(true);
    expect(hk(h, 'b').firewall).toBe(1);
    const idx = hackTo(h, 'a', 'b', { sink: 's' });
    const bBefore = bitsOf(h, 'b');
    expect(guess(h, 'a', idx).ok).toBe(true);
    expect(hk(h, 'b').firewall).toBe(0);
    expect(bitsOf(h, 'b')).toBe(bBefore); // nothing taken
    expect(you(h, 'a').result.outcome).toBe('firewall');
    expect(you(h, 'b').incidents[0].kind).toBe('firewall');
    expect(h.feedTo('a').some((t) => /firewall blocked/.test(t))).toBe(true);
  });

  it('2FA makes a right guess need one more right answer before it counts', () => {
    const h = game({ players: ['a', 'b', 's'] });
    earn(h, 'b', SHOP.twoFactor.cost + 300, 's');
    expect(buy(h, 'b', 'twoFactor').ok).toBe(true);
    const idx = hackTo(h, 'a', 'b', { sink: 's' });
    const bBefore = bitsOf(h, 'b');
    expect(guess(h, 'a', idx).ok).toBe(true);
    // The guess was right, but now A must answer a question: nothing moved yet.
    expect(hk(h, 'a').hack.stage).toBe('verify');
    expect(you(h, 'a').question).not.toBeNull();
    expect(bitsOf(h, 'b')).toBe(bBefore);

    // Wrong answer: the hack is stopped.
    expect(h.answer('a', 'wrong').ok).toBe(true);
    expect(bitsOf(h, 'b')).toBe(bBefore);
    expect(you(h, 'a').result.outcome).toBe('twoFactor');
    expect(you(h, 'b').incidents[0].kind).toBe('twoFactor');

    // Try again and pass the 2FA this time.
    h.tick(TIMING.guardSec * 1000 + 1);
    const bNow = bitsOf(h, 'b');
    const idx2 = hackTo(h, 'a', 'b', { sink: 's' });
    expect(guess(h, 'a', idx2).ok).toBe(true);
    expect(hk(h, 'a').hack.stage).toBe('verify');
    expect(h.answer('a', 'right').ok).toBe(true);
    expect(you(h, 'a').result.outcome).toBe('stolen');
    expect(bitsOf(h, 'b')).toBeLessThan(bNow);
  });

  it('a wrong guess crosses that option off, warns the target and pays them a few bits', () => {
    const h = game({ players: ['a', 'b', 's'] });
    earn(h, 'b', 100, 's');
    const right = hackTo(h, 'a', 'b', { sink: 's' });
    const wrong = right === 0 ? 1 : 0;
    const wrongText = (you(h, 'a').hack.options as { text: string }[])[wrong]!.text;
    const bBefore = bitsOf(h, 'b');
    expect(guess(h, 'a', wrong).ok).toBe(true);
    expect(you(h, 'a').result.outcome).toBe('wrong');
    expect(bitsOf(h, 'b')).toBe(bBefore + INTRUSION_BITS);
    expect(you(h, 'b').incidents[0]).toMatchObject({ kind: 'intrusion', bits: INTRUSION_BITS });
    expect(hk(h, 'a').notes.b.crossed).toContain(wrongText);
    // The crossed option is gone from A's next attempt on B.
    h.tick(TIMING.guardSec * 1000 + 1);
    hackTo(h, 'a', 'b', { sink: 's' });
    expect((you(h, 'a').hack.options as { text: string }[]).map((o) => o.text)).not.toContain(wrongText);
    expect(you(h, 'a').hack.crossed).toContain(wrongText);
  });

  it('changing your password wipes what every hacker has learned about you', () => {
    const h = game({ players: ['a', 'b', 's'] });
    earn(h, 'b', SHOP.password.cost + 200, 's');
    // A rules out an option on B.
    const right = hackTo(h, 'a', 'b', { sink: 's' });
    const wrong = right === 0 ? 1 : 0;
    expect(guess(h, 'a', wrong).ok).toBe(true);
    expect(hk(h, 'a').notes.b.crossed.length).toBe(1);
    const oldPassword = hk(h, 'b').password;
    const oldVersion = hk(h, 'b').version;
    expect(buy(h, 'b', 'password').ok).toBe(true);
    expect(hk(h, 'b').password).not.toBe(oldPassword);
    expect(hk(h, 'b').version).toBe(oldVersion + 1);
    expect(hk(h, 'a').notes.b).toBeUndefined();
  });

  it('a hacked player gets one free hack back within 30 seconds', () => {
    const h = game({ players: ['a', 'b', 's'] });
    earn(h, 'b', 300, 's');
    earn(h, 'a', 200, 's');
    h.tick(TIMING.guardSec * 1000 + 1); // clear any guards A's own earning left on B
    const idx = hackTo(h, 'a', 'b', { sink: 's' });
    expect(guess(h, 'a', idx).ok).toBe(true);
    expect(you(h, 'b').hackBack).toMatchObject({ playerId: 'a' });
    // B spends the free hack back on A, guessing right.
    expect(h.rt.act('b', { type: 'hackBack' }).ok).toBe(true);
    expect(hk(h, 'b').hack).toMatchObject({ stage: 'guess', source: 'back', target: 'a' });
    expect(you(h, 'b').hackBack).toBeNull();
    const aBefore = bitsOf(h, 'a');
    const idx2 = rightIndex(h, 'b', 'a');
    expect(guess(h, 'b', idx2).ok).toBe(true);
    expect(bitsOf(h, 'a')).toBeLessThan(aBefore);
    // The window is one-shot: no second free hack back.
    expect(h.rt.act('b', { type: 'hackBack' })).toMatchObject({ ok: false });

    // After 30 seconds an unused window is gone.
    const h2 = game({ players: ['a', 'b', 's'] });
    earn(h2, 'b', 300, 's');
    const i2 = hackTo(h2, 'a', 'b', { sink: 's' });
    guess(h2, 'a', i2);
    h2.tick(TIMING.hackBackSec * 1000 + 1);
    expect(you(h2, 'b').hackBack).toBeNull();
    expect(h2.rt.act('b', { type: 'hackBack' })).toMatchObject({ ok: false });
  });

  it('in the first 15 seconds of a game, a rival you have never tried is open to hack', () => {
    const h = drive(codeBreakers, { players: ['a', 'b', 'c'], questions: MCQ, teams: 0, seed: 7, common: {}, settings: { events: false } });
    // The game clock starts near 0, so "never tried" must not read as "tried at time 0".
    h.clock.t = 0;
    for (const id of ['a', 'b', 'c']) choose(h, id, 0);
    pick(h, 'a', offerWith(h, 'a', (p) => p.kind === 'hack' && p.content === 'hack'));
    expect(h.clock.t).toBeLessThan(TIMING.guardSec * 1000);
    const rows = you(h, 'a').hack.targets as any[];
    expect(rows.map((r) => [r.playerId, r.blocked, r.until])).toEqual(expect.arrayContaining([['b', null, null], ['c', null, null]]));
    expect(target(h, 'a', 'b').ok).toBe(true);
  });

  it('you cannot hack yourself, a teammate, or a target you tried in the last 15 seconds', () => {
    const h = game({ players: [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }, { id: 'd', team: 2 }], teams: 2 });
    for (const id of ['c', 'd']) earn(h, id, 80, id === 'c' ? 'd' : 'c');
    const at = offerWith(h, 'a', (p) => p.kind === 'hack' && p.content === 'hack', { sink: 'c' });
    pick(h, 'a', at);
    expect((you(h, 'a').hack.targets as any[]).map((t) => t.playerId).sort()).toEqual(['c', 'd']); // never a or b
    expect(target(h, 'a', 'a')).toMatchObject({ ok: false, message: 'You cannot hack yourself.' });
    expect(target(h, 'a', 'b')).toMatchObject({ ok: false });
    // Try c (a wrong guess), then c is guarded while d is still open.
    expect(target(h, 'a', 'c').ok).toBe(true);
    const right = rightIndex(h, 'a', 'c');
    guess(h, 'a', right === 0 ? 1 : 0);
    settle(h, 'a', { sink: 'd' });
    const at2 = offerWith(h, 'a', (p) => p.kind === 'hack' && p.content === 'hack', { sink: 'd' });
    pick(h, 'a', at2);
    const rowC = (you(h, 'a').hack.targets as any[]).find((t) => t.playerId === 'c');
    expect(rowC.blocked).toBe('recent');
    expect(target(h, 'a', 'c')).toMatchObject({ ok: false });
    expect(target(h, 'a', 'd').ok).toBe(true);
  });
});

/* -------------------------------- defences -------------------------------- */

describe('Code Breakers defences', () => {
  it('defences cost bits, lowering your score', () => {
    const h = game({ players: ['a', 'b'] });
    expect(buy(h, 'a', 'firewall')).toMatchObject({ ok: false }); // no bits yet
    earn(h, 'a', SHOP.firewall.cost + SHOP.twoFactor.cost + 50);
    const before = bitsOf(h, 'a');
    expect(buy(h, 'a', 'firewall').ok).toBe(true);
    expect(bitsOf(h, 'a')).toBe(before - SHOP.firewall.cost);
    expect(hk(h, 'a').firewall).toBe(1);
    const mid = bitsOf(h, 'a');
    expect(buy(h, 'a', 'twoFactor').ok).toBe(true);
    expect(bitsOf(h, 'a')).toBe(mid - SHOP.twoFactor.cost);
    expect(hk(h, 'a').twoFactor).toBe(true);
    expect(buy(h, 'a', 'twoFactor')).toMatchObject({ ok: false }); // already have it
  });
});

/* ---------------------------------- events -------------------------------- */

describe('Code Breakers events', () => {
  it('Data Storm pays Bits packets double', () => {
    // Solo: nobody can be hacked, so the only event that can run is Data Storm.
    const h = game({ players: ['a'], settings: { events: true } });
    h.tick(EVENT_TIMING.firstSec * 1000);
    expect(v(h, 'a').event.id).toBe('storm');
    const at = offerWith(h, 'a', (p) => p.kind === 'bits');
    const row = BITS_ODDS.find((r) => r.id === (hk(h, 'a').offer.packets[at] as P).content)!;
    const before = bitsOf(h, 'a');
    const lvl = levelMultiplier(you(h, 'a').level);
    pick(h, 'a', at);
    expect(bitsOf(h, 'a') - before).toBe(Math.round(row.bits * lvl * 2));
    expect(you(h, 'a').opened.detail).toContain('Data Storm doubled it.');
  });

  it('a Bounty doubles what a hack takes from the leader', () => {
    for (let seed = 1; seed < 200; seed++) {
      const h = game({ players: ['a', 'b', 's'], seed, settings: { events: true } });
      earn(h, 'b', 500, 's');
      let tries = 0;
      while (v(h, 'a').event?.id !== 'bounty' && tries++ < 7) h.tick(EVENT_TIMING.everySec * 1000);
      if (v(h, 'a').event?.id !== 'bounty') continue;
      if (!v(h, 'a').bounty?.includes('b')) continue; // B must be the leader
      const idx = hackTo(h, 'a', 'b', { sink: 's' });
      const bBefore = bitsOf(h, 'b');
      const expected = stealAmount(bBefore, stealRule(false, true));
      const normal = stealAmount(bBefore, STEAL.normal);
      expect(expected).toBeGreaterThan(normal);
      expect(guess(h, 'a', idx).ok).toBe(true);
      expect(you(h, 'a').result.outcome).toBe('stolen'); // B has no defences
      expect(you(h, 'a').result.bits).toBe(expected);
      expect(you(h, 'a').result.detail).toContain('Bounty');
      return;
    }
    throw new Error('no seed produced a Bounty on the leader');
  });

  it('a System Glitch replaces everyone’s decoys and wipes every hacker’s notes', () => {
    for (let seed = 1; seed < 200; seed++) {
      const h = game({ players: ['a', 'b', 's'], seed, settings: { events: true } });
      earn(h, 'b', 80, 's');
      // A rules out an option on B.
      const right = hackTo(h, 'a', 'b', { sink: 's' });
      guess(h, 'a', right === 0 ? 1 : 0);
      settle(h, 'a', { sink: 's' });
      expect(hk(h, 'a').notes.b.crossed.length).toBe(1);
      const decoysBefore = [...hk(h, 'b').decoys];
      const passwordBefore = hk(h, 'b').password;
      const versionBefore = hk(h, 'b').version;

      let tries = 0;
      while (v(h, 'a').event?.id !== 'glitch' && tries++ < 7) h.tick(EVENT_TIMING.everySec * 1000);
      if (v(h, 'a').event?.id !== 'glitch') continue;
      expect(hk(h, 'b').password).toBe(passwordBefore); // your password itself is unchanged
      expect(hk(h, 'b').decoys).not.toEqual(decoysBefore); // but the decoys are new
      expect(hk(h, 'b').version).toBe(versionBefore + 1);
      expect(hk(h, 'a').notes.b).toBeUndefined(); // notes wiped
      return;
    }
    throw new Error('no seed produced a System Glitch');
  });
});

/* --------------------------------- games ---------------------------------- */

describe('Code Breakers games', () => {
  it('solo: a Hack packet becomes bits, since there is nobody to hack', () => {
    const h = game({ players: ['a'] });
    const at = offerWith(h, 'a', (p) => p.kind === 'hack');
    const before = bitsOf(h, 'a');
    expect(pick(h, 'a', at).ok).toBe(true);
    expect(hk(h, 'a').hack).toBeNull();
    expect(bitsOf(h, 'a')).toBeGreaterThan(before);
    expect(you(h, 'a').opened).toMatchObject({ kind: 'hack' });
    expect(you(h, 'a').opened.detail).toContain('became bits');
  });

  it('teams: you hack only the other team, and results average each team', () => {
    const h = game({ players: [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 2 }, { id: 'z', team: 2 }], teams: 2 });
    earn(h, 'c', 400, 'b'); // c is on team 2, so its filler hacks go to team 1's b
    const at = offerWith(h, 'a', (p) => p.kind === 'hack' && p.content === 'hack', { sink: 'z' });
    pick(h, 'a', at);
    expect((you(h, 'a').hack.targets as any[]).map((t) => t.playerId).sort()).toEqual(['c', 'z']);
    target(h, 'a', 'c');
    guess(h, 'a', rightIndex(h, 'a', 'c'));
    settle(h, 'a', { sink: 'z' });
    h.tick(500_000);
    const r = h.rt.results!;
    expect(r.endedBy).toBe('mode');
    expect(r.teamStandings).toHaveLength(2);
    const team1 = Math.round((bitsOf(h, 'a') + bitsOf(h, 'b')) / 2);
    expect(r.teamStandings.find((t: any) => t.teamId === 't1')).toMatchObject({ score: team1, label: `${team1.toLocaleString('en-GB')} bits on average` });
  });

  it('time ends the game and results list everyone by bits', () => {
    const h = game({ players: ['a', 'b', 'c'] });
    earn(h, 'a', 200, 'b');
    h.tick(500_000);
    const r = h.rt.results!;
    expect(r.endedBy).toBe('mode');
    expect(r.standings.map((s: any) => s.playerId).sort()).toEqual(['a', 'b', 'c']);
    for (const s of r.standings) expect(s.label).toBe(`${s.score.toLocaleString('en-GB')} ${s.score === 1 ? 'bit' : 'bits'}`);
    expect(r.standings[0].rank).toBe(1);
  });

  it('a goal ends the game on the spot', () => {
    const h = game({ players: ['a', 'b'], settings: { goalBits: 250 } });
    for (let guard = 0; h.rt.status === 'running' && guard < 500; guard++) {
      settle(h, 'a', { sink: 'b', clean: true });
      if (h.rt.status !== 'running') break;
      h.answer('a', 'right');
      const of = hk(h, 'a').offer;
      if (of) pick(h, 'a', fillerIndex(h, 'a', { sink: 'b', clean: true }));
    }
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results!.standings[0].playerId).toBe('a');
    expect(h.rt.results!.standings[0].score).toBeGreaterThanOrEqual(250);
    expect(h.rt.results!.summary).toMatch(/^A reached 250 bits first\./);
  });

  it('Heist: the vault is a shared target that fills up, and cracking it takes everything', () => {
    const h = game({ players: ['a', 'b'], settings: pickVariant('code-breakers-heist').settings });
    expect(v(h, 'a').vault).toMatchObject({ id: VAULT.id, name: VAULT.name });
    const vaultStart = h.state().vault.bits;
    earn(h, 'a', 200, 'b'); // every Bits packet adds to the vault
    expect(h.state().vault.bits).toBeGreaterThan(vaultStart);
    const at = offerWith(h, 'a', (p) => p.kind === 'hack' && p.content === 'hack', { sink: 'b' });
    pick(h, 'a', at);
    expect((you(h, 'a').hack.targets as any[]).some((t) => t.playerId === VAULT.id && t.vault)).toBe(true);
    expect(target(h, 'a', VAULT.id).ok).toBe(true);
    const idx = rightIndex(h, 'a', VAULT.id);
    const vaultBits = h.state().vault.bits;
    const aBefore = bitsOf(h, 'a');
    expect(guess(h, 'a', idx).ok).toBe(true);
    // The vault always has 2FA.
    expect(hk(h, 'a').hack.stage).toBe('verify');
    expect(h.answer('a', 'right').ok).toBe(true);
    expect(bitsOf(h, 'a')).toBe(aBefore + vaultBits);
    expect(h.state().vault.bits).toBe(VAULT.restart);
    expect(h.state().vault.cracks).toBe(1);
    expect(you(h, 'a').result.outcome).toBe('stolen');
  });

  it('Lockdown: everyone starts with 2FA', () => {
    const h = game({ players: ['a', 'b'], settings: pickVariant('code-breakers-lockdown').settings });
    expect(hk(h, 'a').twoFactor).toBe(true);
    expect(hk(h, 'b').twoFactor).toBe(true);
    expect(kindWeights({ lockdown: true }).hack).toBe(12);
  });

  it('keeps a player view under 8 KB with 40 players', () => {
    const seats = Array.from({ length: 40 }, (_, i) => `p${i + 1}`);
    const h = game({ players: seats, settings: { events: true } });
    // Give the view plenty to carry: bits, incidents, notes and an open hack.
    earn(h, 'p1', 120, 'p40');
    earn(h, 'p2', 120, 'p39');
    earn(h, 'p3', 120, 'p38');
    const right = hackTo(h, 'p1', 'p2', { sink: 'p40' });
    guess(h, 'p1', right === 0 ? 1 : 0); // a wrong guess leaves an incident and a note
    h.tick(TIMING.guardSec * 1000 + 1);
    hackTo(h, 'p1', 'p3', { sink: 'p40' }); // leave a hack guess open
    const size = JSON.stringify(h.view('p1')).length;
    expect(size).toBeLessThan(8192);
    const hostSize = JSON.stringify(h.host()).length;
    expect(hostSize).toBeLessThan(12_000);
  });

  it('bots play a whole game, hack sometimes and leak nothing', () => {
    const r = simulateGame({ modeId: 'code-breakers', mode: codeBreakers, questions: MIXED_SET, players: 8, seed: 31 });
    expect(r.errors).toEqual([]);
    expect(r.leaks).toEqual([]);
    expect(r.stalled).toBe(false);
    expect(r.results!.standings.every((s) => s.stats.answered > 0)).toBe(true);
    expect(r.results!.standings[0]!.score).toBeGreaterThan(0);
  });
});
