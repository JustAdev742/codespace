/*
 * Night Market odds for the current moment: the tables in meta.ts with the
 * settings, the market event and the player's stall applied. Pure functions
 * over plain values, shared by the engine (to draw and open lanterns) and the
 * screens (to show "What's inside?"), so both always agree.
 */
import {
  CHARM_ODDS,
  FORTUNE_ODDS,
  KIND_WEIGHTS,
  LEVEL_BONUS,
  LEVEL_EVERY,
  SWIPE_MIN,
  SWIPE_PERCENTS,
  TOLL,
  TRICK_ODDS,
  TRICK_WEIGHT_HIGH,
  WILD_ODDS,
  WILD_RULES,
  WILD_WINDS_BOOST,
  type ContentId,
  type LanternKind,
  type MarketEventId,
  type TrickId,
} from './meta.ts';

/** The constants the screens show, from one entry point (`@ludora/engine/night-market-odds`). */
export {
  EVENT_INFO,
  EVENT_TIMING,
  KIND_INFO,
  LANTERN_KINDS,
  LEVEL_EVERY,
  OFFER_SIZE,
  TOLL,
  TRICK_CHOOSE_SEC,
  TRICK_GUARD_SEC,
  type ContentId,
  type LanternKind,
  type MarketEventId,
} from './meta.ts';

export interface OddsSettings {
  greed: string;
  trickOdds: string;
  wildness: string;
}

export interface OddsMoment {
  settings: OddsSettings;
  /** The market event running now, if any. */
  event: MarketEventId | null;
  /** Tricks are on and someone this player may trick is in the game (so someone could trick them back). */
  tricksLive: boolean;
  level: number;
  /** Fortune lanterns a Lucky Streak still doubles. */
  lucky: number;
}

export interface OddsRow<T extends string = string> {
  id: T;
  weight: number;
}

const wildRules = (wildness: string) => (wildness === 'wild' ? WILD_RULES.wild : WILD_RULES.normal);
const greedOf = (greed: string): keyof typeof SWIPE_PERCENTS => (greed === 'gentle' || greed === 'greedy' ? greed : 'normal');

/** The stall level after `rights` right answers: 1, then one more every LEVEL_EVERY. */
export function stallLevel(rights: number): number {
  return 1 + Math.floor(Math.max(0, rights) / LEVEL_EVERY);
}

/** Right answers still needed to reach the next stall level. */
export function toNextLevel(rights: number): number {
  return LEVEL_EVERY - (Math.max(0, rights) % LEVEL_EVERY);
}

/** Flat coin amounts are worth this many times their face value at a stall level (+25% a level). */
export function levelMultiplier(level: number): number {
  return 1 + LEVEL_BONUS * Math.max(0, level - 1);
}

/**
 * Golden Hour and Last Call double the flat coin amounts in Fortune lanterns
 * (+10 to +100 and the jackpot), and so does a Lucky Streak. They multiply:
 * ×4 with both. Shares of your coins (+25%, Double your coins) are never doubled.
 */
export function fortuneMultiplier(event: MarketEventId | null, lucky: number): number {
  return (event === 'golden' || event === 'lastCall' ? 2 : 1) * (lucky > 0 ? 2 : 1);
}

/** What a Wild win multiplies your coins by: ×1.5 (×2 when wild), and one step more in Wild Winds. */
export function wildGrowth(wildness: string, event: MarketEventId | null): number {
  return wildRules(wildness).grow + (event === 'winds' ? WILD_WINDS_BOOST : 0);
}

/** The least a Wild win gives, however few coins you have. */
export function wildGrowMin(wildness: string): number {
  return wildRules(wildness).growMin;
}

/** Percent of your coins a Wild loss takes. */
export function wildLossPercent(wildness: string, id: 'loseSmall' | 'loseBig'): number {
  return wildRules(wildness)[id];
}

/** Percent of the target's coins a swipe takes. */
export function swipePercent(greed: string, id: TrickId): number {
  const tier = ['swipe1', 'swipe2', 'swipe3', 'swipe4'].indexOf(id);
  return tier < 0 ? 0 : (SWIPE_PERCENTS[greedOf(greed)][tier] ?? 0);
}

/** Relative weight of each kind right now. Kinds that cannot appear have weight 0. */
export function kindWeights(m: OddsMoment): Record<LanternKind, number> {
  const wild = wildRules(m.settings.wildness).weight * (m.event === 'winds' ? 2 : 1);
  let trick = m.settings.trickOdds === 'high' ? TRICK_WEIGHT_HIGH : KIND_WEIGHTS.trick;
  if (!m.tricksLive || m.event === 'calm') trick = 0;
  else if (m.event === 'trickster') trick *= 2;
  return { fortune: KIND_WEIGHTS.fortune, wild, trick, charm: KIND_WEIGHTS.charm };
}

/** What a lantern of `kind` may hold right now, with relative weights. */
export function contentWeights(kind: LanternKind, m: OddsMoment): readonly OddsRow<ContentId>[] {
  switch (kind) {
    case 'fortune':
      return FORTUNE_ODDS;
    case 'wild':
      return WILD_ODDS;
    case 'trick':
      return TRICK_ODDS;
    case 'charm':
      return m.tricksLive ? CHARM_ODDS.normal : CHARM_ODDS.noShields;
  }
}

/** The chance of each kind right now, in percent (kinds that cannot appear are left out). */
export function kindPercents(m: OddsMoment): { kind: LanternKind; percent: number }[] {
  const w = kindWeights(m);
  const total = Object.values(w).reduce((n, x) => n + x, 0);
  return (Object.keys(w) as LanternKind[]).filter((k) => w[k] > 0).map((kind) => ({ kind, percent: (w[kind] / total) * 100 }));
}

/** Which kind a content belongs to. */
export function kindOfContent(id: ContentId): LanternKind {
  if (FORTUNE_ODDS.some((r) => r.id === id)) return 'fortune';
  if (WILD_ODDS.some((r) => r.id === id)) return 'wild';
  if (TRICK_ODDS.some((r) => r.id === id)) return 'trick';
  return 'charm';
}

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const times = (n: number) => `×${String(n)}`;

/**
 * A short label for what a lantern holds, as a player reads it, with the
 * stall level and event applied: "+75 coins", "Coins ×1.5", "Swipe 15%".
 */
export function contentLabel(id: ContentId, m: OddsMoment): string {
  const f = FORTUNE_ODDS.find((r) => r.id === id);
  if (f) {
    if (f.coins !== undefined) {
      const coins = Math.round(f.coins * levelMultiplier(m.level) * fortuneMultiplier(m.event, m.lucky));
      return id === 'jackpot' ? `Jackpot: +${fmt(coins)} coins` : `+${fmt(coins)} coins`;
    }
    return id === 'double' ? 'Double your coins' : `+${String(f.percent ?? 0)}% of your coins`;
  }
  switch (id) {
    case 'grow':
      return `Coins ${times(wildGrowth(m.settings.wildness, m.event))}`;
    case 'loseSmall':
    case 'loseBig':
      return `Lose ${String(wildLossPercent(m.settings.wildness, id))}%`;
    case 'swipe1':
    case 'swipe2':
    case 'swipe3':
    case 'swipe4':
      return `Swipe ${String(swipePercent(m.settings.greed, id))}%`;
    case 'swap':
      return 'Swap coins';
    case 'toll':
      return 'Toll';
    case 'shield':
      return 'Shield';
    case 'sight':
      return 'Lantern Sight';
    case 'lucky':
      return 'Lucky Streak';
    default:
      return id;
  }
}

/** A longer line for the odds panel: what this content does. */
export function contentHelp(id: ContentId, m: OddsMoment): string {
  const f = FORTUNE_ODDS.find((r) => r.id === id);
  if (f) {
    if (id === 'quarter') return `A quarter of your coins, at least ${fmt(f.min ?? 0)}. Never doubled.`;
    if (id === 'double') return `Gain as many coins as you have, at least ${fmt(f.min ?? 0)}. Never doubled.`;
    const mult = fortuneMultiplier(m.event, m.lucky);
    const parts = [m.level > 1 ? `Stall level ${String(m.level)}: ${times(levelMultiplier(m.level))}.` : '', mult > 1 ? `Paid ${times(mult)} right now.` : ''].filter(Boolean);
    return parts.length ? parts.join(' ') : 'Coins for your stall.';
  }
  switch (id) {
    case 'grow':
      return `Your coins grow ${times(wildGrowth(m.settings.wildness, m.event))}, at least +${fmt(wildRules(m.settings.wildness).growMin)}.`;
    case 'loseSmall':
    case 'loseBig':
      return `You lose ${String(wildLossPercent(m.settings.wildness, id))}% of your coins.`;
    case 'swap':
      return 'Trade coin totals with a player you choose.';
    case 'toll':
      return `Every player you may trick pays you ${String(TOLL.percent)}% of their coins, at most ${String(TOLL.max)} each and ${String(TOLL.total)} in all. Shields do not stop it.`;
    case 'shield':
      return 'Blocks the next swipe or swap played on you. Hold one at a time.';
    case 'sight':
      return 'Your next three lanterns show what is inside.';
    case 'lucky':
      return 'Your next 2 Fortune lanterns pay double.';
    case 'swipe1':
    case 'swipe2':
    case 'swipe3':
    case 'swipe4':
      return `Take ${String(swipePercent(m.settings.greed, id))}% of the coins of a player you choose, at least ${String(SWIPE_MIN)}.`;
    default:
      return '';
  }
}
