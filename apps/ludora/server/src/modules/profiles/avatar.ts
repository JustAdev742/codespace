import { inArray } from 'drizzle-orm';
import { accessoryArtSchema, glimArtSchema, victoryArtSchema, type AvatarLite } from '@ludora/shared';
import type { DbOrTx } from '../../db/client.ts';
import { equipped, items } from '../../db/schema.ts';

const AVATAR_SLOTS = ['buddy', 'hat', 'eyes', 'neck', 'victory'];

/** The player's buddy Glim and its accessories, as shown in rooms and on profiles. */
export async function loadAvatar(db: DbOrTx, userId: string): Promise<AvatarLite | null> {
  return (await loadAvatars(db, [userId])).get(userId) ?? null;
}

/** Avatars for many players in two queries, for friend lists, class rosters and leaderboards. */
export async function loadAvatars(db: DbOrTx, userIds: readonly string[]): Promise<Map<string, AvatarLite | null>> {
  const out = new Map<string, AvatarLite | null>();
  const ids = [...new Set(userIds)];
  if (!ids.length) return out;
  const slots = (await db.select().from(equipped).where(inArray(equipped.userId, ids))).filter((s) => AVATAR_SLOTS.includes(s.slot));
  const rows = slots.length ? await db.select({ id: items.id, art: items.art }).from(items).where(inArray(items.id, [...new Set(slots.map((s) => s.itemId))])) : [];
  const artOf = new Map(rows.map((r) => [r.id, r.art]));
  for (const id of ids) {
    const mine = slots.filter((s) => s.userId === id);
    const buddy = mine.find((s) => s.slot === 'buddy');
    const art = glimArtSchema.safeParse(buddy ? artOf.get(buddy.itemId) : null);
    if (!art.success) {
      out.set(id, null);
      continue;
    }
    const accessories = mine
      .filter((s) => s.slot === 'hat' || s.slot === 'eyes' || s.slot === 'neck')
      .map((s) => accessoryArtSchema.safeParse(artOf.get(s.itemId)))
      .filter((r) => r.success)
      .map((r) => r.data!);
    const victorySlot = mine.find((s) => s.slot === 'victory');
    const victory = victorySlot ? victoryArtSchema.safeParse(artOf.get(victorySlot.itemId)) : null;
    out.set(id, {
      art: art.data,
      ...(accessories.length ? { accessories } : {}),
      ...(victory?.success ? { victory: { style: victory.data.style, hue: victory.data.hue } } : {}),
    });
  }
  return out;
}
