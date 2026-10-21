import { eq, inArray } from 'drizzle-orm';
import { accessoryArtSchema, glimArtSchema, victoryArtSchema, type AvatarLite } from '@ludora/shared';
import type { DbOrTx } from '../../db/client.ts';
import { equipped, items } from '../../db/schema.ts';

/** The player's buddy Glim and its accessories, as shown in rooms and on profiles. */
export async function loadAvatar(db: DbOrTx, userId: string): Promise<AvatarLite | null> {
  const slots = await db.select().from(equipped).where(eq(equipped.userId, userId));
  const wanted = slots.filter((s) => ['buddy', 'hat', 'eyes', 'neck', 'victory'].includes(s.slot));
  if (!wanted.length) return null;
  const rows = await db.select({ id: items.id, art: items.art }).from(items).where(inArray(items.id, wanted.map((s) => s.itemId)));
  const byId = new Map(rows.map((r) => [r.id, r.art]));
  const buddy = wanted.find((s) => s.slot === 'buddy');
  const art = glimArtSchema.safeParse(buddy ? byId.get(buddy.itemId) : null);
  if (!art.success) return null;
  const accessories = wanted
    .filter((s) => s.slot === 'hat' || s.slot === 'eyes' || s.slot === 'neck')
    .map((s) => accessoryArtSchema.safeParse(byId.get(s.itemId)))
    .filter((r) => r.success)
    .map((r) => r.data!);
  const victorySlot = wanted.find((s) => s.slot === 'victory');
  const victory = victorySlot ? victoryArtSchema.safeParse(byId.get(victorySlot.itemId)) : null;
  return {
    art: art.data,
    ...(accessories.length ? { accessories } : {}),
    ...(victory?.success ? { victory: { style: victory.data.style, hue: victory.data.hue } } : {}),
  };
}
