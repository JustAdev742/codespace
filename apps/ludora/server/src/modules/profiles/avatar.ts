import { inArray } from 'drizzle-orm';
import { RARITIES, accessoryArtSchema, glimArtSchema, uniformForDress, victoryArtSchema, type AvatarLite, type Rarity } from '@ludora/shared';
import type { DbOrTx } from '../../db/client.ts';
import { equipped, items, users } from '../../db/schema.ts';
import { readPreferences } from '../users/preferences.ts';
import { housesOf, sportToday } from '../school/service.ts';

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
  const rows = slots.length ? await db.select({ id: items.id, art: items.art, rarity: items.rarity }).from(items).where(inArray(items.id, [...new Set(slots.map((s) => s.itemId))])) : [];
  // The uniform for each player's year group; the year itself never leaves their settings.
  const prefs = await db.select({ id: users.id, preferences: users.preferences }).from(users).where(inArray(users.id, ids));
  // School: a player's sport days put them in sport uniform without asking; their house goes on the lapel.
  const [sport, houseOf] = await Promise.all([sportToday(db, ids), housesOf(db, ids)]);
  const uniformOf = new Map(prefs.map((r) => {
    const dress = readPreferences(r.preferences).school;
    return [r.id, uniformForDress(sport.has(r.id) ? { ...dress, kit: 'sport' } : dress)];
  }));
  const artOf = new Map(rows.map((r) => [r.id, r.art]));
  const rarityOf = new Map(rows.map((r) => [r.id, r.rarity]));
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
    const rarity = buddy ? rarityOf.get(buddy.itemId) : undefined;
    out.set(id, {
      art: art.data,
      ...((RARITIES as readonly string[]).includes(rarity ?? '') ? { rarity: rarity as Rarity } : {}),
      ...(accessories.length ? { accessories } : {}),
      ...(victory?.success ? { victory: { style: victory.data.style, hue: victory.data.hue } } : {}),
      ...(uniformOf.get(id) ? { uniform: uniformOf.get(id)! } : {}),
      ...(houseOf.get(id) ? { house: { id: houseOf.get(id)!.id, name: houseOf.get(id)!.name, hue: houseOf.get(id)!.hue, emblem: houseOf.get(id)!.emblem } } : {}),
    });
  }
  return out;
}
