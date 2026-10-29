import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, target, transfer } from '../cheats/kit.ts';
import { EVENT_INFO, GEAR, GEAR_INFO, GROUND, MAX_DIGS, meta, type GearId, type GoldEventId, type GroundKind, type RiskLevel } from '../../modes/gold-rush/meta.ts';
import { averageFind, type DigMoment } from '../../modes/gold-rush/odds.ts';

/*
 * Cheats that only make sense in Gold Rush: digs, carts, depth, quartz veins,
 * cave-ins, timber props and goldfield events.
 *
 * Gold moves through the adapter's meters (score is banked gold, plus cart,
 * digs, depth and vein), so those cheats can be undone. Cheats that change
 * gear, events or a dig's result card write the mode's state and are not.
 *
 * A dig's outcome is never chosen by a cheat: the mode draws it from the odds
 * players see. Lasting cheats bend what a dig did after it happened (double
 * the gold it put in the cart, turn a cave-in into a puddle), and say so.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODE = 'gold-rush';
const M = [MODE] as const;
const NOTES_KEEP = 4;

type Api = ChaosApi;
const miner = (api: Api, id: string): any => api.s.miners[id];
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const gold = (n: number) => `${fmt(n)} gold`;
const levelsOf = (api: Api) => GROUND[(api.ctx.settings.ground as GroundKind) ?? 'standard'].levels;

function note(api: Api, id: string, text: string, tone: 'good' | 'bad' | 'info') {
  const m = miner(api, id);
  if (m) m.notes = [{ id: ++api.s.seq, at: api.now(), text, tone }, ...m.notes].slice(0, NOTES_KEEP);
}

/** This transaction's dig by `id`, if it dug one: the result card it left, seen only once per effect. */
function freshDig(api: Api, fx: ActiveEffect, id: string): any | null {
  const m = miner(api, id);
  const last = m?.last;
  if (!last || last.at !== api.now()) return null;
  const seen = (fx.data.seen ?? {}) as Record<string, number>;
  if (seen[id] === last.seq) return null;
  return last;
}

function markSeen(fx: ActiveEffect, id: string, seq: number) {
  fx.data.seen = { ...((fx.data.seen ?? {}) as Record<string, number>), [id]: seq };
}

function moment(api: Api, id: string): DigMoment {
  const m = miner(api, id);
  const ev = api.s.event && api.s.event.endsAt > api.now() ? (api.s.event.id as GoldEventId) : null;
  return {
    ground: (api.ctx.settings.ground as GroundKind) ?? 'standard',
    risk: (api.ctx.settings.risk as RiskLevel) ?? 'normal',
    claimJumping: api.ctx.settings.claimJumping !== false,
    level: (m?.depth ?? 0) + 1,
    props: m?.gear.props ?? 0,
    event: ev,
    vein: Boolean(m?.vein),
  };
}

function eventRunning(api: Api): boolean {
  return Boolean(api.s.event && api.s.event.endsAt > api.now());
}

function startEvent(api: Api, id: GoldEventId): void | { error: string } {
  if (eventRunning(api)) return { error: `${EVENT_INFO[api.s.event.id as GoldEventId].label} is already on.` };
  const endsAt = api.now() + EVENT_INFO[id].seconds * 1000;
  api.s.event = { id, endsAt };
  api.s.lastEvent = id;
  api.ctx.setTimer('eventEnd', endsAt);
  api.feed(`${EVENT_INFO[id].label}: ${EVENT_INFO[id].blurb}`, 'big');
}

/** Lasting cheats that bend a dig: run their check each transaction and end themselves once used. */
const endWhenUsed = {
  tick(api: Api, fx: ActiveEffect) {
    if (fx.data.used) api.endEffect(fx.eid, 'used');
  },
};

const cheats: CheatDef[] = [
  /* ------------------------------- your own mine ------------------------------ */
  {
    id: 'gold-rush.golden-touch',
    name: 'Golden Touch',
    category: 'score',
    description: 'For 20 seconds, the gold each of your digs puts in your cart is doubled.',
    target: 'self',
    modes: M,
    needs: ['meter:cart'],
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 20_000,
    tags: ['x:gold-rush-finds'],
    hooks: {
      delta: {
        cart: (api, fx, d) => {
          const id = target(fx);
          const last = freshDig(api, fx, id);
          if (!last || last.kind === 'map' || !(d[id]! > 0)) return;
          markSeen(fx, id, last.seq);
          d[id] = d[id]! * 2;
          note(api, id, `Golden Touch doubled that find to ${gold(d[id]!)}.`, 'good');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Golden Touch', tone: 'good' }),
  },
  {
    id: 'gold-rush.timber-charm',
    name: 'Timber Charm',
    category: 'advantage',
    description: 'For 60 seconds, your next cave-in turns into a puddle: you keep the gold in your cart and stay at the level you reached. Used up when it saves you.',
    target: 'self',
    modes: M,
    needs: ['cave-ins'],
    cost: 30,
    cooldownMs: 75_000,
    durationMs: 60_000,
    tickMs: 500,
    undoable: false,
    hooks: {
      ...endWhenUsed,
      // Both meters fall on a cave-in; each puts its own back. The first to run rewrites the result card.
      delta: {
        depth: (api, fx, d) => saveFromCaveIn(api, fx, d, 'depth'),
        cart: (api, fx, d) => saveFromCaveIn(api, fx, d, 'cart'),
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Timber Charm', tone: 'good' }),
  },
  {
    id: 'gold-rush.lucky-pick',
    name: 'Lucky Pick',
    category: 'advantage',
    description: `Get 3 digs straight away, without answering (you can hold ${MAX_DIGS} at most).`,
    target: 'self',
    modes: M,
    needs: ['meter:digs'],
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      if (api.add('digs', c.caster, 3) <= 0) return { error: 'Your dig bag is full. Dig first.' };
    },
  },
  {
    id: 'gold-rush.express-lift',
    name: 'Express Lift',
    category: 'advantage',
    description: 'Ride straight down 3 levels with no dig and no chance of a cave-in on the way. Deeper levels hold bigger gold, and cave in more often.',
    target: 'self',
    modes: M,
    needs: ['meter:depth'],
    cost: 30,
    cooldownMs: 60_000,
    apply: (api, c) => {
      if (api.add('depth', c.caster, 3) <= 0) return { error: 'Your shaft is already at the bottom.' };
    },
  },
  {
    id: 'gold-rush.nugget-rain',
    name: 'Nugget Rain',
    category: 'score',
    description: 'Nuggets rain into your cart: as much gold as an average dig at your next level would find, with your gear and any event worked in.',
    target: 'self',
    modes: M,
    needs: ['meter:cart'],
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const amount = Math.max(5, Math.round(averageFind(moment(api, c.caster))));
      api.add('cart', c.caster, amount);
      api.feed(`Nugget Rain: ${gold(amount)} fell into your cart.`, 'good', [c.caster]);
    },
  },
  {
    id: 'gold-rush.night-bank',
    name: 'Night Bank',
    category: 'economy',
    description: 'Bank your whole cart without climbing out: the gold is safe and your shaft keeps its depth. No gold pan bonus.',
    target: 'self',
    modes: M,
    needs: ['meter:cart'],
    cost: 30,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const cart = api.get('cart', c.caster);
      if (cart <= 0) return { error: 'Your cart is empty.' };
      const moved = api.add('score', c.caster, cart);
      if (moved <= 0) return { error: 'Your bank cannot take any more gold right now.' };
      api.add('cart', c.caster, -moved);
      api.feed(`Night Bank: ${gold(moved)} banked, and you are still at level ${miner(api, c.caster).depth}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'gold-rush.vein-finder',
    name: 'Vein Finder',
    category: 'advantage',
    description: 'Find a quartz vein without digging: your next find is doubled.',
    target: 'self',
    modes: M,
    needs: ['meter:vein'],
    cost: 20,
    cooldownMs: 40_000,
    apply: (api, c) => {
      if (api.set('vein', c.caster, 1) <= 0) return { error: 'You already have a quartz vein waiting.' };
    },
  },
  {
    id: 'gold-rush.mudlark',
    name: "Mudlark's Luck",
    category: 'advantage',
    description: 'For 30 seconds, every dig that only finds water gives you the dig back.',
    target: 'self',
    modes: M,
    needs: ['meter:digs'],
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 30_000,
    hooks: {
      delta: {
        digs: (api, fx, d) => {
          const id = target(fx);
          const last = freshDig(api, fx, id);
          if (!last || last.kind !== 'water' || !(d[id]! < 0)) return;
          markSeen(fx, id, last.seq);
          d[id] = d[id]! + 1;
          note(api, id, "Mudlark's Luck: only water, so you keep that dig.", 'good');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: "Mudlark's Luck", tone: 'good' }),
  },
  {
    id: 'gold-rush.dig-rush',
    name: 'Dig Rush',
    category: 'advantage',
    description: 'For 20 seconds, every time you earn digs you get one more.',
    target: 'self',
    modes: M,
    needs: ['meter:digs'],
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 20_000,
    tags: ['x:gold-rush-digs'],
    hooks: {
      delta: {
        digs: (api, fx, d) => {
          const id = target(fx);
          if (d[id]! > 0) d[id] = d[id]! + 1;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Dig Rush', tone: 'good' }),
  },
  {
    id: 'gold-rush.bonanza-sense',
    name: 'Bonanza Sense',
    category: 'score',
    description: 'For 25 seconds, finds from level 5 down are half as big again.',
    target: 'self',
    modes: M,
    needs: ['meter:cart'],
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 25_000,
    hooks: {
      delta: {
        cart: (api, fx, d) => {
          const id = target(fx);
          const last = freshDig(api, fx, id);
          if (!last || last.kind === 'map' || last.level < 5 || !(d[id]! > 0)) return;
          markSeen(fx, id, last.seq);
          d[id] = Math.round(d[id]! * 1.5);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Bonanza Sense', tone: 'good' }),
  },
  {
    id: 'gold-rush.pan-tailings',
    name: 'Pan the Tailings',
    category: 'economy',
    description: 'Pan what was left over from your last trip to the bank: a fifth of what you banked then goes into your cart.',
    target: 'self',
    modes: M,
    needs: ['meter:cart'],
    cost: 20,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const last = miner(api, c.caster)?.lastBank ?? 0;
      if (last <= 0) return { error: 'You have not banked anything yet.' };
      api.add('cart', c.caster, Math.max(1, Math.round(last / 5)));
    },
  },
  {
    id: 'gold-rush.gold-buyer',
    name: 'Gold Buyer',
    category: 'economy',
    description: 'A buyer takes half your cart and pays half as much again for it, straight into your bank.',
    target: 'self',
    modes: M,
    needs: ['meter:cart'],
    cost: 30,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const cart = api.get('cart', c.caster);
      if (cart < 2) return { error: 'You need at least 2 gold in your cart.' };
      const half = Math.floor(cart / 2);
      const paid = api.add('score', c.caster, Math.round(half * 1.5));
      if (paid <= 0) return { error: 'Your bank cannot take any more gold right now.' };
      api.add('cart', c.caster, -half);
    },
  },
  {
    id: 'gold-rush.borrowed-props',
    name: 'Borrowed Props',
    category: 'advantage',
    description: 'Borrow one more level of timber props for 30 seconds: your cave-in chances drop while you have them.',
    target: 'self',
    modes: M,
    needs: ['cave-ins'],
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 30_000,
    undoable: false,
    apply: (api, c, fx) => {
      const m = miner(api, c.caster);
      if (m.gear.props >= 3) return { error: 'You already have the best props.' };
      m.gear.props++;
      if (fx) fx.data.lent = 1;
    },
    hooks: {
      end: (api, fx) => {
        const m = miner(api, target(fx));
        if (m && fx.data.lent && m.gear.props > 0) m.gear.props--;
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Borrowed props', tone: 'good' }),
  },
  {
    id: 'gold-rush.gear-sale',
    name: 'Gear Sale',
    category: 'economy',
    description: 'For 60 seconds, the next gear you buy costs half: the other half comes back to your bank. Used up on that purchase.',
    target: 'self',
    modes: M,
    needs: ['meter:score'],
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 60_000,
    tickMs: 500,
    hooks: {
      ...endWhenUsed,
      delta: {
        score: (api, fx, d) => {
          const id = target(fx);
          // Only gear takes gold out of a bank.
          if (fx.data.used || !(d[id]! < 0)) return;
          fx.data.used = 1;
          const refund = Math.floor(-d[id]! / 2);
          d[id] = d[id]! + refund;
          note(api, id, `Gear Sale: ${gold(refund)} back.`, 'good');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Gear Sale', tone: 'good' }),
  },

  /* ------------------------------ other miners ------------------------------ */
  {
    id: 'gold-rush.loose-rocks',
    name: 'Loose Rocks',
    category: 'troll',
    description: 'Loose rocks send an opponent scrambling 3 levels back up their shaft. Their cart is safe; their depth is not.',
    target: 'opponent',
    modes: M,
    needs: ['meter:depth'],
    cost: 25,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      if (api.add('depth', t, -3) >= 0) return { error: `${api.name(t)} is already at the top of their shaft.` };
      note(api, t, `${api.name(c.caster)} sent loose rocks down your shaft: you climbed back up.`, 'bad');
    },
  },
  {
    id: 'gold-rush.sticky-mud',
    name: 'Sticky Mud',
    category: 'troll',
    description: 'For 20 seconds, an opponent can only dig once every 4 seconds.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    hooks: {
      gate: (api, fx, playerId, action: any) => {
        if (action?.type !== 'dig') return;
        const last = Number(((fx.data.last ?? {}) as Record<string, number>)[playerId] ?? -Infinity);
        if (api.now() - last < 4000) return { block: 'Sticky mud! Wait a moment before your next dig.' };
        fx.data.last = { ...((fx.data.last ?? {}) as Record<string, number>), [playerId]: api.now() };
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Sticky mud', tone: 'bad' }),
  },
  {
    id: 'gold-rush.leaky-cart',
    name: 'Leaky Cart',
    category: 'troll',
    description: 'For 15 seconds, an opponent\'s cart leaks: it loses a twentieth of its gold every 3 seconds. The gold is gone, not yours.',
    target: 'opponent',
    modes: M,
    needs: ['meter:cart'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 15_000,
    tickMs: 3000,
    apply: (api, c) => {
      if (api.get('cart', target(c)) <= 0) return { error: `${api.name(target(c))}'s cart is empty.` };
    },
    hooks: {
      tick: (api, fx) => {
        const t = target(fx);
        const cart = api.get('cart', t);
        if (cart > 0) api.add('cart', t, -Math.max(1, Math.round(cart / 20)));
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Leaky cart', tone: 'bad' }),
  },
  {
    id: 'gold-rush.blunt-pick',
    name: 'Blunt Pick',
    category: 'troll',
    description: 'For 20 seconds, an opponent earns digs only every other time they would.',
    target: 'opponent',
    modes: M,
    needs: ['meter:digs'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    tags: ['x:gold-rush-digs'],
    hooks: {
      delta: {
        digs: (api, fx, d) => {
          const id = target(fx);
          if (!(d[id]! > 0)) return;
          const n = Number(fx.data.n ?? 0);
          fx.data.n = n + 1;
          if (n % 2 === 0) d[id] = 0;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Blunt pick', tone: 'bad' }),
  },
  {
    id: 'gold-rush.claim-map',
    name: 'Claim Map',
    category: 'troll',
    description: 'Jump an opponent\'s claim: take a quarter of the gold in their cart into yours. Banked gold is safe.',
    target: 'opponent',
    modes: M,
    needs: ['meter:cart'],
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const t = target(c);
      const cart = api.get('cart', t);
      if (cart <= 0) return { error: `${api.name(t)}'s cart is empty.` };
      const took = transfer(api, 'cart', t, c.caster, Math.max(1, Math.floor(cart / 4)));
      note(api, t, `${api.name(c.caster)} jumped your claim and took ${gold(took)} from your cart.`, 'bad');
    },
  },
  {
    id: 'gold-rush.cart-swap',
    name: 'Cart Swap',
    category: 'troll',
    description: 'Swap carts with an opponent while nobody is looking.',
    target: 'opponent',
    modes: M,
    needs: ['meter:cart'],
    cost: 40,
    cooldownMs: 75_000,
    apply: (api, c) => {
      const t = target(c);
      const mine = api.get('cart', c.caster);
      const theirs = api.get('cart', t);
      if (mine === theirs) return { error: 'Your carts hold the same.' };
      api.set('cart', c.caster, theirs);
      api.set('cart', t, mine);
      note(api, t, `${api.name(c.caster)} swapped carts with you.`, theirs > mine ? 'bad' : 'good');
    },
  },
  {
    id: 'gold-rush.fools-gold',
    name: "Fool's Gold",
    category: 'troll',
    description: 'For 20 seconds, half of the gold an opponent digs up turns out to be fool\'s gold and crumbles away.',
    target: 'opponent',
    modes: M,
    needs: ['meter:cart'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    tags: ['x:gold-rush-finds'],
    hooks: {
      delta: {
        cart: (api, fx, d) => {
          const id = target(fx);
          const last = freshDig(api, fx, id);
          if (!last || last.kind === 'map' || !(d[id]! > 0)) return;
          markSeen(fx, id, last.seq);
          const lost = Math.floor(d[id]! / 2);
          d[id] = d[id]! - lost;
          note(api, id, `Fool's gold! ${gold(lost)} of that find crumbled away.`, 'bad');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: "Fool's gold", tone: 'bad' }),
  },
  {
    id: 'gold-rush.termites',
    name: 'Termites',
    category: 'troll',
    description: 'Termites eat an opponent\'s timber props: for 20 seconds they dig as if they had none. The props grow back afterwards.',
    target: 'opponent',
    modes: M,
    needs: ['cave-ins'],
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 20_000,
    undoable: false,
    apply: (api, c, fx) => {
      const m = miner(api, target(c));
      if (!m?.gear.props) return { error: `${api.name(target(c))} has no timber props.` };
      if (fx) fx.data.props = m.gear.props;
      m.gear.props = 0;
      note(api, target(c), `${api.name(c.caster)} let termites at your timber props.`, 'bad');
    },
    hooks: {
      end: (api, fx) => {
        const m = miner(api, target(fx));
        if (m) m.gear.props = Math.max(m.gear.props, Number(fx.data.props ?? 0));
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Termites', tone: 'bad' }),
  },
  {
    id: 'gold-rush.flash-flood',
    name: 'Flash Flood',
    category: 'troll',
    description: 'Flood an opponent\'s shaft: for 12 seconds they cannot dig. They can still answer and bank.',
    target: 'opponent',
    modes: M,
    needs: ['meter:digs'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 12_000,
    tags: ['x:gold-rush-dig-block'],
    hooks: {
      gate: (_api, _fx, _id, action: any) => (action?.type === 'dig' ? { block: 'Your shaft is flooded! Wait for it to drain.' } : undefined),
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Flooded', until: fx.endsAt }),
  },
  {
    id: 'gold-rush.pickpocket',
    name: 'Dig Snatcher',
    category: 'troll',
    description: 'Take 2 of an opponent\'s digs for yourself (as many as they have, and as you can hold).',
    target: 'opponent',
    modes: M,
    needs: ['meter:digs'],
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const t = target(c);
      if (api.get('digs', t) <= 0) return { error: `${api.name(t)} has no digs.` };
      if (transfer(api, 'digs', t, c.caster, 2) <= 0) return { error: 'Your dig bag is full.' };
      note(api, t, `${api.name(c.caster)} pinched some of your digs.`, 'bad');
    },
  },
  {
    id: 'gold-rush.licence-fee',
    name: 'Licence Fee',
    category: 'economy',
    description: 'Every other miner pays you a twentieth of the gold in their cart (at least 1 gold each, from carts that have any).',
    target: 'everyone-else',
    modes: M,
    needs: ['meter:cart'],
    cost: 40,
    cooldownMs: 90_000,
    hostile: true,
    apply: (api, c) => {
      let total = 0;
      for (const t of c.targets) {
        const cart = api.get('cart', t);
        if (cart > 0) total += transfer(api, 'cart', t, c.caster, Math.max(1, Math.round(cart / 20)));
      }
      if (total <= 0) return { error: 'Nobody has gold in their cart.' };
      api.feed(`${api.name(c.caster)} collected a licence fee: ${gold(total)} from everyone's carts.`, 'info');
    },
  },

  /* -------------------------------- the goldfield ------------------------------- */
  {
    id: 'gold-rush.start-fever',
    name: 'Strike Gold Fever',
    category: 'round',
    description: `Start Gold Fever for everyone now: ${EVENT_INFO.fever.blurb.toLowerCase()} for ${EVENT_INFO.fever.seconds} seconds. Not while another event is on.`,
    target: 'room',
    modes: M,
    cost: 40,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => startEvent(api, 'fever'),
  },
  {
    id: 'gold-rush.start-steady',
    name: 'Settle the Ground',
    category: 'round',
    description: `Start Steady Ground for everyone now: no cave-ins at all for ${EVENT_INFO.steady.seconds} seconds. Not while another event is on.`,
    target: 'room',
    modes: M,
    needs: ['cave-ins'],
    cost: 35,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => startEvent(api, 'steady'),
  },
  {
    id: 'gold-rush.start-rich-lead',
    name: 'Find a Rich Lead',
    category: 'round',
    description: `Start a Rich Lead for everyone now: ${EVENT_INFO.richLead.blurb.toLowerCase()} for ${EVENT_INFO.richLead.seconds} seconds. Not while another event is on.`,
    target: 'room',
    modes: M,
    cost: 35,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => startEvent(api, 'richLead'),
  },
  {
    id: 'gold-rush.calm-field',
    name: 'Quiet Goldfield',
    category: 'round',
    description: 'End the goldfield event that is on right now.',
    target: 'room',
    modes: M,
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      if (!eventRunning(api)) return { error: 'No goldfield event is on.' };
      const label = EVENT_INFO[api.s.event.id as GoldEventId].label;
      api.s.event = null;
      api.ctx.clearTimer('eventEnd');
      api.feed(`${label} is over early.`, 'info');
    },
  },
  {
    id: 'gold-rush.long-shift',
    name: 'Long Shift',
    category: 'round',
    description: 'The goldfield event that is on right now lasts 15 seconds longer.',
    target: 'room',
    modes: M,
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      if (!eventRunning(api)) return { error: 'No goldfield event is on.' };
      api.s.event = { ...api.s.event, endsAt: api.s.event.endsAt + 15_000 };
      api.ctx.setTimer('eventEnd', api.s.event.endsAt);
      api.feed(`${EVENT_INFO[api.s.event.id as GoldEventId].label} lasts 15 seconds longer.`, 'info');
    },
  },
  {
    id: 'gold-rush.lucky-dip',
    name: 'Creek Dip',
    category: 'random',
    description: `Dip into the creek for a surprise: ${odds([
      ['2 digs', 40],
      ['your cart grows by half', 25],
      ['a quartz vein', 20],
      ['lose a dig', 15],
    ])}. If what you get cannot change anything (a full dig bag, an empty cart, a vein already waiting, no dig to lose), you get 10 gold in your cart instead.`,
    target: 'self',
    modes: M,
    needs: ['meter:cart'],
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const pick = rollOdds(api, [
        ['digs', 40],
        ['cart', 25],
        ['vein', 20],
        ['lose', 15],
      ] as const);
      let changed = 0;
      if (pick === 'digs') changed = api.add('digs', c.caster, 2);
      else if (pick === 'cart') changed = api.add('cart', c.caster, Math.floor(api.get('cart', c.caster) / 2));
      else if (pick === 'vein') changed = api.set('vein', c.caster, 1);
      else changed = api.add('digs', c.caster, -1);
      const words = { digs: '2 digs', cart: 'your cart grew by half', vein: 'a quartz vein', lose: 'you dropped a dig' }[pick];
      if (changed === 0) {
        api.add('cart', c.caster, 10);
        api.feed('Creek Dip: 10 gold for your cart.', 'good', [c.caster]);
      } else api.feed(`Creek Dip: ${words}.`, pick === 'lose' ? 'bad' : 'good', [c.caster]);
    },
  },
];

/* ------------------------- more: bank, gear, shafts, whistle ------------------------- */

/** The bank stays open for everyone this close to the whistle, so no cart is trapped at the end. */
const BANK_OPEN_MS = 45_000;
/** A rescue crew only comes for a cave-in this recent. */
const RESCUE_WINDOW_MS = 20_000;
/** The whistle moves this much per cast, and chaos may move it this much in a whole game. */
const WHISTLE_STEP_MS = 20_000;
const WHISTLE_MAX_MS = 60_000;
const BORROWED = `${MODE}.borrowed-props`;
const TERMITES = `${MODE}.termites`;

/** The whistle as the mode first set it: the game starts at game time 0 and runs the time limit (6 minutes when none is set). */
const firstWhistle = (api: Api) => (api.ctx.common.timeLimitSec > 0 ? api.ctx.common.timeLimitSec : (meta.common.defaults.timeLimitSec ?? 360)) * 1000;
const gearKey = (m: any) => GEAR.map((g) => m?.gear[g] ?? 0).join('/');
/** Props that are only lent (Borrowed Props) or taken away for a while (Termites) on this miner. */
const propsInFlux = (api: Api, id: string) => api.effectsOn(id).some((e) => e.cheatId === BORROWED || e.cheatId === TERMITES);

/** The gear and level a trade-in sells: the one asked for, or the dearest level the miner owns. */
function tradeInPick(m: any, choice: string): { gear: GearId; price: number } | null {
  const own = (g: GearId) => (m.gear[g] > 0 ? { gear: g, price: GEAR_INFO[g].levels[m.gear[g] - 1]!.cost } : null);
  if (choice !== 'best') return own(choice as GearId);
  return GEAR.map(own).reduce<{ gear: GearId; price: number } | null>((best, x) => (x && (!best || x.price > best.price) ? x : best), null);
}

const more: CheatDef[] = [
  {
    id: 'gold-rush.bank-holiday',
    name: 'Bank Holiday',
    category: 'troll',
    description: `For 15 seconds the bank is closed to an opponent: they cannot bank their cart, though they can still answer and dig. Not in the last ${BANK_OPEN_MS / 1000} seconds before the whistle.`,
    target: 'opponent',
    modes: M,
    needs: ['meter:cart'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 15_000,
    apply: (api) => {
      if (api.s.endsAt - api.now() < BANK_OPEN_MS) return { error: `The bank stays open for everyone in the last ${BANK_OPEN_MS / 1000} seconds.` };
    },
    hooks: {
      gate: (_api, _fx, _id, action: any) => (action?.type === 'bank' ? { block: 'Bank holiday! The bank opens again in a few seconds.' } : undefined),
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Bank closed', until: fx.endsAt }),
  },
  {
    id: 'gold-rush.rescue-crew',
    name: 'Mine Rescue Crew',
    category: 'advantage',
    description: `Within ${RESCUE_WINDOW_MS / 1000} seconds of a cave-in that cost you gold, a rescue crew digs out half of what it lost and puts it back in your cart. Your shaft stays at the top.`,
    target: 'self',
    modes: M,
    needs: ['cave-ins', 'meter:cart'],
    cost: 30,
    // Longer than the window, so one cave-in can only be rescued once.
    cooldownMs: 60_000,
    apply: (api, c) => {
      const last = miner(api, c.caster)?.last;
      if (!last || last.kind !== 'cavein' || !(last.gold < 0) || api.now() - last.at > RESCUE_WINDOW_MS) {
        return { error: `You have not had a cave-in that cost you gold in the last ${RESCUE_WINDOW_MS / 1000} seconds.` };
      }
      const back = api.add('cart', c.caster, Math.max(1, Math.floor(-last.gold / 2)));
      note(api, c.caster, `A rescue crew dug ${gold(back)} out of the cave-in for your cart.`, 'good');
    },
  },
  {
    id: 'gold-rush.late-whistle',
    name: 'Late Shift Whistle',
    category: 'round',
    description: `The whistle blows ${WHISTLE_STEP_MS / 1000} seconds later for everyone. Chaos can add at most ${WHISTLE_MAX_MS / 1000} seconds to a game.`,
    target: 'room',
    modes: M,
    cost: 35,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => {
      const s = api.s;
      if (s.winner) return { error: 'The game is over.' };
      if (s.endsAt - firstWhistle(api) + WHISTLE_STEP_MS > WHISTLE_MAX_MS) return { error: `The whistle is already ${WHISTLE_MAX_MS / 1000} seconds late, as late as chaos can make it.` };
      s.endsAt += WHISTLE_STEP_MS;
      api.ctx.setTimer('time', s.endsAt);
      api.feed(`Late shift: the whistle blows ${WHISTLE_STEP_MS / 1000} seconds later.`, 'big');
    },
  },
  {
    id: 'gold-rush.kit-swap',
    name: "Miner's Kit Swap",
    category: 'troll',
    description: 'Swap all your gear (pick, timber props and gold pan) with an opponent\'s, for good. Not while either of you has borrowed props or termites.',
    target: 'opponent',
    modes: M,
    cost: 40,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const mine = miner(api, c.caster);
      const theirs = miner(api, t);
      if (!mine || !theirs) return { error: 'Only miners in the game can swap kit.' };
      if (gearKey(mine) === gearKey(theirs)) return { error: `You and ${api.name(t)} have the same gear.` };
      if (propsInFlux(api, c.caster) || propsInFlux(api, t)) return { error: 'Someone\'s timber props are borrowed or eaten right now. Wait for them to settle.' };
      const g = { ...mine.gear };
      mine.gear = { ...theirs.gear };
      theirs.gear = g;
      const levels = (x: any) => GEAR.reduce((n, k) => n + (x.gear[k] ?? 0), 0);
      note(api, t, `${api.name(c.caster)} swapped kit with you: you now have pick level ${theirs.gear.pick}, props level ${theirs.gear.props} and pan level ${theirs.gear.pan}.`, levels(theirs) < levels(mine) ? 'bad' : 'info');
      api.feed(`${api.name(c.caster)} swapped kit with ${api.name(t)}.`, 'info');
    },
  },
  {
    id: 'gold-rush.trade-in',
    name: "Prospector's Trade-In",
    category: 'economy',
    description: 'Sell the top level of one of your gear back to a trader for half what it cost: the gold goes straight into your bank. Not props you have only borrowed.',
    target: 'self',
    modes: M,
    needs: ['meter:score'],
    params: [
      {
        key: 'gear',
        label: 'Gear',
        kind: 'choice',
        options: [{ value: 'best', label: 'My dearest gear' }, ...GEAR.map((g) => ({ value: g, label: GEAR_INFO[g].label }))],
        default: 'best',
      },
    ],
    cost: 25,
    cooldownMs: 60_000,
    // It writes the gear itself.
    undoable: false,
    apply: (api, c) => {
      const m = miner(api, c.caster);
      const pick = m ? tradeInPick(m, String(c.params.gear)) : null;
      if (!pick) return { error: c.params.gear === 'best' ? 'You have no gear to sell.' : `You have no ${GEAR_INFO[c.params.gear as GearId].label.toLowerCase()} to sell.` };
      if (pick.gear === 'props' && propsInFlux(api, c.caster)) return { error: 'Your timber props are borrowed or eaten right now.' };
      const paid = Math.floor(pick.price / 2);
      // A trade-in that would take the bank to the goal is refused whole; the error rolls the gold back.
      if (api.add('score', c.caster, paid) < paid) return { error: 'Your bank cannot take that much gold right now.' };
      m.gear[pick.gear]--;
      note(api, c.caster, `${GEAR_INFO[pick.gear].label} sold back for ${gold(paid)}.`, 'info');
    },
  },
  {
    id: 'gold-rush.shaft-swap',
    name: 'Shaft Swap',
    category: 'troll',
    description: 'Trade shaft depths with an opponent: you go to the level they reached and they go to yours. Carts stay where they are.',
    target: 'opponent',
    modes: M,
    needs: ['meter:depth'],
    cost: 30,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const t = target(c);
      const mine = api.get('depth', c.caster);
      const theirs = api.get('depth', t);
      if (mine === theirs) return { error: `You and ${api.name(t)} are on the same level.` };
      api.set('depth', c.caster, theirs);
      api.set('depth', t, mine);
      note(api, t, `${api.name(c.caster)} swapped shafts with you: you are now on level ${mine}.`, theirs > mine ? 'bad' : 'info');
    },
  },
  {
    id: 'gold-rush.vein-thief',
    name: 'Quartz Vein Thief',
    category: 'troll',
    description: 'Take the quartz vein waiting in an opponent\'s shaft: their next find is no longer doubled, and yours is. Not when you already have one waiting.',
    target: 'opponent',
    modes: M,
    needs: ['meter:vein'],
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const t = target(c);
      if (api.get('vein', t) <= 0) return { error: `${api.name(t)} has no quartz vein waiting.` };
      if (api.get('vein', c.caster) > 0) return { error: 'You already have a quartz vein waiting.' };
      api.set('vein', t, 0);
      api.set('vein', c.caster, 1);
      note(api, t, `${api.name(c.caster)} made off with your quartz vein.`, 'bad');
    },
  },
  {
    id: 'gold-rush.steady-rope',
    name: 'Steady Shaft Rope',
    category: 'advantage',
    description: 'For 25 seconds your shaft stops going deeper: each dig finds what the next level down holds, with its cave-in chance, and leaves you where you are. A cave-in still sends you to the top.',
    target: 'self',
    modes: M,
    needs: ['meter:depth'],
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 25_000,
    hooks: {
      delta: {
        depth: (api, fx, d) => {
          const id = target(fx);
          const last = freshDig(api, fx, id);
          if (!last || last.kind === 'cavein' || !(d[id]! > 0)) return;
          markSeen(fx, id, last.seq);
          d[id] = 0;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Steady rope', tone: 'good' }),
  },
];

/** Timber Charm's work for one meter: put back what a cave-in took, and rewrite the card once. */
function saveFromCaveIn(api: Api, fx: ActiveEffect, d: Record<string, number>, meter: 'depth' | 'cart') {
  const id = target(fx);
  const m = miner(api, id);
  const last = m?.last;
  if (!last || last.kind !== 'cavein' || last.at !== api.now() || !(d[id]! < 0)) {
    if (!(last?.kind === 'water' && fx.data.savedSeq === last.seq)) return;
  }
  if (meter === 'depth') d[id] = d[id]! + (last.level as number);
  else d[id] = 0;
  if (fx.data.savedSeq !== last.seq) {
    fx.data.savedSeq = last.seq;
    fx.data.used = 1;
    const lost = -Number(last.gold);
    m.last = { ...last, kind: 'water', gold: 0, big: false };
    m.caveIns = Math.max(0, m.caveIns - 1);
    note(api, id, `Your Timber Charm held: the cave-in was only a puddle${lost > 0 ? `, and your ${gold(lost)} is safe` : ''}.`, 'good');
  }
}

defineCheats([...cheats, ...more]);
