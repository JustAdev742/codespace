import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, target, transfer } from '../cheats/kit.ts';
import {
  BITS_ODDS,
  DOUBLE,
  EVENT_INFO,
  EVENT_TIMING,
  FIREWALL_MAX,
  INTRUSION_BITS,
  OFFER_SIZE,
  OPTIONS,
  PASSWORD_COOLDOWN_SEC,
  SHOP,
  SURGE,
  TIMING,
  VAULT,
  type ContentId,
  type EventId,
} from '../../modes/code-breakers/meta.ts';
import { levelMultiplier, levelOf } from '../../modes/code-breakers/odds.ts';
import { makePhrases } from '../../modes/code-breakers/words.ts';
import { drawPacket } from '../../modes/code-breakers/index.ts';

/*
 * Cheats that only make sense in Code Breakers: bits packets, boosts,
 * firewalls, backups, 2FA, passwords and decoys, hackers' notes, hack backs,
 * events and the Heist vault.
 *
 * Bits, firewalls, backups and boost charges move through the adapter's
 * meters, so those cheats can be undone. Cheats that change passwords, notes,
 * offers, hacks or events write the mode's state and are not.
 *
 * No cheat tells anyone a password. Brute Force and Data Leak cross off
 * decoys the way a hint packet does, and always leave at least one decoy
 * standing, so a guess is never a sure thing. Packets drawn by a cheat come
 * from the same odds players see.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODE = 'code-breakers';
const M = [MODE] as const;
const NEWS_KEEP = 8;
const LOOKBACK_MS = 60_000;

type Api = ChaosApi;
const hacker = (api: Api, id: string): any => api.s.hackers[id];
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const bitsText = (n: number) => `${fmt(n)} ${Math.round(n) === 1 ? 'bit' : 'bits'}`;

/** Rivals who could be hacked right now: opponents who have picked a password. */
const readyRivals = (api: Api, id: string) => api.opponents(id).filter((r) => hacker(api, r)?.password);

/** How many more bits a player can get before "Bits to win", which only the mode may award. */
function roomUp(api: Api, id: string): number {
  const goal = Number(api.ctx.settings.goalBits);
  return api.s.winner === null && goal > 0 ? Math.max(0, goal - 1 - (hacker(api, id)?.bits ?? 0)) : Number.MAX_SAFE_INTEGER;
}

/** This transaction's Bits packet opened by `id`, seen once per effect. */
function freshBits(api: Api, fx: ActiveEffect, id: string): any | null {
  const o = hacker(api, id)?.opened;
  if (!o || o.at !== api.now() || o.kind !== 'bits') return null;
  const seen = (fx.data.seen ?? {}) as Record<string, number>;
  return seen[id] === o.seq ? null : o;
}

/** This transaction's newest incident on `id` of `kind`, seen once per effect. */
function freshIncident(api: Api, fx: ActiveEffect, id: string, kind: string): any | null {
  const inc = hacker(api, id)?.incidents?.[0];
  if (!inc || inc.at !== api.now() || inc.kind !== kind) return null;
  const seen = (fx.data.seen ?? {}) as Record<string, number>;
  return seen[id] === inc.id ? null : inc;
}

function markSeen(fx: ActiveEffect, id: string, seq: number) {
  fx.data.seen = { ...((fx.data.seen ?? {}) as Record<string, number>), [id]: seq };
}

/** Rewrite an opened Bits packet's card so it shows what really arrived. */
function rewriteCard(opened: any, delta: number, line: string) {
  opened.delta = delta;
  opened.title = `+${bitsText(delta)}`;
  opened.detail = [opened.detail, line].filter(Boolean).join(' ');
}

function wipeNotesAbout(api: Api, targetId: string) {
  for (const h of Object.values(api.s.hackers) as any[]) delete h.notes[targetId];
}

/** Options a hacker has crossed off for a target, with their teammates' when team intel shares notes. */
function knownCrossed(api: Api, hackerId: string, targetId: string): Set<string> {
  const team = api.ctx.settings.teamIntel === true && api.teams().length ? api.teamOf(hackerId) : null;
  const ids = team ? api.ids().filter((id) => api.teamOf(id) === team) : [hackerId];
  return new Set(ids.flatMap((id) => (hacker(api, id)?.notes[targetId]?.crossed ?? []) as string[]));
}

/** Decoys of `t` that a hacker has not crossed off yet. */
function openDecoys(api: Api, hackerId: string, targetId: string): string[] {
  const known = knownCrossed(api, hackerId, targetId);
  return (hacker(api, targetId).decoys as string[]).filter((d) => !known.has(d));
}

function crossOff(h: any, targetId: string, decoy: string) {
  (h.notes[targetId] ??= { crossed: [], cracked: false }).crossed.push(decoy);
}

/* --------------------------------- events --------------------------------- */

const eventOn = (api: Api) => Boolean(api.s.event && api.s.event.endsAt > api.now());

function hacksPossible(api: Api): boolean {
  if (api.s.vault) return true;
  return api.ids().some((id) => hacker(api, id)?.password && readyRivals(api, id).length > 0);
}

function addNews(api: Api, item: Record<string, unknown>) {
  api.s.news = [{ id: ++api.s.seq, at: api.now(), by: null, to: null, bits: 0, event: null, ...item }, ...api.s.news].slice(0, NEWS_KEEP);
}

/** System Glitch, as the mode runs it: new decoys for every password (and the vault), and everyone's notes wiped. */
function glitch(api: Api) {
  for (const [id, h] of Object.entries(api.s.hackers) as [string, any][]) {
    if (!h.password) continue;
    h.decoys = makePhrases(api.rng, OPTIONS - 1, [h.password, ...h.decoys]);
    h.version++;
    wipeNotesAbout(api, id);
  }
  const v = api.s.vault;
  if (v) {
    v.decoys = makePhrases(api.rng, OPTIONS - 1, [v.password, ...v.decoys]);
    v.version++;
    wipeNotesAbout(api, VAULT.id);
  }
}

function startEvent(api: Api, id: EventId): void | { error: string } {
  if (eventOn(api)) return { error: `${EVENT_INFO[api.s.event.id as EventId].label} is already on.` };
  if (EVENT_INFO[id].needsHacks && !hacksPossible(api)) return { error: 'Nobody can hack anybody right now.' };
  const at = api.now();
  const endsAt = at + EVENT_TIMING.lastsSec * 1000;
  api.s.event = { id, startedAt: at, endsAt };
  api.s.lastEvent = id;
  api.ctx.setTimer('eventEnd', endsAt);
  addNews(api, { kind: 'event', event: id });
  api.feed(`${EVENT_INFO[id].label}: ${EVENT_INFO[id].blurb} (${String(EVENT_TIMING.lastsSec)} seconds)`, 'big');
  if (id === 'glitch') glitch(api);
}

/* --------------------------------- packets -------------------------------- */

const CONTENT_TEXT: Record<ContentId, string> = {
  ...(Object.fromEntries(BITS_ODDS.map((r) => [r.id, `${String(r.bits)} bits before bonuses`])) as Record<string, string>),
  surge: 'Surge',
  double: 'Double',
  hack: 'Hack',
  hint: 'Hack with a hint',
  firewall: 'Firewall',
  backup: 'Backup',
  password: 'New password',
} as Record<ContentId, string>;

const PLACES = ['Left', 'Middle', 'Right'];

/** Lasting cheats that are used up: run their check each tick and end themselves once used. */
const endWhenUsed = {
  tick(api: Api, fx: ActiveEffect) {
    if (fx.data.used) api.endEffect(fx.eid, 'used');
  },
};

const cheats: CheatDef[] = [
  /* ----------------------------- your own system ---------------------------- */
  {
    id: 'code-breakers.overclock',
    name: 'Overclocked Chip',
    category: 'score',
    description: 'For 20 seconds, every Bits packet you open pays half as much again.',
    target: 'self',
    modes: M,
    needs: ['meter:score'],
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 20_000,
    tags: ['x:code-breakers-packets'],
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const id = target(fx);
          const o = freshBits(api, fx, id);
          if (!o || !(d[id]! > 0)) return;
          markSeen(fx, id, o.seq);
          const extra = Math.min(Math.max(1, Math.round(d[id]! / 2)), roomUp(api, id));
          if (extra <= 0) return;
          d[id] = d[id]! + extra;
          rewriteCard(o, d[id]!, 'Overclocked Chip: half as much again.');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Overclocked', tone: 'good' }),
  },
  {
    id: 'code-breakers.firewall-patch',
    name: 'Firewall Patch',
    category: 'advantage',
    description: `Put up a firewall without opening a packet (you can hold ${String(FIREWALL_MAX)}).`,
    target: 'self',
    modes: M,
    needs: ['meter:firewall'],
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      if (api.add('firewall', c.caster, 1) <= 0) return { error: 'Your firewalls are full.' };
    },
  },
  {
    id: 'code-breakers.cloud-backup',
    name: 'Cloud Backup',
    category: 'advantage',
    description: 'Get a backup now: it gives back half of the next hack that lands on you.',
    target: 'self',
    modes: M,
    needs: ['meter:backup'],
    cost: 20,
    cooldownMs: 45_000,
    apply: (api, c) => {
      if (api.add('backup', c.caster, 1) <= 0) return { error: 'You already hold a backup.' };
    },
  },
  {
    id: 'code-breakers.power-surge',
    name: 'Power Surge',
    category: 'score',
    description: `Get ${String(SURGE.charges)} Surge charges: your next Bits packets pay ×${String(SURGE.mult)} (you can hold ${String(SURGE.max)}).`,
    target: 'self',
    modes: M,
    needs: ['meter:surge'],
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      if (api.add('surge', c.caster, SURGE.charges) <= 0) return { error: 'Your Surge charges are full.' };
    },
  },
  {
    id: 'code-breakers.double-charge',
    name: 'Double Charge',
    category: 'score',
    description: 'Get a Double: your next Bits packet pays double (you can hold 2).',
    target: 'self',
    modes: M,
    needs: ['meter:double'],
    cost: 30,
    cooldownMs: 50_000,
    apply: (api, c) => {
      if (api.add('double', c.caster, 1) <= 0) return { error: 'You already hold 2 Doubles.' };
    },
  },
  {
    id: 'code-breakers.authenticator',
    name: 'Authenticator App',
    category: 'advantage',
    description: 'Borrow 2FA for 45 seconds: a hacker who guesses your password must also answer a question right. It switches off afterwards.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 75_000,
    durationMs: 45_000,
    undoable: false,
    tags: ['code-breakers-lent-2fa'],
    conflicts: ['code-breakers-2fa-down'],
    apply: (api, c, fx) => {
      const h = hacker(api, c.caster);
      if (!h?.password) return { error: 'Choose your password first.' };
      if (h.twoFactor) return { error: 'You already have 2FA.' };
      h.twoFactor = true;
      if (fx) fx.data.lent = 1;
    },
    hooks: {
      end: (api, fx) => {
        const h = hacker(api, target(fx));
        if (h && fx.data.lent) h.twoFactor = false;
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Borrowed 2FA', tone: 'good' }),
  },
  {
    id: 'code-breakers.quick-rekey',
    name: 'Quick Rekey',
    category: 'advantage',
    description: 'A free new password and decoys right now, even if you changed it a moment ago. Hackers lose everything they had learned about you, and any guess at you in progress fizzles.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const h = hacker(api, c.caster);
      if (!h?.password) return { error: 'Choose your password first.' };
      const phrases = makePhrases(api.rng, OPTIONS, [h.password, ...h.decoys]);
      h.password = phrases[0];
      h.decoys = phrases.slice(1);
      h.version++;
      wipeNotesAbout(api, c.caster);
      h.passwordReadyAt = api.now() + PASSWORD_COOLDOWN_SEC * 1000;
      api.feed('Quick Rekey: new password. Hackers lost what they knew about you.', 'good', [c.caster]);
    },
  },
  {
    id: 'code-breakers.honeypot',
    name: 'Honeypot',
    category: 'economy',
    description: `For 30 seconds, every wrong guess at your password pays you ${String(INTRUSION_BITS * 4)} bits instead of ${String(INTRUSION_BITS)}.`,
    target: 'self',
    modes: M,
    needs: ['meter:score'],
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 30_000,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const id = target(fx);
          const inc = freshIncident(api, fx, id, 'intrusion');
          if (!inc || !(d[id]! > 0)) return;
          markSeen(fx, id, inc.id);
          const extra = Math.min(INTRUSION_BITS * 3, roomUp(api, id));
          if (extra <= 0) return;
          d[id] = d[id]! + extra;
          inc.bits += extra;
          api.feed(`Honeypot: that intrusion paid you ${bitsText(inc.bits)}.`, 'good', [id]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Honeypot', tone: 'good' }),
  },
  {
    id: 'code-breakers.trace-intruder',
    name: 'Trace Intruder',
    category: 'advantage',
    description: 'Trace the last player who tried to hack you in the last minute, even if they failed: you get a free hack back on them for 30 seconds.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const h = hacker(api, c.caster);
      if (h?.hackBack && h.hackBack.until > api.now()) return { error: 'You already have a hack back. Use it first.' };
      const rivals = readyRivals(api, c.caster);
      const inc = (h?.incidents ?? []).find((i: any) => i.at >= api.now() - LOOKBACK_MS && rivals.includes(i.by));
      if (!inc) return { error: 'Nobody who is still here tried to hack you in the last minute.' };
      h.hackBack = { playerId: inc.by, until: api.now() + TIMING.hackBackSec * 1000 };
      api.feed(`Trace Intruder: it was ${api.name(inc.by)}. You have a free hack back on them.`, 'good', [c.caster]);
    },
  },
  {
    id: 'code-breakers.zero-day',
    name: 'Zero-Day',
    category: 'advantage',
    description: 'Start a hack right now, without a Hack packet: choose who to hack and guess their password. Your question waits for you.',
    target: 'self',
    modes: M,
    cost: 40,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const h = hacker(api, c.caster);
      if (!h?.password) return { error: 'Choose your password first.' };
      if (h.offer) return { error: 'Open your packet first.' };
      if (h.hack) return { error: 'Finish the hack you are on first.' };
      if (!readyRivals(api, c.caster).length && !api.s.vault) return { error: 'Nobody can be hacked right now.' };
      const deadline = api.now() + TIMING.targetSec * 1000;
      h.hack = { seq: ++h.seq, source: 'hack', stage: 'target', target: null, version: 0, verifyIid: null, deadline };
      h.result = null;
      api.ctx.setTimer(`target:${c.caster}`, deadline);
    },
  },
  {
    id: 'code-breakers.packet-reroll',
    name: 'Packet Reroll',
    category: 'advantage',
    description: `Swap the ${String(OFFER_SIZE)} packets on offer for ${String(OFFER_SIZE)} new ones, drawn from the same odds.`,
    target: 'self',
    modes: M,
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const h = hacker(api, c.caster);
      if (!h?.offer) return { error: 'You have no packets on offer. Answer a question right first.' };
      const m = { lockdown: api.ctx.settings.lockdown === true };
      h.offer = { seq: ++h.seq, packets: Array.from({ length: OFFER_SIZE }, () => drawPacket(m, api.rng)) };
    },
  },
  {
    id: 'code-breakers.packet-x-ray',
    name: 'Packet X-Ray',
    category: 'advantage',
    description: 'See exactly what is inside each packet on offer before you pick one.',
    target: 'self',
    modes: M,
    cost: 20,
    cooldownMs: 40_000,
    durationMs: 15_000,
    tickMs: 250,
    overlayFor: 'caster',
    apply: (api, c, fx) => {
      const h = hacker(api, c.caster);
      if (!h?.offer) return { error: 'You have no packets on offer. Answer a question right first.' };
      if (fx) {
        fx.data.offer = h.offer.seq;
        fx.data.text = (h.offer.packets as { content: ContentId }[]).map((p, i) => `${PLACES[i] ?? String(i + 1)}: ${CONTENT_TEXT[p.content]}.`).join(' ');
      }
    },
    hooks: {
      // The x-ray is about this offer only: it goes once a packet is picked or the offer changes.
      tick: (api, fx) => {
        if (hacker(api, target(fx))?.offer?.seq !== fx.data.offer) api.endEffect(fx.eid, 'used');
      },
    },
    overlay: (fx) => ({ kind: 'banner', text: String(fx.data.text ?? ''), tone: 'info' }),
  },
  {
    id: 'code-breakers.retry-script',
    name: 'Retry Script',
    category: 'advantage',
    description: `Clear your ${String(TIMING.guardSec)}-second wait on every target you tried recently, so you can hack them again straight away.`,
    target: 'self',
    modes: M,
    cost: 15,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const h = hacker(api, c.caster);
      const since = api.now() - TIMING.guardSec * 1000;
      const recent = Object.entries((h?.tried ?? {}) as Record<string, number>).filter(([, at]) => at > since);
      if (!recent.length) return { error: 'You have no targets to wait for.' };
      for (const [id] of recent) delete h.tried[id];
    },
  },
  {
    id: 'code-breakers.incident-response',
    name: 'Incident Response',
    category: 'advantage',
    description: `For 40 seconds, if a hack lands on you, a firewall goes up straight after (if you have room for one). Used up when it does.`,
    target: 'self',
    modes: M,
    needs: ['meter:score'],
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 40_000,
    tickMs: 500,
    undoable: false,
    hooks: {
      ...endWhenUsed,
      delta: {
        score: (api, fx, d) => {
          const id = target(fx);
          const inc = freshIncident(api, fx, id, 'hacked');
          if (!inc || fx.data.used || !(d[id]! < 0)) return;
          markSeen(fx, id, inc.id);
          const h = hacker(api, id);
          if (h.firewall >= FIREWALL_MAX) return;
          h.firewall++;
          fx.data.used = 1;
          api.feed('Incident Response: a firewall went up after that hack.', 'good', [id]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Incident Response', tone: 'good' }),
  },
  {
    id: 'code-breakers.bug-bounty',
    name: 'Bug Bounty',
    category: 'economy',
    description: 'For 30 seconds, every hack of yours that fails (a wrong guess, a firewall or 2FA) still pays you 20 bits.',
    target: 'self',
    modes: M,
    needs: ['meter:score'],
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 30_000,
    tickMs: 250,
    hooks: {
      tick: (api, fx) => {
        const id = target(fx);
        const r = hacker(api, id)?.result;
        // An empty title marks a target that was picked for the player; the guess is still to come.
        if (!r || r.at < fx.startedAt || r.title === '' || !['wrong', 'firewall', 'twoFactor'].includes(r.outcome)) return;
        if (fx.data.seen === r.seq) return;
        fx.data.seen = r.seq;
        if (api.add('score', id, 20) > 0) api.feed('Bug Bounty: 20 bits for that try.', 'good', [id]);
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Bug Bounty', tone: 'good' }),
  },
  {
    id: 'code-breakers.firewall-buyback',
    name: 'Firewall Buyback',
    category: 'economy',
    description: `Sell one of your firewalls back for its full shop price, ${bitsText(SHOP.firewall.cost)}.`,
    target: 'self',
    modes: M,
    needs: ['meter:firewall'],
    cost: 20,
    cooldownMs: 45_000,
    apply: (api, c) => {
      if (api.get('firewall', c.caster) <= 0) return { error: 'You have no firewall to sell.' };
      if (api.add('score', c.caster, SHOP.firewall.cost) <= 0) return { error: 'Your bits cannot go any higher right now.' };
      api.add('firewall', c.caster, -1);
    },
  },

  /* ------------------------------ other hackers ----------------------------- */
  {
    id: 'code-breakers.brute-force',
    name: 'Brute Force',
    category: 'advantage',
    description: "Cross one wrong option off a rival's password in your notes, as a hint does. It always leaves at least one decoy, so you still have to guess.",
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const them = hacker(api, t);
      if (!them?.password) return { error: `${api.name(t)} is still choosing a password.` };
      const left = openDecoys(api, c.caster, t);
      if (left.length <= 1) return { error: `You have ruled out all but one of ${api.name(t)}'s decoys already.` };
      crossOff(hacker(api, c.caster), t, api.rng.pick(left));
      api.feed(`Brute Force: one wrong option crossed off ${api.name(t)}'s password.`, 'good', [c.caster]);
    },
  },
  {
    id: 'code-breakers.data-leak',
    name: 'Data Leak',
    category: 'troll',
    description: "Leak one of a rival's decoys to everyone else: it is crossed off in every other player's notes (leaving each of them at least one decoy).",
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const them = hacker(api, t);
      if (!them?.password) return { error: `${api.name(t)} is still choosing a password.` };
      const others = api.ids().filter((id) => id !== t && hacker(api, id));
      const learners = (d: string) =>
        others.filter((id) => {
          const left = openDecoys(api, id, t);
          return left.includes(d) && left.length >= 2;
        });
      const useful = (them.decoys as string[]).filter((d) => learners(d).length > 0);
      if (!useful.length) return { error: `Everyone has already crossed off all but one of ${api.name(t)}'s decoys.` };
      const decoy = api.rng.pick(useful);
      const who = learners(decoy);
      for (const id of who) crossOff(hacker(api, id), t, decoy);
      api.feed(`Data leak! One of your decoys is out: ${String(who.length)} ${who.length === 1 ? 'player crossed it' : 'players crossed it'} off.`, 'bad', [t]);
    },
  },
  {
    id: 'code-breakers.packet-loss',
    name: 'Packet Loss',
    category: 'troll',
    description: "For 20 seconds, half of every Bits packet a rival opens never arrives. The lost bits are gone, not yours.",
    target: 'opponent',
    modes: M,
    needs: ['meter:score'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    tags: ['x:code-breakers-packets'],
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const id = target(fx);
          const o = freshBits(api, fx, id);
          if (!o || !(d[id]! > 1)) return;
          markSeen(fx, id, o.seq);
          const lost = Math.floor(d[id]! / 2);
          d[id] = d[id]! - lost;
          rewriteCard(o, d[id]!, `Packet loss: ${bitsText(lost)} never arrived.`);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Packet loss', tone: 'bad' }),
  },
  {
    id: 'code-breakers.firewall-breach',
    name: 'Firewall Breach',
    category: 'troll',
    description: "Knock out one of a rival's firewalls.",
    target: 'opponent',
    modes: M,
    needs: ['meter:firewall'],
    cost: 30,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const t = target(c);
      if (api.add('firewall', t, -1) >= 0) return { error: `${api.name(t)} has no firewall.` };
      api.feed(`${api.name(c.caster)} knocked out one of your firewalls.`, 'bad', [t]);
    },
  },
  {
    id: 'code-breakers.corrupted-backup',
    name: 'Corrupted Backup',
    category: 'troll',
    description: "Corrupt a rival's backup, so the next hack on them takes the full amount.",
    target: 'opponent',
    modes: M,
    needs: ['meter:backup'],
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const t = target(c);
      if (api.add('backup', t, -1) >= 0) return { error: `${api.name(t)} has no backup.` };
      api.feed(`${api.name(c.caster)} corrupted your backup.`, 'bad', [t]);
    },
  },
  {
    id: 'code-breakers.brownout',
    name: 'Brownout',
    category: 'troll',
    description: "A rival's boosts fizzle out: they lose all their Surge and Double charges.",
    target: 'opponent',
    modes: M,
    needs: ['meter:surge'],
    cost: 30,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const t = target(c);
      const lost = -api.set('surge', t, 0) - api.set('double', t, 0);
      if (lost <= 0) return { error: `${api.name(t)} has no boosts.` };
      api.feed(`Brownout! ${api.name(c.caster)} drained your boosts.`, 'bad', [t]);
    },
  },
  {
    id: 'code-breakers.2fa-outage',
    name: '2FA Outage',
    category: 'troll',
    description: "Switch off a rival's 2FA for 20 seconds: a right guess at their password lands without the extra question. It comes back by itself.",
    target: 'opponent',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 20_000,
    undoable: false,
    tags: ['code-breakers-2fa-down'],
    conflicts: ['code-breakers-lent-2fa'],
    apply: (api, c, fx) => {
      const t = target(c);
      const h = hacker(api, t);
      if (!h?.twoFactor) return { error: `${api.name(t)} has no 2FA.` };
      h.twoFactor = false;
      if (fx) fx.data.had = 1;
      api.feed(`${api.name(c.caster)} knocked out your 2FA for 20 seconds.`, 'bad', [t]);
    },
    hooks: {
      // Buying 2FA during the outage would waste their bits: it is coming back anyway.
      gate: (_api, _fx, _id, action: any) => (action?.type === 'buy' && action.item === 'twoFactor' ? { block: 'Your 2FA is down for a moment. It comes back by itself.' } : undefined),
      end: (api, fx) => {
        const h = hacker(api, target(fx));
        if (h && fx.data.had) h.twoFactor = true;
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: '2FA down', until: fx.endsAt }),
  },
  {
    id: 'code-breakers.lag-spike',
    name: 'Lag Spike',
    category: 'troll',
    description: 'For 10 seconds, a rival cannot open packets. Their packets wait for them.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 10_000,
    hooks: {
      gate: (_api, _fx, _id, action: any) => (action?.type === 'pick' ? { block: 'Lag spike! Your packets are still loading.' } : undefined),
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Lag spike', until: fx.endsAt }),
  },
  {
    id: 'code-breakers.jam-trace',
    name: 'Jam the Trace',
    category: 'troll',
    description: "Jam a rival's free hack back, so they cannot use it.",
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const h = hacker(api, t);
      if (!h?.hackBack || h.hackBack.until <= api.now()) return { error: `${api.name(t)} has no hack back to jam.` };
      h.hackBack = null;
      api.feed(`${api.name(c.caster)} jammed your hack back.`, 'bad', [t]);
    },
  },
  {
    id: 'code-breakers.memory-wipe',
    name: 'Memory Wipe',
    category: 'troll',
    description: 'Wipe a rival\'s notes: they forget every option they crossed off and every password they cracked.',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const h = hacker(api, t);
      if (!h || !Object.keys(h.notes).length) return { error: `${api.name(t)} has no notes to wipe.` };
      h.notes = {};
      api.feed(`${api.name(c.caster)} wiped your notes.`, 'bad', [t]);
    },
  },

  /* ------------------------------- the network ------------------------------ */
  {
    id: 'code-breakers.start-storm',
    name: 'Summon a Data Storm',
    category: 'round',
    description: `Start a Data Storm for everyone now: ${EVENT_INFO.storm.blurb.toLowerCase()} for ${String(EVENT_TIMING.lastsSec)} seconds. Not while another event is on.`,
    target: 'room',
    modes: M,
    cost: 40,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => startEvent(api, 'storm'),
  },
  {
    id: 'code-breakers.start-bounty',
    name: 'Post a Bounty',
    category: 'round',
    description: `Start a Bounty for everyone now: ${EVENT_INFO.bounty.blurb.toLowerCase()} for ${String(EVENT_TIMING.lastsSec)} seconds. Not while another event is on.`,
    target: 'room',
    modes: M,
    cost: 35,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => startEvent(api, 'bounty'),
  },
  {
    id: 'code-breakers.start-glitch',
    name: 'Trigger a Glitch',
    category: 'round',
    description: `Start a System Glitch now: ${EVENT_INFO.glitch.blurb.charAt(0).toLowerCase()}${EVENT_INFO.glitch.blurb.slice(1)} Not while another event is on.`,
    target: 'room',
    modes: M,
    cost: 35,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => startEvent(api, 'glitch'),
  },
  {
    id: 'code-breakers.system-restore',
    name: 'System Restore',
    category: 'round',
    description: 'End the event that is on right now.',
    target: 'room',
    modes: M,
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      if (!eventOn(api)) return { error: 'No event is on.' };
      const label = EVENT_INFO[api.s.event.id as EventId].label;
      api.s.event = null;
      api.ctx.clearTimer('eventEnd');
      api.feed(`${label} is over early.`, 'info');
    },
  },
  {
    id: 'code-breakers.event-overtime',
    name: 'Event Overtime',
    category: 'round',
    description: 'The event that is on right now lasts 15 seconds longer.',
    target: 'room',
    modes: M,
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      if (!eventOn(api)) return { error: 'No event is on.' };
      api.s.event = { ...api.s.event, endsAt: api.s.event.endsAt + 15_000 };
      api.ctx.setTimer('eventEnd', api.s.event.endsAt);
      api.feed(`${EVENT_INFO[api.s.event.id as EventId].label} lasts 15 seconds longer.`, 'info');
    },
  },
  {
    id: 'code-breakers.vault-jackpot',
    name: 'Vault Jackpot',
    category: 'economy',
    description: 'The Vault fills up by half again. Whoever cracks it next takes it all.',
    target: 'room',
    modes: M,
    needs: ['meter:vault', 'heist'],
    cost: 35,
    cooldownMs: 90_000,
    apply: (api) => {
      const added = api.add('vault', 'game', Math.max(1, Math.round(api.get('vault', 'game') / 2)));
      if (added <= 0) return { error: 'The Vault is full.' };
      api.feed(`Vault Jackpot: ${bitsText(added)} more in the Vault.`, 'info');
    },
  },
  {
    id: 'code-breakers.vault-rekey',
    name: 'Vault Rekey',
    category: 'round',
    description: 'The Vault locks with a new password and decoys, wiping what everyone had learned about it.',
    target: 'room',
    modes: M,
    needs: ['heist'],
    cost: 30,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api) => {
      const v = api.s.vault;
      if (!v) return { error: 'There is no Vault in this game.' };
      const phrases = makePhrases(api.rng, OPTIONS, [v.password, ...v.decoys]);
      v.password = phrases[0];
      v.decoys = phrases.slice(1);
      v.version++;
      wipeNotesAbout(api, VAULT.id);
      api.feed('The Vault re-locked with a new password.', 'info');
    },
  },
  {
    id: 'code-breakers.packet-lottery',
    name: 'Packet Lottery',
    category: 'random',
    description: `Open a mystery packet: ${odds([
      ['a Bits packet worth 50 bits at your level', 40],
      ['a Surge', 25],
      ['a firewall', 20],
      ['lose 20 bits', 15],
    ])}. If what you get cannot change anything (full Surge charges or firewalls, no bits to lose), you get 20 bits instead.`,
    target: 'self',
    modes: M,
    needs: ['meter:score'],
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const pick = rollOdds(api, [
        ['bits', 40],
        ['surge', 25],
        ['firewall', 20],
        ['lose', 15],
      ] as const);
      const level = levelOf(hacker(api, c.caster)?.stream.correct ?? 0);
      let changed = 0;
      if (pick === 'bits') changed = api.add('score', c.caster, Math.round(50 * levelMultiplier(level)));
      else if (pick === 'surge') changed = api.add('surge', c.caster, SURGE.charges);
      else if (pick === 'firewall') changed = api.add('firewall', c.caster, 1);
      else changed = api.add('score', c.caster, -20);
      const words = { bits: `+${bitsText(changed)}`, surge: 'a Surge', firewall: 'a firewall', lose: `you lost ${bitsText(-changed)}` }[pick];
      if (changed === 0) {
        if (api.add('score', c.caster, 20) <= 0) return { error: 'Your bits cannot go any higher right now.' };
        api.feed('Packet Lottery: 20 bits.', 'good', [c.caster]);
      } else api.feed(`Packet Lottery: ${words}.`, pick === 'lose' ? 'bad' : 'good', [c.caster]);
    },
  },

  /* -------------------------- notes, targets and boosts ------------------------- */
  {
    id: 'code-breakers.photocopied-notes',
    name: 'Photocopied Notes',
    category: 'advantage',
    description:
      "Photocopy a rival's hacking notes: every decoy they have crossed off for a player you can hack (or the Vault) is crossed off in your notes too. It always leaves you at least one decoy for each of them, so you still have to guess, and it never says whose password they cracked.",
    target: 'opponent',
    // The rival keeps their notes: nothing is taken from them, so this is not a harmful cheat.
    hostile: false,
    modes: M,
    cost: 25,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const me = hacker(api, c.caster);
      const them = hacker(api, t);
      if (!me || !them || t === c.caster) return { error: 'Pick a rival to copy from.' };
      const hackable = new Set(readyRivals(api, c.caster));
      let crossed = 0;
      const about: string[] = [];
      for (const [rid, note] of Object.entries((them.notes ?? {}) as Record<string, { crossed: string[] }>)) {
        // Only targets you could hack yourself: never your own password or a teammate's.
        const decoys: string[] | null = rid === VAULT.id ? (api.s.vault?.decoys ?? null) : hackable.has(rid) ? hacker(api, rid).decoys : null;
        if (!decoys) continue;
        const known = knownCrossed(api, c.caster, rid);
        let open = decoys.filter((d) => !known.has(d)).length;
        let added = 0;
        for (const d of note.crossed) {
          if (open <= 1) break;
          if (known.has(d) || !decoys.includes(d)) continue;
          crossOff(me, rid, d);
          known.add(d);
          open--;
          added++;
        }
        if (added) {
          crossed += added;
          about.push(rid === VAULT.id ? VAULT.name : api.name(rid));
        }
      }
      if (!crossed) return { error: `${api.name(t)}'s notes hold nothing you do not know already.` };
      api.feed(`Photocopied Notes: ${String(crossed)} ${crossed === 1 ? 'decoy' : 'decoys'} crossed off for ${about.join(', ')}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'code-breakers.blocklist',
    name: 'Blocklist',
    category: 'advantage',
    description: `Put a rival on your blocklist: for ${String(TIMING.guardSec)} seconds they cannot pick you as a hack target, just as if they had tried to hack you a moment ago. The game still lets them if nobody else is left for them to hack, and a free hack back they hold on you still works.`,
    target: 'opponent',
    modes: M,
    cost: 20,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const me = hacker(api, c.caster);
      const them = hacker(api, t);
      if (!me || !them || t === c.caster) return { error: 'Pick a rival to block.' };
      if (!me.password) return { error: 'Nobody can hack you until you have chosen a password.' };
      const now = api.now();
      if ((them.tried[c.caster] ?? -Infinity) >= now) return { error: `${api.name(t)} cannot pick you right now already.` };
      // The mode's own guard: a target tried in the last few seconds cannot be picked again until it runs out.
      them.tried[c.caster] = now;
      api.feed(`${api.name(c.caster)} put you on their blocklist: you cannot pick them as a target for ${String(TIMING.guardSec)} seconds.`, 'bad', [t]);
    },
  },
  {
    id: 'code-breakers.boost-swipe',
    name: 'Boost Swipe',
    category: 'economy',
    description: `Swipe a rival's boosts: their Double and Surge charges move over to you, as many as you have room for (you can hold ${String(DOUBLE.max)} Doubles and ${String(SURGE.max)} Surge charges). Whatever does not fit stays with them.`,
    target: 'opponent',
    modes: M,
    needs: ['meter:surge', 'meter:double'],
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const t = target(c);
      if (t === c.caster) return { error: 'Pick a rival to swipe from.' };
      const doubles = transfer(api, 'double', t, c.caster, api.get('double', t));
      const surges = transfer(api, 'surge', t, c.caster, api.get('surge', t));
      if (!doubles && !surges) return { error: api.get('double', t) + api.get('surge', t) > 0 ? 'You have no room for any more boosts.' : `${api.name(t)} has no boosts to swipe.` };
      const got = [doubles ? `${String(doubles)} ${doubles === 1 ? 'Double' : 'Doubles'}` : null, surges ? `${String(surges)} Surge ${surges === 1 ? 'charge' : 'charges'}` : null].filter(Boolean).join(' and ');
      api.feed(`${api.name(c.caster)} swiped ${got} from you.`, 'bad', [t]);
      api.feed(`Boost Swipe: ${got} from ${api.name(t)}.`, 'good', [c.caster]);
    },
  },
];

defineCheats(cheats);
