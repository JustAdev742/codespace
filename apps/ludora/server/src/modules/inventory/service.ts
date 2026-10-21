import { and, eq, sql } from 'drizzle-orm';
import { ITEM_TYPE_INFO, type EquipSlot, type ItemType } from '@ludora/shared';
import type { DbOrTx } from '../../db/client.ts';
import { equipped, inventory, items } from '../../db/schema.ts';
import { AppError, notFound } from '../../lib/errors.ts';

/** Add items to a player's inventory. Returns the new quantity. */
export async function grantItem(tx: DbOrTx, g: { userId: string; itemId: string; quantity?: number; source: string }): Promise<number> {
  const qty = g.quantity ?? 1;
  if (!Number.isInteger(qty) || qty < 1) throw new Error('grant quantity must be a positive integer');
  const rows = await tx
    .insert(inventory)
    .values({ userId: g.userId, itemId: g.itemId, quantity: qty, source: g.source })
    .onConflictDoUpdate({
      target: [inventory.userId, inventory.itemId],
      set: { quantity: sql`${inventory.quantity} + ${qty}`, lastAcquiredAt: new Date() },
    })
    .returning({ quantity: inventory.quantity });
  return rows[0]!.quantity;
}

export async function ownedQuantity(tx: DbOrTx, userId: string, itemId: string, lock = false): Promise<number> {
  const q = tx
    .select({ quantity: inventory.quantity })
    .from(inventory)
    .where(and(eq(inventory.userId, userId), eq(inventory.itemId, itemId)));
  const rows = await (lock ? q.for('update') : q);
  return rows[0]?.quantity ?? 0;
}

/** Remove items (recycling). Throws if the player does not have enough. */
export async function takeItem(tx: DbOrTx, userId: string, itemId: string, quantity: number): Promise<number> {
  const have = await ownedQuantity(tx, userId, itemId, true);
  if (have < quantity) throw new AppError(409, 'conflict', 'You do not have enough of that item.');
  const rows = await tx
    .update(inventory)
    .set({ quantity: sql`${inventory.quantity} - ${quantity}` })
    .where(and(eq(inventory.userId, userId), eq(inventory.itemId, itemId)))
    .returning({ quantity: inventory.quantity });
  return rows[0]!.quantity;
}

/** The equip slot an item type uses; accessories use their own slot (hat, eyes, neck). */
export function slotFor(type: ItemType, art: unknown): EquipSlot | null {
  if (type === 'accessory') {
    const slot = (art as { slot?: string })?.slot;
    return slot === 'hat' || slot === 'eyes' || slot === 'neck' ? slot : null;
  }
  return (ITEM_TYPE_INFO[type]?.equipSlot as EquipSlot | null) ?? null;
}

export async function equipItem(tx: DbOrTx, userId: string, itemId: string): Promise<EquipSlot> {
  const rows = await tx.select().from(items).where(eq(items.id, itemId)).limit(1);
  const item = rows[0];
  if (!item) throw notFound('That item does not exist.');
  const slot = slotFor(item.type as ItemType, item.art);
  if (!slot) throw new AppError(400, 'bad_request', 'That item cannot be equipped.');
  if ((await ownedQuantity(tx, userId, itemId)) < 1) throw new AppError(403, 'forbidden', 'You do not own that item.');
  await tx.insert(equipped).values({ userId, slot, itemId }).onConflictDoUpdate({ target: [equipped.userId, equipped.slot], set: { itemId } });
  return slot;
}

export async function unequipSlot(tx: DbOrTx, userId: string, slot: EquipSlot): Promise<void> {
  await tx.delete(equipped).where(and(eq(equipped.userId, userId), eq(equipped.slot, slot)));
}
