import { defineCheats } from '../registry.ts';
import type { ChaosApi, CheatDef } from '../types.ts';
import { odds, target, transfer } from '../cheats/kit.ts';
import { streamNext } from '../../mechanics/selfPaced.ts';
import { drawLantern, tollPayments } from '../../modes/night-market/index.ts';
import {
  EVENT_INFO,
  EVENT_TIMING,
  FORTUNE_ODDS,
  KIND_INFO,
  LUCKY_CHARGES,
  LUCKY_MAX,
  MARKET_EVENTS,
  OFFER_SIZE,
  SHIELD_REFUND,
  SWIPE_MIN,
  TOLL,
  TRICK_GUARD_SEC,
  WILD_ODDS,
  WILD_RULES,
  type ContentId,
  type LanternKind,
  type MarketEventId,
} from '../../modes/night-market/meta.ts';
import { contentWeights, fortuneMultiplier, levelMultiplier, stallLevel, swipePercent, wildGrowMin, wildGrowth, wildLossPercent, type OddsMoment } from '../../modes/night-market/odds.ts';

/*
 * Cheats that only make sense in Night Market: lanterns, offers, tricks
 * waiting for a target, shields, Lantern Sight, Lucky Streaks, the trick
 * guard, market events and the market news.
 *
 * Coins and charms move through the adapter's meters (score, shield, sight,
 * lucky), so those cheats can be undone. Cheats that also write the stall's
 * notes, offers, pending tricks, guards or the market event are not undoable.
 *
 * Lantern contents are never chosen by a cheat: whenever a cheat draws a
 * lantern it uses the mode's own tables (drawLantern for a whole offer, the
 * kind's table for one lantern), so the odds players see under "What's
 * inside?" stay true. Descriptions say which table a draw uses.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODE = 'night-market';
const M = [MODE] as const;
const NOTES_KEEP = 4;
const NEWS_KEEP = 8;
/** The mode puts swipes of at least this many coins on the market news, and announces 100 or more to the room. */
const NEWS_SWIPE = 15;
const BIG_SWIPE = 100;
/** Cheats that look back at a lantern only look this far back. */
const RECENT_MS = 30_000;

type Api = ChaosApi;
type Stall = any;

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const coinsText = (n: number) => `${fmt(n)} ${Math.round(n) === 1 ? 'coin' : 'coins'}`;
const settingsOf = (api: Api) => api.ctx.settings as any;
const stall = (api: Api, id: string): Stall | undefined => api.s.stalls[id];

/** Everyone a player may trick or charge a toll: other stalls in the game, never teammates (the mode's rivals). */
function rivalsOf(api: Api, id: string): string[] {
  const team = api.teams().length ? api.teamOf(id) : null;
  return api
    .players()
    .filter((p) => p.id !== id && api.s.stalls[p.id] && !(team !== null && p.teamId === team))
    .map((p) => p.id);
}

/** Who a swipe or swap from `id` may go to, with the mode's relaxing rules (the mode's trickable). */
function trickableOf(api: Api, id: string): string[] {
  const all = rivalsOf(api, id);
  const now = api.now();
  const last = stall(api, id)?.lastTarget ?? null;
  const unguarded = (p: string) => (api.s.stalls[p]?.guardUntil ?? 0) <= now;
  for (const keep of [(p: string) => p !== last && unguarded(p), (p: string) => p !== last, unguarded]) {
    const open = all.filter(keep);
    if (open.length) return open;
  }
  return all;
}

function richestFirst(api: Api) {
  return (a: string, b: string) => api.s.stalls[b].coins - api.s.stalls[a].coins || api.name(a).localeCompare(api.name(b)) || a.localeCompare(b);
}

const tricksOn = (api: Api) => settingsOf(api).tricks !== false;

function moment(api: Api, id: string): OddsMoment {
  const st = stall(api, id)!;
  const set = settingsOf(api);
  return {
    settings: { greed: set.greed, trickOdds: set.trickOdds, wildness: set.wildness },
    event: api.s.event?.id ?? null,
    tricksLive: tricksOn(api) && rivalsOf(api, id).length > 0,
    level: stallLevel(st.stream.correct),
    lucky: st.lucky,
  };
}

function pickWeighted<T extends { weight: number }>(api: Api, rows: readonly T[]): T {
  const live = rows.filter((r) => r.weight > 0);
  const total = live.reduce((n, r) => n + r.weight, 0);
  let roll = api.rng.next() * total;
  for (const r of live) {
    roll -= r.weight;
    if (roll < 0) return r;
  }
  return live[live.length - 1]!;
}

function note(api: Api, st: Stall, text: string, tone: 'good' | 'bad' | 'info', icon: 'swipe' | 'swap' | 'shield' | 'toll' | 'level', mine = false) {
  st.notes = [{ id: ++api.s.seq, at: api.now(), text, tone, icon, mine }, ...st.notes].slice(0, NOTES_KEEP);
}

function addNews(api: Api, item: { kind: string; by: string; to: string | null; amount: number; trick: 'swipe' | 'swap' | null }) {
  api.s.news = [{ id: ++api.s.seq, at: api.now(), ...item }, ...api.s.news].slice(0, NEWS_KEEP);
}

/** A fresh offer of three lanterns, drawn with the moment's published odds (the mode's makeOffer). */
function makeOffer(api: Api, id: string, bonus: boolean) {
  const st = stall(api, id)!;
  const m = moment(api, id);
  st.offer = { seq: ++st.seq, lanterns: Array.from({ length: OFFER_SIZE }, () => drawLantern(m, api.rng)), sight: st.sight, bonus };
  st.sight = false;
}

/** After a lantern or trick is done with: the Lantern Rain pick still to come, or the next question (the mode's moveOn). */
function moveOn(api: Api, id: string) {
  const st = stall(api, id);
  if (!st || api.s.winner) return;
  if (st.extraPicks > 0) {
    st.extraPicks--;
    makeOffer(api, id, true);
    return;
  }
  streamNext(st.stream, api.ctx);
}

/** Clears a waiting trick and its timer. */
function takePending(api: Api, id: string) {
  const st = stall(api, id)!;
  const p = st.pending;
  api.ctx.clearTimer(`trick:${id}`);
  st.pending = null;
  return p as { seq: number; content: ContentId; deadline: number };
}

/** Rewrites the result card of the lantern a trick came from, when it is still the one on screen. */
function finishCard(st: Stall, seq: number, patch: Record<string, unknown>) {
  if (st.opened && st.opened.seq === seq) st.opened = { ...st.opened, ...patch, waiting: false };
}

/**
 * Play a swipe or swap from `by` on `to` now, by the mode's rules (playTrick):
 * a shield blocks it (and breaks, except in Calm Night), the target is then
 * watched for 15 seconds, and `by` cannot pick them again next time.
 */
function playTrick(api: Api, by: string, to: string, content: ContentId, how: string): { delta: number; blocked: boolean; title: string } {
  const st = stall(api, by)!;
  const tg = stall(api, to)!;
  const at = api.now();
  st.lastTarget = to;
  tg.guardUntil = at + TRICK_GUARD_SEC * 1000;
  api.s.tricks++;
  const me = api.name(by);
  const them = api.name(to);
  const swap = content === 'swap';
  const word = swap ? 'swap' : 'swipe';
  if (tg.shield) {
    const calm = api.s.event?.id === 'calm';
    if (!calm) api.set('shield', to, 0);
    note(api, tg, `Your shield blocked ${me}’s ${word}.${calm ? ' Calm Night kept it whole.' : ''}`, 'good', 'shield');
    note(api, st, `${them}’s shield blocked your ${word}.`, 'bad', 'shield', true);
    addNews(api, { kind: 'block', by, to, amount: 0, trick: word });
    api.feed(`${them}’s shield blocked ${me}’s ${word} (${how}).`, 'info', [by, to]);
    return { delta: 0, blocked: true, title: `${them}’s shield blocked your ${word}` };
  }
  if (swap) {
    const mine = api.get('score', by);
    const theirs = api.get('score', to);
    api.set('score', by, theirs);
    api.set('score', to, mine);
    const delta = api.get('score', by) - mine;
    const sign = delta < 0 ? `−${fmt(-delta)}` : `+${fmt(delta)}`;
    note(api, tg, delta > 0 ? `${me} swapped coins with you: you lost ${coinsText(delta)}.` : delta < 0 ? `${me} swapped coins with you: you gained ${coinsText(-delta)}.` : `${me} swapped coins with you. You had the same.`, delta > 0 ? 'bad' : 'good', 'swap');
    note(api, st, `You swapped coins with ${them}: ${sign}.`, delta >= 0 ? 'good' : 'bad', 'swap', true);
    addNews(api, { kind: 'swap', by, to, amount: delta, trick: 'swap' });
    api.feed(`${me} swapped coins with ${them} (${how}).`, 'big');
    return { delta, blocked: false, title: delta === 0 ? `Swapped with ${them}: no change` : `Swapped with ${them}: ${sign} coins` };
  }
  const coins = api.get('score', to);
  const pct = swipePercent(settingsOf(api).greed, content as 'swipe1');
  const amount = transfer(api, 'score', to, by, Math.min(coins, Math.max(SWIPE_MIN, Math.round((coins * pct) / 100))));
  note(api, tg, `${me} swiped ${coinsText(amount)} from you.`, 'bad', 'swipe');
  note(api, st, `You swiped ${coinsText(amount)} from ${them}.`, 'good', 'swipe', true);
  if (amount > (api.s.biggestSwipe?.amount ?? 0)) api.s.biggestSwipe = { by, from: to, amount };
  if (amount >= NEWS_SWIPE) addNews(api, { kind: 'swipe', by, to, amount, trick: 'swipe' });
  api.feed(`${me} swiped ${coinsText(amount)} from ${them} (${how}).`, amount >= BIG_SWIPE ? 'big' : 'info', amount >= BIG_SWIPE ? undefined : [by, to]);
  return { delta: amount, blocked: false, title: amount ? `Swiped ${coinsText(amount)} from ${them}` : `${them} had no coins to swipe` };
}

const trickWord = (content: ContentId) => (content === 'swap' ? 'swap' : 'swipe');

function needsPending(api: Api, id: string): { error: string } | null {
  return stall(api, id)?.pending ? null : { error: `${api.name(id)} is not choosing who to swipe or swap right now.` };
}

function needsOffer(api: Api, id: string, who = 'You are'): { error: string } | null {
  return stall(api, id)?.offer ? null : { error: `${who === 'You are' ? who : `${api.name(id)} is`} not holding an offer of lanterns right now.` };
}

/* ----------------------------- one lantern ----------------------------- */

/**
 * Open one lantern for a stall now, outside any offer, with the mode's sizes
 * (stall level, the event running, a Lucky Streak). Coins and charms move
 * through meters. Tricks are never opened this way.
 */
function openOne(api: Api, id: string, kind: 'fortune' | 'wild' | 'charm', content: ContentId): string {
  const st = stall(api, id)!;
  const m = moment(api, id);
  const set = settingsOf(api);
  if (kind === 'fortune') {
    const row = FORTUNE_ODDS.find((r) => r.id === content)!;
    const flat = row.coins !== undefined;
    const base = flat ? row.coins! * levelMultiplier(m.level) : Math.max(row.min ?? 0, (st.coins * (row.percent ?? 0)) / 100);
    const gain = Math.round(base * (flat ? fortuneMultiplier(m.event, m.lucky) : 1));
    if (flat && st.lucky > 0) api.add('lucky', id, -1);
    const got = api.add('score', id, gain);
    return content === 'jackpot' ? `a jackpot: +${coinsText(got)}` : content === 'double' ? `double your coins: +${coinsText(got)}` : `+${coinsText(got)}`;
  }
  if (kind === 'wild') {
    if (content === 'grow') {
      const growth = wildGrowth(set.wildness, m.event);
      const got = api.add('score', id, Math.max(wildGrowMin(set.wildness), Math.round(st.coins * (growth - 1))));
      return `coins ×${growth}: +${coinsText(got)}`;
    }
    const pct = wildLossPercent(set.wildness, content as 'loseSmall' | 'loseBig');
    const lost = -api.add('score', id, -Math.round((st.coins * pct) / 100));
    return lost ? `lose ${pct}%: −${coinsText(lost)}` : `lose ${pct}%, but there was nothing to lose`;
  }
  // Charms, as the mode opens them; a charm you already hold at its limit becomes coins, like a second shield.
  const refund = () => `+${coinsText(api.add('score', id, SHIELD_REFUND))} (already held, so it became coins)`;
  if (content === 'shield') return st.shield ? refund() : (api.set('shield', id, 1), 'a shield');
  if (content === 'sight') return st.sight ? refund() : (api.set('sight', id, 1), 'Lantern Sight');
  if (st.lucky >= LUCKY_MAX) return refund();
  api.add('lucky', id, LUCKY_CHARGES);
  return `a Lucky Streak (${st.lucky} charges)`;
}

/** Draw what is inside one lantern of `kind` from that kind's usual table. */
function drawContent(api: Api, id: string, kind: LanternKind): ContentId {
  return pickWeighted(api, contentWeights(kind, moment(api, id))).id;
}

const FORTUNE_LABEL: Record<string, string> = { quarter: 'a quarter of your coins', double: 'double your coins', jackpot: 'jackpot +250' };
const FORTUNE_TABLE = odds(FORTUNE_ODDS.map((r) => [FORTUNE_LABEL[r.id] ?? `+${r.coins}`, r.weight] as [string, number]));
const WILD_TABLE = odds(
  WILD_ODDS.map((r) => [r.id === 'grow' ? `coins ×${WILD_RULES.normal.grow} (at least +${WILD_RULES.normal.growMin})` : `lose ${WILD_RULES.normal[r.id]}%`, r.weight] as [string, number]),
);
const WILD_HIGH = `(High Rollers: ×${WILD_RULES.wild.grow}, lose ${WILD_RULES.wild.loseSmall}% or ${WILD_RULES.wild.loseBig}%; Wild Winds makes a win bigger)`;
const CHARM_TABLE = `${odds([
  ['shield', 50],
  ['Lantern Sight', 25],
  ['Lucky Streak', 25],
])} (with tricks off: ${odds([
  ['Lantern Sight', 50],
  ['Lucky Streak', 50],
])})`;

/* ------------------------------ market events ------------------------------ */

const EVENT_LINE: Record<string, string> = {
  golden: 'Golden Hour: Fortune lanterns pay double',
  trickster: 'Trickster Moon: Trick lanterns are twice as likely',
  rain: 'Lantern Rain: every right answer gives two picks',
  calm: 'Calm Night: no Trick lanterns, and shields cannot break',
  winds: 'Wild Winds: Wild lanterns are twice as likely and win bigger',
};

/** When the 30-second events must be over: Last Call, or closing time with events off. */
const eventLimit = (api: Api) => (api.s.lastCallAt ?? api.s.endsAt) as number;

/** Puts the next scheduled event at `at`, or drops it when it would run into Last Call (the mode's scheduleEvent). */
function scheduleNextEvent(api: Api, at: number) {
  if (at + EVENT_TIMING.lastsSec * 1000 <= eventLimit(api)) {
    api.s.nextEventAt = at;
    api.ctx.setTimer('event', at);
  } else {
    api.s.nextEventAt = null;
    api.ctx.clearTimer('event');
  }
}

/** The next scheduled event never starts while a chaos-made or chaos-stretched one is still on. */
function pushNextEvent(api: Api, after: number) {
  if (api.s.nextEventAt !== null && api.s.nextEventAt < after) scheduleNextEvent(api, after);
}

function tricksPossible(api: Api) {
  return tricksOn(api) && api.ids().some((id) => api.s.stalls[id] && rivalsOf(api, id).length > 0);
}

function runningEvent(api: Api): { error: string } | null {
  const ev = api.s.event;
  if (!ev) return { error: 'No market event is running right now.' };
  if (ev.id === 'lastCall') return { error: 'Last Call cannot be changed: it runs until the market closes.' };
  return null;
}

/* --------------------------------- cheats --------------------------------- */

const offers: CheatDef[] = [
  {
    id: 'night-market.reroll-offer',
    name: 'Fresh Market Lanterns',
    category: 'economy',
    description: 'Put back the three lanterns you are being offered and get three new ones, drawn with exactly the odds What’s inside? shows right now. Lantern Sight on the offer stays with it.',
    target: 'self',
    modes: M,
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const no = needsOffer(api, c.caster);
      if (no) return no;
      const st = stall(api, c.caster)!;
      const m = moment(api, c.caster);
      st.offer = { ...st.offer, seq: ++st.seq, lanterns: Array.from({ length: OFFER_SIZE }, () => drawLantern(m, api.rng)) };
      api.feed('Fresh Market Lanterns: three new lanterns are on offer.', 'good', [c.caster]);
    },
  },
  {
    id: 'night-market.paint-offer',
    name: 'Market Lantern Painter',
    category: 'economy',
    description:
      'Every lantern in the offer you are holding becomes the kind you choose. What is inside each one is drawn from that kind’s usual table (the odds under What’s inside?), so the kind is certain and the contents are not. Trick lanterns only when tricks can be played (not in Calm Night).',
    target: 'self',
    modes: M,
    params: [
      {
        key: 'kind',
        label: 'Kind',
        kind: 'choice',
        options: (['fortune', 'wild', 'trick', 'charm'] as const).map((k) => ({ value: k, label: KIND_INFO[k].label })),
        default: 'fortune',
      },
    ],
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const no = needsOffer(api, c.caster);
      if (no) return no;
      const kind = String(c.params.kind) as LanternKind;
      const st = stall(api, c.caster)!;
      if (kind === 'trick' && (!moment(api, c.caster).tricksLive || api.s.event?.id === 'calm')) return { error: 'Trick lanterns cannot appear right now.' };
      if (st.offer.lanterns.every((l: any) => l.kind === kind)) return { error: `Your lanterns are all ${KIND_INFO[kind].label} already.` };
      st.offer = { ...st.offer, seq: ++st.seq, lanterns: Array.from({ length: OFFER_SIZE }, () => ({ kind, content: drawContent(api, c.caster, kind) })) };
      api.feed(`Market Lantern Painter: your offer is three ${KIND_INFO[kind].label} lanterns.`, 'good', [c.caster]);
    },
  },
  {
    id: 'night-market.moonlit-peek',
    name: 'Moonlit Stall Peek',
    category: 'advantage',
    description: 'The offer you are holding shows what is inside each lantern, as Lantern Sight would. A Lantern Sight charm you hold is kept for your next offer.',
    target: 'self',
    modes: M,
    cost: 15,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const no = needsOffer(api, c.caster);
      if (no) return no;
      const st = stall(api, c.caster)!;
      if (st.offer.sight) return { error: 'You can already see inside these lanterns.' };
      st.offer = { ...st.offer, sight: true };
    },
  },
  {
    id: 'night-market.snatch-offer',
    name: 'Lantern Offer Snatcher',
    category: 'troll',
    description:
      'Take the offer of three lanterns an opponent is holding: you pick from it, and they go on to their next question (or the Lantern Rain pick still due to them). You cannot be holding an offer or a trick yourself; the question you are on is replaced by a new one after your pick.',
    target: 'opponent',
    modes: M,
    cost: 40,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = needsOffer(api, t, 'them');
      if (no) return no;
      const me = stall(api, c.caster)!;
      if (me.offer || me.pending) return { error: 'Open your own lantern or play your trick first.' };
      const them = stall(api, t)!;
      me.offer = { ...them.offer, seq: ++me.seq };
      them.offer = null;
      moveOn(api, t);
      api.feed(`${api.name(c.caster)} snatched the lanterns ${api.name(t)} was about to pick from.`, 'bad', [c.caster, t]);
    },
  },
  {
    id: 'night-market.dump-offer',
    name: 'Market Lantern Snuffer',
    category: 'troll',
    description: 'Blow out the offer an opponent is holding: all three lanterns go out unopened, so that answer earns them nothing, and they go on to their next question (a Lantern Rain pick still due to them still comes).',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = needsOffer(api, t, 'them');
      if (no) return no;
      stall(api, t)!.offer = null;
      moveOn(api, t);
      api.feed(`${api.name(c.caster)} blew out ${api.name(t)}’s lanterns before they could pick one.`, 'bad', [c.caster, t]);
    },
  },
  {
    id: 'night-market.swap-offers',
    name: 'Stall Switcheroo',
    category: 'troll',
    description: 'Trade the offer you are holding for the one an opponent is holding: each of you picks from the other’s three lanterns. Lantern Sight stays with the offer it was on.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = needsOffer(api, c.caster) ?? needsOffer(api, t, 'them');
      if (no) return no;
      const me = stall(api, c.caster)!;
      const them = stall(api, t)!;
      const mine = me.offer;
      me.offer = { ...them.offer, seq: ++me.seq };
      them.offer = { ...mine, seq: ++them.seq };
      api.feed(`${api.name(c.caster)} switched lanterns with ${api.name(t)}.`, 'info', [c.caster, t]);
    },
  },
  {
    id: 'night-market.carousel',
    name: 'Market Carousel',
    category: 'troll',
    description: 'Every offer of lanterns being held in the market moves one stall along (in the order players joined, the last going to the first), so everyone holding an offer gets someone else’s three lanterns. Needs at least two offers open.',
    target: 'room',
    hostile: true,
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const holders = api.ids().filter((id) => stall(api, id)?.offer);
      if (holders.length < 2) return { error: 'Fewer than two players are holding lanterns right now.' };
      const moving = holders.map((id) => stall(api, id)!.offer);
      holders.forEach((id, i) => {
        const st = stall(api, id)!;
        st.offer = { ...moving[(i - 1 + holders.length) % holders.length], seq: ++st.seq };
      });
      api.feed(`Market Carousel: ${holders.length} offers of lanterns moved one stall along.`, 'big');
    },
  },
  {
    id: 'night-market.second-helping',
    name: 'Lantern Rain for One',
    category: 'advantage',
    description: 'The next offer of lanterns you get within 40 seconds (or the one you are holding) comes with one bonus pick, like Lantern Rain: after you open a lantern, three more are offered.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 40_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const st = stall(api, c.caster)!;
      // An offer already open counts as the next one.
      fx!.data.after = st.offer ? st.offer.seq - 1 : st.seq;
    },
    hooks: {
      tick: (api, fx) => {
        const st = stall(api, fx.caster);
        if (!st?.offer || st.offer.seq <= Number(fx.data.after)) return;
        st.extraPicks++;
        api.feed('Lantern Rain for One: one bonus pick after this lantern.', 'good', [fx.caster]);
        api.endEffect(fx.eid, 'used');
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Bonus pick ready', tone: 'good' }),
  },
  {
    id: 'night-market.lockout',
    name: 'Stall Lantern Lockout',
    category: 'troll',
    description: 'An opponent who is holding an offer of lanterns cannot open any of them for 10 seconds. The offer waits for them.',
    target: 'opponent',
    modes: M,
    cost: 20,
    cooldownMs: 40_000,
    durationMs: 10_000,
    stacking: 'reject',
    apply: (api, c) => needsOffer(api, target(c), 'them') ?? undefined,
    hooks: { gate: (_api, _fx, _id, action) => ((action as any)?.type === 'pick' ? { block: 'Stall Lantern Lockout: your lanterns will not open for a few more seconds.' } : undefined) },
    overlay: (fx) => ({ kind: 'countdown', label: 'Lanterns locked', until: fx.endsAt }),
  },
];

const tricks: CheatDef[] = [
  {
    id: 'night-market.hijack-trick',
    name: 'Trick Lantern Hijack',
    category: 'troll',
    description:
      'An opponent who is choosing who to swipe or swap loses the trick, and you play it instead, right now, on the richest player you may trick (market rules apply: a shield blocks it, a stall tricked in the last 15 seconds is skipped). They go on to their next question.',
    target: 'opponent',
    needs: ['tricks'],
    modes: M,
    cost: 40,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = needsPending(api, t);
      if (no) return no;
      if (stall(api, c.caster)!.pending) return { error: 'Play your own trick first.' };
      const p = takePending(api, t);
      const victim = trickableOf(api, c.caster).sort(richestFirst(api))[0];
      if (!victim) return { error: 'There is nobody you could trick.' };
      finishCard(stall(api, t), p.seq, { delta: 0, title: `${api.name(c.caster)} hijacked your ${trickWord(p.content)}`, detail: null });
      moveOn(api, t);
      playTrick(api, c.caster, victim, p.content, `hijacked from ${api.name(t)}`);
    },
  },
  {
    id: 'night-market.fizzle-trick',
    name: 'Fizzled Trick Lantern',
    category: 'troll',
    description: 'An opponent who is choosing who to swipe or swap has the trick fizzle out: nobody is tricked, and they go on to their next question.',
    target: 'opponent',
    needs: ['tricks'],
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = needsPending(api, t);
      if (no) return no;
      const p = takePending(api, t);
      finishCard(stall(api, t), p.seq, { delta: 0, title: `Your ${trickWord(p.content)} fizzled out`, detail: `${api.name(c.caster)} cast Fizzled Trick Lantern on it.` });
      moveOn(api, t);
      api.feed(`${api.name(c.caster)} put out ${api.name(t)}’s ${trickWord(p.content)} before it landed.`, 'bad', [c.caster, t]);
    },
  },
  {
    id: 'night-market.point-finger',
    name: 'Market Snitch',
    category: 'troll',
    description:
      'Name an opponent: a player who is choosing who to swipe or swap right now (the one with the least time left to choose) must play it on them at once. Market rules apply: it must be someone that player may trick, and a shield still blocks it.',
    target: 'opponent',
    needs: ['tricks'],
    modes: M,
    cost: 35,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const by = api
        .ids()
        .filter((id) => id !== c.caster && id !== t && stall(api, id)?.pending && trickableOf(api, id).includes(t))
        .sort((a, b) => stall(api, a)!.pending.deadline - stall(api, b)!.pending.deadline)[0];
      if (!by) return { error: `Nobody is choosing a trick that could land on ${api.name(t)} right now.` };
      const p = takePending(api, by);
      const r = playTrick(api, by, t, p.content, `${api.name(c.caster)} pointed the finger`);
      finishCard(stall(api, by), p.seq, { delta: r.delta, title: r.title, detail: `${api.name(c.caster)} pointed you at ${api.name(t)}.`, blocked: r.blocked });
      moveOn(api, by);
    },
  },
  {
    id: 'night-market.hurry-trick',
    name: 'Ticking Trick Lantern',
    category: 'troll',
    description: 'An opponent who is choosing who to swipe or swap has only 3 seconds left to choose. If they do not, it goes to the richest player they may trick, as usual when time runs out.',
    target: 'opponent',
    needs: ['tricks'],
    modes: M,
    cost: 15,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const no = needsPending(api, t);
      if (no) return no;
      const p = stall(api, t)!.pending;
      const at = api.now() + 3000;
      if (p.deadline <= at) return { error: `${api.name(t)} has less than 3 seconds left anyway.` };
      p.deadline = at;
      api.ctx.setTimer(`trick:${t}`, at);
      api.feed(`${api.name(c.caster)} lit the fuse: 3 seconds left to choose who to trick.`, 'bad', [t]);
    },
  },
  {
    id: 'night-market.moonlight-swipe',
    name: 'Moonlight Stall Swipe',
    category: 'troll',
    description:
      'Swipe from an opponent at once, as a Trick lantern would, at the second swipe size of this game’s setting (15% normally, at least 5 coins). Market rules apply: a shield blocks it and breaks (Calm Night keeps it whole), and you cannot pick a stall tricked in the last 15 seconds or the one you tricked last.',
    target: 'opponent',
    needs: ['tricks'],
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      if (!rivalsOf(api, c.caster).includes(t)) return { error: 'You cannot trick that player.' };
      if (!trickableOf(api, c.caster).includes(t)) return { error: (stall(api, t)!.guardUntil ?? 0) > api.now() ? `${api.name(t)}’s stall was just tricked and is being watched.` : `You tricked ${api.name(t)} last time. Pick someone else.` };
      if (!stall(api, t)!.shield && api.get('score', t) <= 0) return { error: `${api.name(t)} has no coins to swipe.` };
      playTrick(api, c.caster, t, 'swipe2', 'Moonlight Stall Swipe');
    },
  },
  {
    id: 'night-market.toll-bell',
    name: 'Market Toll Bell',
    category: 'economy',
    description: `Ring the toll bell as if you had opened a Toll lantern: every player you may trick pays you ${TOLL.percent}% of their coins, at most ${TOLL.max} each and ${TOLL.total} in all (shares shrink in a big class). Shields do not stop a toll.`,
    target: 'room',
    hostile: true,
    needs: ['tricks'],
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const from = rivalsOf(api, c.caster);
      const pays = tollPayments(from.map((id) => api.get('score', id)));
      let total = 0;
      from.forEach((id, i) => {
        const got = transfer(api, 'score', id, c.caster, pays[i]!);
        if (got <= 0) return;
        total += got;
        note(api, stall(api, id), `${api.name(c.caster)}’s toll bell took ${coinsText(got)} from you.`, 'bad', 'toll');
      });
      if (total <= 0) return { error: 'Nobody you could charge has coins to pay a toll.' };
      api.feed(`${api.name(c.caster)} rang the toll bell and collected ${coinsText(total)}.`, total >= BIG_SWIPE ? 'big' : 'info', total >= BIG_SWIPE ? undefined : [c.caster]);
    },
  },
  {
    id: 'night-market.payback',
    name: 'Market Payback',
    category: 'score',
    description:
      'Take back the coins of the latest swipe made on you that the market news reported (15 coins or more), from the player who made it, as many as they still have. Only while that swipe is still your latest swipe on the news: once you pay it back, your payback is.',
    target: 'self',
    needs: ['tricks'],
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const last = (api.s.news as any[]).find((n) => n.kind === 'swipe' && (n.to === c.caster || n.by === c.caster));
      if (!last || last.to !== c.caster) return { error: 'The market news shows no swipe on you to pay back.' };
      if (!api.ids().includes(last.by)) return { error: 'The player who swiped you has left the market.' };
      const got = transfer(api, 'score', last.by, c.caster, last.amount);
      if (got <= 0) return { error: `${api.name(last.by)} has no coins left to pay back.` };
      addNews(api, { kind: 'swipe', by: c.caster, to: last.by, amount: got, trick: 'swipe' });
      note(api, stall(api, last.by), `${api.name(c.caster)} took back ${coinsText(got)} you swiped.`, 'bad', 'swipe');
      api.feed(`${api.name(c.caster)} took back ${coinsText(got)} from ${api.name(last.by)}.`, 'info', [c.caster, last.by]);
    },
  },
  {
    id: 'night-market.watchtower',
    name: 'Stall Watchtower',
    category: 'advantage',
    description: 'For the next 45 seconds your stall counts as just tricked: nobody can pick you for a swipe or swap (unless they have nobody else they may trick, when the market relaxes its rules as usual). Tolls still reach you.',
    target: 'self',
    needs: ['tricks'],
    modes: M,
    cost: 30,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const st = stall(api, c.caster)!;
      const until = api.now() + 45_000;
      if (st.guardUntil >= until) return { error: 'Your stall is already watched for that long.' };
      st.guardUntil = until;
    },
  },
  {
    id: 'night-market.open-season',
    name: 'Unwatched Stall',
    category: 'troll',
    description: 'An opponent’s stall stops being watched now (the guard after a trick ends), and you may trick them even if they were the last player you tricked.',
    target: 'opponent',
    needs: ['tricks'],
    modes: M,
    cost: 20,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const st = stall(api, t)!;
      const me = stall(api, c.caster)!;
      const guarded = st.guardUntil > api.now();
      if (!guarded && me.lastTarget !== t) return { error: `Nothing stops you tricking ${api.name(t)} already.` };
      st.guardUntil = 0;
      if (me.lastTarget === t) me.lastTarget = null;
    },
  },
];

const charms: CheatDef[] = [
  {
    id: 'night-market.shield-smash',
    name: 'Stall Shield Smash',
    category: 'troll',
    description: 'Break an opponent’s shield (the one that would block the next swipe or swap played on them). Not during Calm Night, when shields cannot break.',
    target: 'opponent',
    needs: ['tricks'],
    modes: M,
    cost: 25,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      if (!stall(api, t)!.shield) return { error: `${api.name(t)} holds no shield.` };
      if (api.s.event?.id === 'calm') return { error: 'Calm Night: shields cannot break.' };
      api.set('shield', t, 0);
      api.feed(`${api.name(c.caster)} smashed ${api.name(t)}’s shield.`, 'bad', [c.caster, t]);
    },
  },
  {
    id: 'night-market.shield-snatch',
    name: 'Stall Shield Snatch',
    category: 'troll',
    description: 'Take an opponent’s shield for your own stall. You can hold only one, so you must not have one already.',
    target: 'opponent',
    needs: ['tricks'],
    modes: M,
    cost: 35,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const t = target(c);
      if (!stall(api, t)!.shield) return { error: `${api.name(t)} holds no shield.` };
      if (stall(api, c.caster)!.shield) return { error: 'You already hold a shield.' };
      api.set('shield', t, 0);
      api.set('shield', c.caster, 1);
      api.feed(`${api.name(c.caster)} snatched ${api.name(t)}’s shield.`, 'bad', [c.caster, t]);
    },
  },
  {
    id: 'night-market.night-watch',
    name: 'Market Night Watchman',
    category: 'advantage',
    description: 'Gain a shield if you hold none. As usual it blocks the next swipe or swap played on you, then breaks, and everyone can see you hold it.',
    target: 'self',
    needs: ['tricks'],
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    apply: (api, c) => (stall(api, c.caster)!.shield ? { error: 'You already hold a shield.' } : void api.set('shield', c.caster, 1)),
  },
  {
    id: 'night-market.pass-shield',
    name: 'Pass the Stall Shield',
    category: 'advantage',
    description: 'Hand your shield to a teammate who holds none: it blocks the next swipe or swap played on them instead of you.',
    target: 'teammate',
    hostile: false,
    needs: ['teams', 'tricks'],
    modes: M,
    cost: 10,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const t = target(c);
      if (!stall(api, c.caster)!.shield) return { error: 'You hold no shield to pass on.' };
      if (stall(api, t)!.shield) return { error: `${api.name(t)} already holds a shield.` };
      api.set('shield', c.caster, 0);
      api.set('shield', t, 1);
      api.feed(`${api.name(c.caster)} passed you their shield.`, 'good', [t]);
    },
  },
  {
    id: 'night-market.sight-thief',
    name: 'Lantern Sight Thief',
    category: 'troll',
    description: 'Take an opponent’s waiting Lantern Sight: your next offer shows what is inside each lantern, and theirs does not. You must not hold Lantern Sight already.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      if (!stall(api, t)!.sight) return { error: `${api.name(t)} holds no Lantern Sight.` };
      if (stall(api, c.caster)!.sight) return { error: 'You already hold Lantern Sight.' };
      api.set('sight', t, 0);
      api.set('sight', c.caster, 1);
      api.feed(`${api.name(c.caster)} stole ${api.name(t)}’s Lantern Sight.`, 'bad', [c.caster, t]);
    },
  },
  {
    id: 'night-market.copy-sight',
    name: 'Borrowed Lantern Sight',
    category: 'advantage',
    description: 'If an opponent holds Lantern Sight, you get it too: your next offer shows what is inside each lantern. They keep theirs.',
    target: 'opponent',
    hostile: false,
    modes: M,
    cost: 20,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      if (!stall(api, t)!.sight) return { error: `${api.name(t)} holds no Lantern Sight to copy.` };
      if (stall(api, c.caster)!.sight) return { error: 'You already hold Lantern Sight.' };
      api.set('sight', c.caster, 1);
    },
  },
  {
    id: 'night-market.blindfold',
    name: 'Market Blindfold',
    category: 'troll',
    description: 'An opponent loses their Lantern Sight: the charm waiting for their next offer is gone, and an offer they are holding stops showing what is inside.',
    target: 'opponent',
    modes: M,
    cost: 20,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const st = stall(api, t)!;
      if (!st.sight && !st.offer?.sight) return { error: `${api.name(t)} has no Lantern Sight to lose.` };
      api.set('sight', t, 0);
      if (st.offer?.sight) st.offer = { ...st.offer, sight: false };
      api.feed(`${api.name(c.caster)} blindfolded you: no Lantern Sight.`, 'bad', [t]);
    },
  },
  {
    id: 'night-market.lucky-pinch',
    name: 'Lucky Streak Pinch',
    category: 'troll',
    description: `Take an opponent’s Lucky Streak charges (each one doubles a Fortune lantern’s flat coins), as many as you can hold (${LUCKY_MAX} at most).`,
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      if (api.get('lucky', t) <= 0) return { error: `${api.name(t)} has no Lucky Streak.` };
      const got = transfer(api, 'lucky', t, c.caster, api.get('lucky', t));
      if (got <= 0) return { error: `You already hold ${LUCKY_MAX} Lucky Streak charges.` };
      api.feed(`${api.name(c.caster)} pinched ${got} of your Lucky Streak charges.`, 'bad', [t]);
    },
  },
  {
    id: 'night-market.four-leaf',
    name: 'Market Four-Leaf',
    category: 'advantage',
    description: `Your Lucky Streak is topped up to ${LUCKY_MAX} charges: your next ${LUCKY_MAX} Fortune lanterns pay double their flat coins (shares of your coins are never doubled, as usual).`,
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    apply: (api, c) => (api.set('lucky', c.caster, LUCKY_MAX) ? undefined : { error: 'Your Lucky Streak is already full.' }),
  },
  {
    id: 'night-market.charm-swap',
    name: 'Stall Charm Swap',
    category: 'troll',
    description: 'Trade every charm with an opponent: shields, waiting Lantern Sight and Lucky Streak charges all change hands, both ways at once.',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const t = target(c);
      const keys = ['shield', 'sight', 'lucky'];
      if (keys.every((k) => api.get(k, t) === api.get(k, c.caster))) return { error: `You and ${api.name(t)} hold the same charms.` };
      for (const k of keys) {
        const a = api.get(k, c.caster);
        const b = api.get(k, t);
        api.set(k, c.caster, b);
        api.set(k, t, a);
      }
      api.feed(`${api.name(c.caster)} swapped charms with ${api.name(t)}.`, 'info', [c.caster, t]);
    },
  },
  {
    id: 'night-market.shared-sight',
    name: 'Market Lantern Lore',
    category: 'advantage',
    description: 'Everyone on your team who does not hold Lantern Sight gets it: their next offer shows what is inside each lantern.',
    target: 'my-team',
    needs: ['teams'],
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      let n = 0;
      for (const id of c.targets) n += api.set('sight', id, 1);
      if (!n) return { error: 'Everyone on your team already holds Lantern Sight.' };
    },
  },
];

const lanterns: CheatDef[] = [
  {
    id: 'night-market.free-lantern',
    name: 'Market Gift Lantern',
    category: 'economy',
    description: `Open a free lantern of the kind you choose at once, outside any offer. What is inside is drawn from that kind’s usual table, with the usual sizes (stall level, the event running, Lucky Streak). Fortune: ${FORTUNE_TABLE}. Wild: ${WILD_TABLE} ${WILD_HIGH}. Charm: ${CHARM_TABLE}; a charm you already hold (or a full Lucky Streak) becomes ${SHIELD_REFUND} coins.`,
    target: 'self',
    modes: M,
    params: [
      {
        key: 'kind',
        label: 'Kind',
        kind: 'choice',
        options: (['fortune', 'wild', 'charm'] as const).map((k) => ({ value: k, label: KIND_INFO[k].label })),
        default: 'fortune',
      },
    ],
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const kind = String(c.params.kind) as 'fortune' | 'wild' | 'charm';
      const got = openOne(api, c.caster, kind, drawContent(api, c.caster, kind));
      api.feed(`Market Gift Lantern (${KIND_INFO[kind].label}): ${got}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'night-market.wild-dare',
    name: 'Red Wild Lantern Dare',
    category: 'troll',
    description: `Make an opponent open a Wild lantern at once, with their own coins at stake. Odds: ${WILD_TABLE} ${WILD_HIGH}.`,
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const t = target(c);
      const got = openOne(api, t, 'wild', drawContent(api, t, 'wild'));
      api.feed(`${api.name(c.caster)} dared ${api.name(t)} to open a Wild lantern: ${got}.`, 'big');
    },
  },
  {
    id: 'night-market.encore',
    name: 'Fortune Lantern Encore',
    category: 'economy',
    description: 'If the last lantern you opened, in the last 30 seconds, was a Fortune lantern, it pays out again: the same number of coins, now.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const o = stall(api, c.caster)!.opened;
      if (!o || o.kind !== 'fortune' || o.delta <= 0 || api.now() - o.at > RECENT_MS) return { error: 'Your last lantern was not a Fortune lantern opened in the last 30 seconds.' };
      const got = api.addScore(c.caster, o.delta);
      if (!got) return { error: 'Your stall cannot take any more coins.' };
      api.feed(`Fortune Lantern Encore: your last Fortune lantern paid again, +${coinsText(got)}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'night-market.copycat-lantern',
    name: 'Copycat Market Lantern',
    category: 'economy',
    description:
      'Open a copy of the lantern an opponent opened last (in the last 30 seconds), worked out for your own stall now: a Fortune lantern pays with your level and boosts, a Wild one gambles your coins, a charm gives you the same charm (or 30 coins if you hold it). Tricks cannot be copied.',
    target: 'opponent',
    hostile: false,
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const t = target(c);
      const o = stall(api, t)!.opened;
      if (!o || api.now() - o.at > RECENT_MS) return { error: `${api.name(t)} has not opened a lantern in the last 30 seconds.` };
      if (o.kind === 'trick') return { error: 'Tricks cannot be copied.' };
      const got = openOne(api, c.caster, o.kind, o.content);
      api.feed(`Copycat Market Lantern: you copied ${api.name(t)}’s ${KIND_INFO[o.kind as LanternKind].label} lantern: ${got}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'night-market.ill-wind',
    name: 'Ill Market Wind',
    category: 'troll',
    description: 'For 20 seconds, the coins an opponent gets from the lanterns you choose are halved: either every Fortune lantern they open, or every Wild lantern they win.',
    target: 'opponent',
    modes: M,
    params: [
      {
        key: 'kind',
        label: 'Lanterns',
        kind: 'choice',
        options: [
          { value: 'fortune', label: 'Fortune lanterns' },
          { value: 'wild', label: 'Wild wins' },
        ],
        default: 'fortune',
      },
    ],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 20,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const t = target(fx);
          const gain = d[t] ?? 0;
          const o = stall(api, t)?.opened;
          if (gain <= 0 || !o || o.at !== api.now() || o.kind !== fx.params.kind || o.delta !== gain) return;
          const cut = Math.floor(gain / 2);
          if (cut <= 0) return;
          d[t] = gain - cut;
          o.delta = gain - cut;
          o.detail = [o.detail, `Ill Market Wind halved it: +${coinsText(gain - cut)} instead of +${coinsText(gain)}.`].filter(Boolean).join(' ');
          api.feed(`Ill Market Wind halved ${api.name(t)}’s lantern: +${coinsText(gain - cut)} instead of +${coinsText(gain)}.`, 'info', [t, fx.caster]);
        },
      },
    },
    overlay: (fx) => ({ kind: 'badge', text: fx.params.kind === 'wild' ? 'Wild wins halved' : 'Fortune halved', tone: 'bad' }),
  },
];

const events: CheatDef[] = [
  {
    id: 'night-market.summon-event',
    name: 'Market Moon Caller',
    category: 'round',
    description:
      'Start the market event you choose now, for its usual 30 seconds: Golden Hour, Trickster Moon, Lantern Rain, Calm Night or Wild Winds (Trickster Moon and Calm Night only when tricks can be played). Not while another event or Last Call is on, and only if it ends before Last Call. The next scheduled event waits until it is over (and is skipped if it would then run into Last Call).',
    target: 'room',
    needs: ['events'],
    modes: M,
    params: [{ key: 'event', label: 'Event', kind: 'choice', options: MARKET_EVENTS.map((e) => ({ value: e, label: EVENT_INFO[e].label })), default: 'golden' }],
    cost: 45,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api, c) => {
      const id = String(c.params.event) as MarketEventId;
      if (api.s.event) return { error: `${EVENT_INFO[api.s.event.id as MarketEventId].label} is on right now.` };
      if (EVENT_INFO[id].needsTricks && !tricksPossible(api)) return { error: `${EVENT_INFO[id].label} needs tricks that can be played.` };
      const now = api.now();
      const endsAt = now + EVENT_TIMING.lastsSec * 1000;
      if (endsAt > eventLimit(api)) return { error: 'There is not enough time before Last Call.' };
      api.s.event = { id, startedAt: now, endsAt };
      api.s.lastEvent = id;
      api.ctx.setTimer('eventEnd', endsAt);
      pushNextEvent(api, endsAt);
      api.feed(`${api.name(c.caster)} called up ${EVENT_LINE[id]} for 30 seconds.`, 'big');
    },
  },
  {
    id: 'night-market.snuff-event',
    name: 'Market Cloud Cover',
    category: 'round',
    description: 'The market event running now ends at once (Golden Hour, Trickster Moon, Lantern Rain, Calm Night or Wild Winds; never Last Call). The next one still comes when it was due.',
    target: 'room',
    needs: ['events'],
    modes: M,
    cost: 35,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const no = runningEvent(api);
      if (no) return no;
      const label = EVENT_INFO[api.s.event.id as MarketEventId].label;
      api.s.event = null;
      api.ctx.clearTimer('eventEnd');
      api.feed(`${api.name(c.caster)} rolled clouds over the market: ${label} is over.`, 'big');
    },
  },
  {
    id: 'night-market.stretch-event',
    name: 'Long Market Night',
    category: 'round',
    description: 'The market event running now lasts 20 seconds longer (never past the start of Last Call, and never Last Call itself). The next scheduled event waits until it is over.',
    target: 'room',
    needs: ['events'],
    modes: M,
    cost: 30,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const no = runningEvent(api);
      if (no) return no;
      const ev = api.s.event;
      const endsAt = Math.min(ev.endsAt + 20_000, eventLimit(api));
      if (endsAt <= ev.endsAt) return { error: 'The event already runs right up to Last Call.' };
      const added = Math.round((endsAt - ev.endsAt) / 1000);
      ev.endsAt = endsAt;
      api.ctx.setTimer('eventEnd', endsAt);
      pushNextEvent(api, endsAt);
      api.feed(`${api.name(c.caster)} stretched ${EVENT_INFO[ev.id as MarketEventId].label} by ${added} seconds.`, 'big');
    },
  },
  {
    id: 'night-market.fickle-moon',
    name: 'Fickle Market Moon',
    category: 'random',
    description: `The market event running now turns into a different one, which keeps the time that was left. Each other event that can run is equally likely: with tricks live, ${odds([['each of the 4 others', 25]])}; when nobody can be tricked, Trickster Moon and Calm Night cannot run, and the other events that can share the odds equally (usually ${odds([['each of 2', 50]])}).`,
    target: 'room',
    needs: ['events'],
    modes: M,
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const no = runningEvent(api);
      if (no) return no;
      const ev = api.s.event;
      const live = tricksPossible(api);
      const pool = MARKET_EVENTS.filter((e) => e !== ev.id && (live || !EVENT_INFO[e].needsTricks));
      if (!pool.length) return { error: 'No other event can run here.' };
      const id = api.rng.pick(pool);
      const was = EVENT_INFO[ev.id as MarketEventId].label;
      ev.id = id;
      api.s.lastEvent = id;
      api.feed(`${api.name(c.caster)} spun the moon: ${was} became ${EVENT_LINE[id]}.`, 'big');
    },
  },
  {
    id: 'night-market.early-last-call',
    name: 'Night Market Last Call',
    category: 'round',
    description: 'Last Call starts now instead of in the last 45 seconds: Fortune lanterns pay double until the market closes, and no more 30-second events come. Closing time does not move.',
    target: 'room',
    needs: ['events'],
    modes: M,
    cost: 70,
    cooldownMs: 180_000,
    undoable: false,
    apply: (api, c) => {
      const s = api.s;
      if (s.event?.id === 'lastCall' || s.lastCallAt === null) return { error: 'Last Call is already on.' };
      const now = api.now();
      s.lastCallAt = now;
      s.event = { id: 'lastCall', startedAt: now, endsAt: s.endsAt };
      s.lastEvent = 'lastCall';
      s.nextEventAt = null;
      for (const t of ['lastCall', 'event', 'eventEnd']) api.ctx.clearTimer(t);
      api.feed(`${api.name(c.caster)} rang Last Call early: Fortune lanterns pay double until the market closes.`, 'big');
    },
  },
];

const cheats: CheatDef[] = [...offers, ...tricks, ...charms, ...lanterns, ...events];

for (const c of cheats) if (!c.modes || c.modes.length !== 1 || c.modes[0] !== MODE || !c.id.startsWith(`${MODE}.`)) throw new Error(`${c.id} is not a ${MODE} cheat`);
defineCheats(cheats);
