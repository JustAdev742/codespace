/*
 * Lantern Trail: catalogue metadata and the numbers the rules use. The browser
 * imports this file (through the catalogue and board.ts), so it holds data
 * only: every payout, price and probability the game uses lives here, where
 * the screens can show them.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'lantern-trail',
  title: 'Lantern Trail',
  tagline: 'Roll the dice round the festival town and chase the Golden Lantern stall.',
  description:
    'A festival board game round a lantern-lit town. Right answers roll the dice and walk your Glim along the trail, past coin spaces, lucky fairs, chance cards, ferries and a shortcut. Catch the Golden Lantern stall with enough coins to buy a lantern, and it moves on, so the whole room races after it. Most Golden Lanterns wins, and one lucky roll can change the lead right up to the end.',
  category: 'party',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '2 to 40' },
  duration: { min: 5, max: 10 },
  difficulty: 1,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: {
    fields: ['timeLimitSec'],
    defaults: { timeLimitSec: 420 },
    help: { timeLimitSec: 'The game ends when time runs out (after 7 minutes if you set no limit). The last 45 seconds are always Last lanterns.' },
  },
  rules: [
    'A right answer rolls the dice and walks your Glim round the town. A wrong answer means no roll this time.',
    'Three right answers in a row start a hot streak: you roll two dice until your next wrong answer.',
    'Coin spaces pay 3 coins and lucky fairs pay 6. Gloom puddles take 3. Walking past the Town Gate pays 5.',
    'A chance space draws a chance card. A ferry carries you straight across the river.',
    'At the Crossroads, take the long way round or the shortcut, which is 6 steps quicker.',
    'Pass or land on the Golden Lantern stall with 20 coins and you can buy a Golden Lantern. Then the stall moves somewhere else.',
    'Every 90 seconds a room event changes a rule for 30 seconds. In the last 45 seconds, Golden Lanterns cost 10.',
    'Most Golden Lanterns wins. Coins break a tie.',
  ],
  thumbnail: { glyph: 'dice', hue: 140, accentHue: 45 },
  status: 'playable',
  tags: ['board game', 'party', 'chance', 'projector', 'self-paced'],
  accessibility: [
    'Every space has its own icon and name as well as its colour, and every roll and move is told in words.',
    'Choices are big buttons that work with a keyboard or a switch. Each waits 15 seconds before the game picks for you.',
    'With reduced motion, Glims and the stall jump straight to their new space.',
  ],
};

export const settings: SettingField[] = [
  {
    kind: 'select',
    key: 'price',
    label: 'Golden Lantern price',
    options: [
      { value: '10', label: '10 coins' },
      { value: '20', label: '20 coins' },
      { value: '30', label: '30 coins' },
    ],
    default: '20',
  },
  {
    kind: 'select',
    key: 'stalls',
    label: 'Golden Lantern stalls',
    help: 'One stall makes the whole room race for it. In a room of 10 or more, a single stall leaves too many players waiting, so the automatic choice adds a second.',
    options: [
      { value: 'auto', label: 'One, and a second for 10 or more players' },
      { value: '1', label: 'One stall' },
      { value: '2', label: 'Two stalls, each moving on its own' },
    ],
    default: 'auto',
  },
  {
    kind: 'toggle',
    key: 'events',
    label: 'Room events',
    help: 'A surprise for the whole room every 90 seconds, for 30 seconds: double dice, a lantern sale and more. Last lanterns lights the final 45 seconds either way.',
    default: true,
  },
  {
    kind: 'toggle',
    key: 'tricks',
    label: 'Tricks',
    help: 'The Pickpocket Glim and Trade places chance cards, which take coins from another player or swap places with them.',
    default: true,
  },
  { kind: 'toggle', key: 'luckyDice', label: 'Lucky dice', help: 'Roll two dice and keep the higher one, instead of rolling one.', default: false },
  {
    kind: 'number',
    key: 'goalLanterns',
    label: 'Golden Lanterns to win',
    help: 'The first player to collect this many wins straight away. 0 plays until time runs out.',
    min: 0,
    max: 20,
    step: 1,
    default: 0,
    unit: 'lanterns',
  },
  { kind: 'toggle', key: 'bumper', label: 'Bumper payouts', help: 'Coin spaces and lucky fairs pay double.', default: false },
  { kind: 'toggle', key: 'puddles', label: 'Gloom puddles', help: 'Off turns every gloom puddle into a lucky fair, and takes the Gloom puddle card out of the chance cards.', default: true },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'lantern-trail-two-stalls',
      modeId: 'lantern-trail',
      title: 'Two Stalls',
      tagline: 'Two Golden Lantern stalls, each wandering on its own.',
      changes: 'Two Golden Lantern stalls stand on the trail at once, and each moves somewhere new when someone buys from it, so there is nearly always one worth chasing.',
      status: 'playable',
      thumbnail: { hue: 45, accentHue: 140 },
    },
    settings: { stalls: '2' },
    locked: ['stalls'],
  },
  {
    meta: {
      id: 'lantern-trail-bumper-night',
      modeId: 'lantern-trail',
      title: 'Bumper Night',
      tagline: 'Double payouts, pricier lanterns.',
      changes: 'Coin spaces pay 6 and lucky fairs pay 12, but a Golden Lantern costs 30 coins. Puddles still take 3, so they sting less, and every lantern is a bigger moment.',
      status: 'playable',
      thumbnail: { hue: 30, accentHue: 55 },
    },
    settings: { bumper: true, price: '30' },
    locked: ['bumper', 'price'],
  },
  {
    meta: {
      id: 'lantern-trail-lucky-dice',
      modeId: 'lantern-trail',
      title: 'Lucky Dice',
      tagline: 'Roll two dice and keep the higher one.',
      changes: 'Every ordinary roll is two dice and you keep the higher one, so big steps come far more often. Hot streaks and Double dice still add two dice together.',
      status: 'playable',
      thumbnail: { hue: 165, accentHue: 300 },
    },
    settings: { luckyDice: true },
    locked: ['luckyDice'],
  },
  {
    meta: {
      id: 'lantern-trail-kind-night',
      modeId: 'lantern-trail',
      title: 'Kind Night',
      tagline: 'No tricks and no puddles. Only good luck.',
      changes: 'Nobody can take your coins or swap places with you, and every gloom puddle is a lucky fair instead, so you never lose a coin you did not spend. A gentle night for younger players.',
      status: 'playable',
      thumbnail: { hue: 200, accentHue: 50 },
    },
    settings: { tricks: false, puddles: false },
    locked: ['tricks', 'puddles'],
  },
  {
    meta: {
      id: 'lantern-trail-short-night',
      modeId: 'lantern-trail',
      title: 'Short Night',
      tagline: 'Three minutes and cheap lanterns.',
      changes: 'A three-minute dash where a Golden Lantern costs only 10 coins, so coins hardly matter: the night is a race to reach the stall first, and it moves on after every purchase.',
      status: 'playable',
      thumbnail: { hue: 275, accentHue: 45 },
    },
    settings: { price: '10' },
    common: { timeLimitSec: 180 },
    locked: ['price', 'timeLimitSec'],
  },
];

/* ------------------------------ the numbers ------------------------------ */

/** Coins paid or taken by the spaces, before events and Bumper payouts. */
export const PAYOUTS = { coins: 3, fair: 6, gloom: 3, gate: 5 } as const;
/** Coins everyone starts with (late joiners too): half a lantern, so the first race to the stall starts at once. */
export const START_COINS = 15;
/** With the automatic stall setting, rooms of this many players get a second stall. */
export const SECOND_STALL_AT = 10;
/** Right answers in a row that start a hot streak (two dice, added). */
export const HOT_STREAK = 3;
/** How long a choice waits before the game picks for the player. */
export const CHOICE_SECONDS = 15;
/** After a purchase the stall moves to a space at least this many steps ahead of the buyer. */
export const STALL_MOVE_MIN = 8;
/** The cheapest a Golden Lantern can ever be, whatever the discounts. */
export const MIN_PRICE = 5;
/** A Golden ticket takes this much off the next Golden Lantern. */
export const TICKET_DISCOUNT = 10;
export const PICKPOCKET_COINS = 5;
export const WIND_STEPS = 3;
export const RUMOUR_STEPS = 3;
export const PURSE_COINS = 10;
/** Coin shower: everyone else gets `others`, the player who drew it gets `you`. */
export const SHOWER_COINS = { others: 3, you: 6 } as const;
export const GLOOM_CARD_COINS = 5;

/** Room events: the first at 60 seconds, then one every 90 seconds, each lasting 30 seconds. */
export const EVENT_TIMING = { firstSec: 60, everySec: 90, lengthSec: 30, minSec: 10, paradeEverySec: 10, paradeSteps: 3 } as const;
/** Last lanterns: the final 45 seconds. Lanterns cost 10 and the stall moves 4 to 12 steps after a purchase (half as far). */
export const FINALE = { seconds: 45, price: 10, minSteps: 4, maxSteps: 12 } as const;

export type CardId = 'wind' | 'purse' | 'shower' | 'rumour' | 'ticket' | 'pickpocket' | 'trade' | 'gloom';

/**
 * The chance cards and their weights (out of 100). Cards that need another
 * player to pick (tricks) only appear when there is one, the Gloom puddle card
 * only while puddles are on, and the weights of the cards left share out the
 * whole: see the odds each player is sent in the view.
 */
export const CHANCE_CARDS: readonly { id: CardId; title: string; text: string; weight: number; trick: boolean }[] = [
  { id: 'wind', title: 'Wind at your back', text: 'Move forward 3 more.', weight: 15, trick: false },
  { id: 'purse', title: 'Lucky purse', text: '+10 coins.', weight: 20, trick: false },
  { id: 'shower', title: 'Coin shower', text: 'Everyone gets 3 coins, and you get 6.', weight: 10, trick: false },
  { id: 'rumour', title: 'Stall rumour', text: 'The nearest stall moves 3 spaces towards you.', weight: 10, trick: false },
  { id: 'ticket', title: 'Golden ticket', text: 'Your next Golden Lantern costs 10 less.', weight: 10, trick: false },
  { id: 'pickpocket', title: 'Pickpocket Glim', text: 'Take 5 coins from a player you choose.', weight: 15, trick: true },
  { id: 'trade', title: 'Trade places', text: 'Swap places on the board with a player you choose.', weight: 10, trick: true },
  { id: 'gloom', title: 'Gloom puddle', text: 'Lose 5 coins.', weight: 10, trick: false },
];

export type EventId = 'double' | 'sale' | 'rush' | 'parade' | 'gloomy';

/** Room events, each equally likely, never the same one twice in a row. */
export const ROOM_EVENTS: readonly { id: EventId; title: string; text: string }[] = [
  { id: 'double', title: 'Double dice', text: 'Everyone rolls two dice.' },
  { id: 'sale', title: 'Lantern sale', text: 'Golden Lanterns cost half.' },
  { id: 'rush', title: 'Coin rush', text: 'Coin spaces pay three times as much.' },
  { id: 'parade', title: 'Stall parade', text: 'The stall hops 3 spaces forward every 10 seconds.' },
  { id: 'gloomy', title: 'Gloomy night', text: 'Puddles take double, and lucky fairs pay double.' },
];

export const FINALE_EVENT = { title: 'Last lanterns', text: 'Golden Lanterns cost 10, and the stall stays close after each one.' } as const;
