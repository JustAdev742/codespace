import { and, eq, or } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { blocks, friendships } from '../../db/schema.ts';

export const MAX_FRIENDS = 200;

export function pairOf(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function blockedEitherWay(db: DbOrTx, a: string, b: string): Promise<{ byMe: boolean; byThem: boolean }> {
  const rows = await db
    .select({ blocker: blocks.blockerId })
    .from(blocks)
    .where(or(and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)), and(eq(blocks.blockerId, b), eq(blocks.blockedId, a))));
  return { byMe: rows.some((r) => r.blocker === a), byThem: rows.some((r) => r.blocker === b) };
}

export async function areFriends(db: DbOrTx, a: string, b: string): Promise<boolean> {
  const [x, y] = pairOf(a, b);
  const rows = await db.select({ s: friendships.status }).from(friendships).where(and(eq(friendships.userA, x), eq(friendships.userB, y))).limit(1);
  return rows[0]?.s === 'accepted';
}
