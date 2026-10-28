import type {
  CurrencyKind,
  DropTable,
  ItemArt,
  ItemType,
  LanternArt,
  Question,
  Rarity,
  ReleaseState,
  SetCoverGlyph,
  ShopSection,
  Subject,
} from '@ludora/shared';

/*
 * Seed content. Everything here is original to Ludora. The server copies it
 * into the database on first run (and on `npm run db:seed`), after which
 * admins manage it from the staff panel.
 */

export interface SeedCurrency {
  code: string;
  name: string;
  description: string;
  kind: CurrencyKind;
  hue: number;
  howToEarn: string;
  howToSpend: string;
  expiresAt?: string;
  sort: number;
}

export interface SeedCollection {
  id: string;
  name: string;
  description: string;
  hue: number;
  /** Granted once, when every item in the collection is owned. */
  reward: { currency: string; amount: number } | null;
  sort: number;
}

export interface SeedItem {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  rarity: Rarity;
  collectionId: string | null;
  art: ItemArt;
  releaseState?: ReleaseState;
  sort?: number;
}

export interface SeedPack {
  id: string;
  name: string;
  description: string;
  art: LanternArt;
  priceCurrency: string;
  priceAmount: number;
  dropTable: DropTable;
  releaseState?: ReleaseState;
  /** ISO instants: the Lantern is on sale only between these (monthly Lanterns). */
  availableFrom?: string;
  availableUntil?: string;
  sort: number;
}

export interface SeedListing {
  id: string;
  section: ShopSection;
  itemId?: string;
  packId?: string;
  bundle?: string[];
  title?: string;
  description?: string;
  priceCurrency: string;
  priceAmount: number;
  worth?: number;
  perUserLimit?: number;
  rotation?: 'daily' | 'weekly';
  startsAt?: string;
  endsAt?: string;
  sort?: number;
}

export type QuestMetric =
  | 'games_played'
  | 'correct_answers'
  | 'podiums'
  | 'wins'
  | 'distinct_modes'
  | 'games_hosted'
  | 'lanterns_opened'
  | 'quick_answers'
  | 'streak_in_game'
  | 'team_games'
  | 'daily_quests';

export interface SeedQuest {
  id: string;
  /** 'event' quests are handed out weekly, only while their event is running. */
  kind: 'daily' | 'weekly' | 'event';
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  reward: { sparks?: number; moonstones?: number; xp?: number; frost_tickets?: number };
  weight?: number;
}

export type AchievementMetric =
  | 'games_played'
  | 'games_won'
  | 'podiums'
  | 'questions_correct'
  | 'best_streak'
  | 'glims_owned'
  | 'collections_completed'
  | 'games_hosted'
  | 'level'
  | 'daily_streak'
  | 'distinct_modes'
  | 'packs_opened'
  | 'sets_created';

export interface SeedAchievement {
  id: string;
  title: string;
  description: string;
  metric: AchievementMetric;
  target: number;
  reward: { sparks?: number; moonstones?: number; xp?: number; itemId?: string };
  tier: 1 | 2 | 3;
  hue: number;
  secret?: boolean;
  sort: number;
}

export interface SeedSet {
  /** Stable key; seeding updates the set with this key in place. */
  seedKey: string;
  title: string;
  description: string;
  subject: Subject;
  gradeBand?: string;
  tags: string[];
  cover: { glyph: SetCoverGlyph; hue: number };
  questions: Question[];
}
