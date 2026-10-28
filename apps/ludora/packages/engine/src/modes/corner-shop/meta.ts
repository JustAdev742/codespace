/*
 * Corner Shop: metadata, settings, variants and every table the mode uses.
 * The browser imports this file (the "./corner-shop" entry in package.json)
 * for the catalogue, the upgrade costs, the crate odds and the product lines,
 * so it holds data and display helpers only: no game logic.
 *
 * Money is whole dollars everywhere: prices, cash, tips and costs.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';
import type { LineId } from './products.ts';

export { LINE_ORDER, LINES, PRODUCT_ORDER, PRODUCTS, itemText, type LineId, type ProductId } from './products.ts';

/** "$1,240". */
export function cashText(dollars: number): string {
  const n = Math.round(dollars);
  return `${n < 0 ? '−' : ''}$${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/* --------------------------------- the shop --------------------------------- */

/** Shop size: a corner shop, or the smaller Market Stall. */
export const SHOP_SIZES = {
  /** `slots` product lines at shelf level 0, one more for each shelf level up to `shelfMax`. */
  shop: { startLines: ['fruit', 'bakery'] as readonly LineId[], slots: 2, capacity: 12, capacityStep: 4, shelfMax: 3, patienceMs: 30_000, customers: 1, sizes: [30, 45, 25] },
  stall: { startLines: ['fruit'] as readonly LineId[], slots: 1, capacity: 8, capacityStep: 4, shelfMax: 2, patienceMs: 20_000, customers: 1.35, sizes: [55, 35, 10] },
} as const;
export type ShopSize = keyof typeof SHOP_SIZES;

/** Every shelf starts this full (a share of its capacity, rounded down). */
export const START_STOCK = 0.5;

/* -------------------------------- customers --------------------------------- */

/**
 * The average gap between customers at 3 stars, with no sign and no event. Each gap is drawn
 * when the customer before arrives: anywhere from half to one and a half times the average.
 */
export const BASE_GAP_MS = 10_000;
/** Customers come this many times as often for each star above 3 (and less often below). */
export const STAR_CUSTOMERS = 0.2;
/** Variety brings people in: each product line beyond two brings this many more customers (a stall's one line, this many fewer). */
export const LINE_CUSTOMERS = 0.1;
/** The host's choice of how busy the shop is. */
export const BUSY: Record<string, { label: string; mult: number }> = {
  calm: { label: 'Calm', mult: 0.75 },
  normal: { label: 'Normal', mult: 1 },
  busy: { label: 'Busy', mult: 1.3 },
};
/** The longest queue. Anyone who arrives to a full queue walks past. */
export const QUEUE_MAX = 6;
/** Co-op: each teammate after the first brings this many more customers (up to `max` times), and room for 2 more in the queue (up to 12). */
export const COOP = { perMember: 0.75, max: 6, queuePerMember: 2, queueMax: 12 } as const;
/** Each customer's patience is the shop's patience times a number from 0.85 to 1.15. */
export const PATIENCE_SPREAD = 0.15;
/** How many things a customer wants (1, 2, 3 ...), by weight. Big Spenders want 2 to 5. */
export const BIG_SPENDER_SIZES = [0, 25, 35, 25, 15] as const;
/** A regular customer sometimes asks for something from a line the shop does not sell yet. */
export const UNSTOCKED_CHANCE = 0.1;

export type CustomerKind = 'regular' | 'vip' | 'hurry';
/**
 * Special customers (a setting, on by default). A VIP wants one or two of a single thing the
 * shop sells and tips three times as much, but is cross if they cannot have it all. A customer
 * in a hurry waits half as long and tips double. Big Spenders brings more VIPs.
 */
export const CUSTOMER_KINDS: Record<CustomerKind, { label: string; chance: number; bigChance: number; tip: number; patience: number; text: string }> = {
  regular: { label: 'Customer', chance: 0, bigChance: 0, tip: 1, patience: 1, text: 'Wants one to three things.' },
  vip: { label: 'VIP', chance: 0.12, bigChance: 0.25, tip: 3, patience: 1, text: 'Wants one special thing. Tips three times as much, but serve it all or they are cross.' },
  hurry: { label: 'In a hurry', chance: 0.12, bigChance: 0.12, tip: 2, patience: 0.5, text: 'Waits half as long. Tips double.' },
};

/** Friendly names for customers. */
export const CUSTOMER_NAMES: readonly string[] = [
  'Ada', 'Ali', 'Amara', 'Arlo', 'Bea', 'Billie', 'Cai', 'Dev', 'Eli', 'Ella', 'Ezra', 'Finn', 'Gus', 'Hana',
  'Hugo', 'Ivy', 'Jai', 'Kai', 'Lani', 'Leo', 'Lily', 'Luca', 'Mae', 'Mia', 'Milo', 'Nia', 'Noah', 'Ollie',
  'Pip', 'Priya', 'Rafi', 'Remy', 'Rosa', 'Ruby', 'Sami', 'Tama', 'Theo', 'Uma', 'Wren', 'Yuki', 'Zara', 'Zed',
];

/* --------------------------------- serving ---------------------------------- */

/**
 * Tips. A customer served at once tips `rate` of what they paid, times stars ÷ 5, times their
 * kind's tip; the tip shrinks to nothing as their patience runs out. Rounded to whole dollars.
 * Big Spenders tip twice as much. A partly served customer tips half (a VIP, nothing).
 */
export const TIP = { rate: 0.2, bigSpenders: 2, partial: 0.5 } as const;

/** Rating, in tenths of a star, from 1 to 5 stars. It starts at 3 and the screens show it in half stars. */
export const RATING = {
  start: 30,
  min: 10,
  max: 50,
  /** Served everything they wanted within the first third of their patience... */
  quick: 2,
  /** ...within the first two thirds (later than that: no change). */
  full: 1,
  /** A VIP served everything, on top. */
  vip: 2,
  /** Served some of it. */
  partial: -2,
  /** A VIP served only some of it. */
  vipPartial: -4,
  /** Served nothing: "Sorry, we have none of that." */
  sorry: -3,
  /** Waited too long and left. */
  left: -5,
} as const;

/* ------------------------------- deliveries --------------------------------- */

/** Options in every delivery offer. */
export const OFFER_SIZE = 3;
/** The chance an offer holds a mystery crate (in place of one of the products). */
export const CRATE_CHANCE = 0.2;

export type CrateId = 'mixed' | 'fill' | 'double' | 'cash' | 'golden';
/** What a mystery crate holds, by weight (out of 100). The screens show these odds. */
export const CRATE_ODDS: readonly { id: CrateId; weight: number; title: string; text: string }[] = [
  { id: 'mixed', weight: 40, title: 'Bit of everything', text: '2 more of everything you sell.' },
  { id: 'fill', weight: 25, title: 'Top-up', text: 'Fills your emptiest shelf.' },
  { id: 'double', weight: 15, title: 'Double delivery', text: 'Two deliveries of one thing you sell.' },
  { id: 'cash', weight: 12, title: 'Thank-you card', text: '$10 from a happy supplier.' },
  { id: 'golden', weight: 8, title: 'Golden crate', text: 'Fills every shelf.' },
];
export const CRATE_MIXED = 2;
export const CRATE_CASH = 10;

/* -------------------------------- upgrades ---------------------------------- */

export type UpgradeId = 'shelf' | 'till' | 'decor' | 'sign';
export const UPGRADE_ORDER: readonly UpgradeId[] = ['shelf', 'till', 'decor', 'sign'];

/**
 * What each level costs and does. Level 0 is what every shop starts with. Shelves stop at
 * level 2 in a Market Stall. Tuned by bot simulation: bought early, shelves and product lines
 * pay for themselves several times over; a sign pays back narrowly, and a faster till and
 * cosy decor only when the queue is losing customers.
 */
export const UPGRADES: Record<UpgradeId, { name: string; levels: readonly { cost: number; title: string; text: string }[] }> = {
  shelf: {
    name: 'Shelves',
    levels: [
      { cost: 15, title: 'Bigger shelves', text: '+4 on every shelf and room for one more product line.' },
      { cost: 30, title: 'Tall shelves', text: '+4 on every shelf and room for one more product line.' },
      { cost: 50, title: 'Grand shelves', text: '+4 on every shelf and room for one more product line.' },
    ],
  },
  till: {
    name: 'Till',
    levels: [
      { cost: 20, title: 'Quick till', text: 'The till is ready again after 1 second instead of 2.5.' },
      { cost: 45, title: 'Double till', text: 'Serve two customers at once.' },
    ],
  },
  decor: {
    name: 'Cosy decor',
    levels: [
      { cost: 15, title: 'Comfy chairs', text: 'Customers wait 8 seconds longer.' },
      { cost: 30, title: 'Plants and music', text: 'Customers wait 16 seconds longer.' },
    ],
  },
  sign: {
    name: 'Sign',
    levels: [
      { cost: 15, title: 'Painted sign', text: '30% more customers.' },
      { cost: 35, title: 'Neon sign', text: '60% more customers.' },
    ],
  },
};
/** The till is busy this long after each serve, by till level. */
export const TILL_MS = [2_500, 1_000, 1_000] as const;
/** Customers served by one press of Serve, by till level. */
export const TILL_SERVES = [1, 1, 2] as const;
/** Extra patience, by decor level. */
export const DECOR_MS = [0, 8_000, 16_000] as const;
/** Customers come this many times as often, by sign level. */
export const SIGN_CUSTOMERS = [1, 1.3, 1.6] as const;

/* --------------------------------- events ----------------------------------- */

export type EventKind = 'rush' | 'sale' | 'truck';
/** The first event comes at 1 minute, then one every 70 to 90 seconds; never the same one twice in a row. */
export const EVENT_TIMING = { firstAtMs: 60_000, gapMinMs: 70_000, gapMaxMs: 90_000 } as const;
export const EVENTS: Record<EventKind, { title: string; lengthMs: number; customers: number; text: string }> = {
  rush: { title: 'Rush Hour', lengthMs: 25_000, customers: 2, text: 'Twice as many customers for 25 seconds.' },
  sale: { title: 'Sale Day', lengthMs: 30_000, customers: 1.5, text: 'Everything a fifth cheaper and half as many customers again, for 30 seconds.' },
  truck: { title: 'Delivery Truck', lengthMs: 8_000, customers: 1, text: 'Free stock for everyone: 3 more of everything you sell.' },
};
export const EVENT_ORDER: readonly EventKind[] = ['rush', 'sale', 'truck'];
/** Sale Day prices: a fifth off, rounded to whole dollars, never below $1. */
export const SALE_OFF = 0.2;
export const TRUCK_STOCK = 3;

/* ---------------------------------- meta ------------------------------------ */

export const meta: ModeMeta = {
  id: 'corner-shop',
  title: 'Corner Shop',
  tagline: 'Right answers bring the deliveries. Customers bring the cash.',
  description:
    'Run a little shop. Every right answer brings a choice of three deliveries to fill your shelves. Customers arrive by themselves and queue at the till: serve them before they lose patience, and quick service earns tips and a better rating, which brings more customers. Spend your cash on bigger shelves, new product lines, a faster till, cosy decor and a sign, but only if they will pay for themselves. The most cash when the shop shuts wins.',
  category: 'strategy',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '1 to 40' },
  duration: { min: 5, max: 10 },
  difficulty: 2,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: {
    fields: ['timeLimitSec'],
    defaults: { timeLimitSec: 420 },
    help: { timeLimitSec: 'The shop always shuts: with no limit it closes after 7 minutes.' },
  },
  rules: [
    'Every right answer brings a choice of three deliveries. Pick one to fill your shelves. A wrong answer brings the next question.',
    'Each shelf holds only so much. Stock that does not fit is wasted, and every delivery says how much will fit.',
    'Customers come by themselves and queue at your till. Each one wants one to three things.',
    'Serve a customer to sell what they want. If you are out of something, they buy what you have.',
    'Serve quickly for bigger tips. A customer who waits too long leaves, and your rating drops.',
    'Gold VIPs want one special thing and tip three times as much. Customers in a hurry wait half as long and tip double.',
    'A better rating brings more customers. Spend cash on shelves, product lines, a faster till, cosy decor and a sign.',
    'Rush Hour, Sale Day and the Delivery Truck come along every minute or so.',
    'The most cash when the shop shuts wins. Spending lowers your cash, so make every upgrade pay for itself.',
    'In a team game, the best average wins.',
  ],
  thumbnail: { glyph: 'chest', hue: 150, accentHue: 40 },
  status: 'playable',
  stage: '3d',
  tags: ['economy', 'shop', 'strategy', 'projector', 'self-paced', '3d'],
  accessibility: [
    'Every delivery, customer, upgrade and product line is an ordinary button with its words and numbers written on it.',
    'VIPs and customers in a hurry are named in words and icons, never by colour alone.',
    'Patience is shown as seconds left as well as a bar.',
    'The odds of every mystery crate are listed in the game.',
    'The shop plays without 3D: the scene is a picture, not the controls.',
  ],
};

export const settings: SettingField[] = [
  {
    kind: 'select',
    key: 'busy',
    label: 'Customers',
    options: [
      { value: 'calm', label: 'Calm' },
      { value: 'normal', label: 'Normal' },
      { value: 'busy', label: 'Busy' },
    ],
    default: 'normal',
  },
  { kind: 'toggle', key: 'specials', label: 'Special customers', help: 'VIPs who tip big, and customers in a hurry.', default: true },
  { kind: 'toggle', key: 'events', label: 'Shop events', help: 'Rush Hour, Sale Day and the Delivery Truck.', default: true },
  {
    kind: 'select',
    key: 'shopSize',
    label: 'Shop size',
    help: 'A Market Stall starts with one product line, smaller shelves and quicker customers.',
    options: [
      { value: 'shop', label: 'Corner shop' },
      { value: 'stall', label: 'Market stall' },
    ],
    default: 'shop',
  },
  { kind: 'toggle', key: 'bigSpenders', label: 'Big spenders', help: 'Customers want 2 to 5 things, tip twice as much, and more of them are VIPs.', default: false },
  { kind: 'toggle', key: 'coop', label: 'Team shops', help: 'With teams, each team runs one shop together: shared shelves, queue and cash.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'corner-shop-market-stall',
      modeId: 'corner-shop',
      title: 'Market Stall',
      tagline: 'One product line, small shelves, and customers who will not wait.',
      changes: 'The shop is a market stall: it starts with only fruit, its shelves hold 8 and can grow to 3 product lines, and customers come more often but wait only 20 seconds.',
      status: 'playable',
      thumbnail: { hue: 95, accentHue: 30 },
    },
    settings: { shopSize: 'stall' },
    locked: ['shopSize'],
  },
  {
    meta: {
      id: 'corner-shop-big-spenders',
      modeId: 'corner-shop',
      title: 'Big Spenders',
      tagline: 'Bigger baskets, bigger tips, and VIPs at every turn.',
      changes: 'Every customer wants 2 to 5 things, tips are twice as big, and one customer in four is a VIP, so stock runs low fast and the queue is worth fighting for.',
      status: 'playable',
      thumbnail: { hue: 45, accentHue: 300 },
    },
    settings: { bigSpenders: true, specials: true },
    locked: ['bigSpenders', 'specials'],
  },
  {
    meta: {
      id: 'corner-shop-co-op',
      modeId: 'corner-shop',
      title: 'Co-op Shop',
      tagline: 'One shop per team. Share the shelves, the queue and the cash.',
      changes: 'Players split into teams and each team runs one shop together: everyone’s deliveries fill the same shelves, anyone can serve the queue, and the team’s cash is its score.',
      status: 'playable',
      thumbnail: { hue: 200, accentHue: 45 },
    },
    settings: { coop: true },
    common: { teamCount: 2 },
    locked: ['coop'],
  },
];
