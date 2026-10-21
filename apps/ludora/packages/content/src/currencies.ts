import { FROST_FESTIVAL } from './shop.ts';
import type { SeedCurrency } from './types.ts';

export const CURRENCIES: SeedCurrency[] = [
  {
    code: 'sparks',
    name: 'Sparks',
    description: 'The everyday currency of Ludora.',
    kind: 'soft',
    hue: 42,
    howToEarn: 'Playing games: taking part, correct answers and podium places. Also daily streaks, quests and level-ups.',
    howToSpend: 'Lanterns, Glims in the daily picks, accessories and most cosmetics.',
    sort: 1,
  },
  {
    code: 'moonstones',
    name: 'Moonstones',
    description: 'Rare stones for milestones. They cannot be bought.',
    kind: 'premium',
    hue: 255,
    howToEarn: 'Every fifth level, week-long streaks, weekly quests and achievements.',
    howToSpend: 'Special Lanterns and the rarest cosmetics.',
    sort: 2,
  },
  {
    code: 'dust',
    name: 'Glow Dust',
    description: 'What a spare Glim turns into when you recycle it.',
    kind: 'crafting',
    hue: 175,
    howToEarn: 'Recycling duplicate Glims. Rarer Glims give more.',
    howToSpend: 'Crafting the exact Glim you want.',
    sort: 3,
  },
  {
    code: 'frost_tickets',
    name: 'Frost Tickets',
    description: 'Event tickets for the Frost Festival. They vanish when the festival ends.',
    kind: 'event',
    hue: 195,
    howToEarn: 'Weekly quests during the Frost Festival.',
    howToSpend: 'Frost Festival items in the Event shop.',
    expiresAt: FROST_FESTIVAL.endsAt,
    sort: 4,
  },
];
