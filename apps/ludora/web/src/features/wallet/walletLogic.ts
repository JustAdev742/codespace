/*
 * The Wallet's words and sums (D58), kept apart from the page so they can be tested: where a
 * Spark came from in a nine-year-old's words, today's game Sparks against the limit, and how
 * far a saving goal has come. Nothing here compares a player with anyone else.
 */

/** Where Sparks came from or went, in words a 9-year-old can follow. */
export const WALLET_REASON: Record<string, string> = {
  welcome: 'Welcome to Ludora',
  game_reward: 'Playing a game',
  purchase: 'Bought in the shop',
  pack_open: 'Opened a Lantern',
  quest_reward: 'Finished a quest',
  achievement_reward: 'Earned an achievement',
  level_reward: 'Reached a new level',
  streak_reward: 'Played again the next day',
  collection_reward: 'Finished a collection',
  recycle: 'Swapped spare Glims for Dust',
  craft: 'Made a Glim with Dust',
  admin_grant: 'Added by Ludora',
  admin_revoke: 'Taken away by Ludora',
  refund: 'Money back from Ludora',
  class_reward: 'A reward from your teacher',
  test_reset: 'Test account reset',
  event_expire: 'Event tickets ran out',
};

export const walletReason = (r: string) => WALLET_REASON[r] ?? 'Something else';

/** Today's game Sparks against the daily limit, as a sentence and a share. */
export function todayLine(earned: number, cap: number): { text: string; share: number; reached: boolean } {
  if (cap <= 0) return { text: 'Games do not pay Sparks right now.', share: 0, reached: false };
  const left = Math.max(0, cap - earned);
  const reached = left === 0;
  return {
    text: reached ? `You have earned all ${cap} game Sparks for today. Quests and XP still count, and it starts again tomorrow.` : `You have earned ${earned} of today's ${cap} game Sparks. ${left} more to go today.`,
    share: Math.min(1, earned / cap),
    reached,
  };
}

/** How far a saving goal has come, and a calm sentence about it. */
export function goalLine(have: number, price: number, currencyName: string): { text: string; share: number; ready: boolean } {
  if (price <= 0) return { text: 'This one is free.', share: 1, ready: true };
  const ready = have >= price;
  const left = Math.max(0, price - have);
  return {
    text: ready ? `You have enough ${currencyName} for this.` : `${left} more ${currencyName} to go.`,
    share: Math.min(1, have / price),
    ready,
  };
}

/** This week's earning compared with last week's, as one plain sentence. */
export function weekLine(thisWeek: number, lastWeek: number): string {
  if (thisWeek === 0 && lastWeek === 0) return 'No Sparks earned this week or last week yet.';
  if (lastWeek === 0) return `You have earned ${thisWeek} Sparks so far this week.`;
  return `You have earned ${thisWeek} Sparks so far this week. Last week you earned ${lastWeek}.`;
}
