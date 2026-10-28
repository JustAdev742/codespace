import { describe, expect, it } from 'vitest';
import { ACCESSORY_SHAPES, RARITIES, dropTableSchema, itemArtSchema, lanternArtSchema } from '@ludora/shared';
import { COSMETICS } from '../src/cosmetics.ts';
import { GLIMS } from '../src/glims.ts';
import { ALL_ITEMS, LISTINGS, PACKS } from '../src/index.ts';
import { MONTHLY, MONTHLY_GLIMS, MONTHLY_PREFIX, currentDrop, monthWindow } from '../src/monthly.ts';
import { sydneyDate } from '../src/seasons.ts';

/* The monthly drops: seven Glims and one accessory a month, on sale for that month only, in Sydney time. */

const duplicates = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
const canonical = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

describe('monthly drops', () => {
  it('run month after month with no gaps, from Sydney midnight on the 1st to the last second of the month', () => {
    for (let i = 0; i < MONTHLY.length; i++) {
      const d = MONTHLY[i]!;
      const start = new Date(d.window.startsAt);
      const end = new Date(d.window.endsAt);
      const [y, m] = d.month.split('-').map(Number);
      expect(sydneyDate(start), d.month).toEqual({ y, m, d: 1 });
      expect(sydneyDate(new Date(start.getTime() - 1)).m, d.month).not.toBe(m);
      expect(sydneyDate(end).m, d.month).toBe(m);
      expect(sydneyDate(new Date(end.getTime() + 1000)), d.month).toMatchObject({ d: 1 });
      if (i > 0) expect(start.getTime() - Date.parse(MONTHLY[i - 1]!.window.endsAt), d.month).toBe(1000);
    }
    // October starts in standard time and ends in daylight saving: midnight is 14:00 UTC, then 13:00 UTC.
    expect(monthWindow('2026-10')).toEqual({ startsAt: '2026-09-30T14:00:00.000Z', endsAt: '2026-10-31T12:59:59.000Z' });
  });

  it('know which drop is on sale', () => {
    expect(currentDrop(new Date('2026-10-28T02:00:00Z'))?.month).toBe('2026-10');
    expect(currentDrop(new Date('2026-10-31T13:00:00Z'))?.month).toBe('2026-11');
    expect(currentDrop(new Date('2020-01-01T00:00:00Z'))).toBeNull();
  });

  it('each have seven Glims: 2 common, 2 uncommon, 1 rare, 1 epic and 1 legendary, numbered 1 to 7', () => {
    for (const d of MONTHLY) {
      const mix = Object.fromEntries(RARITIES.map((r) => [r, d.glims.filter((g) => g.rarity === r).length]));
      expect(mix, d.month).toEqual({ common: 2, uncommon: 2, rare: 1, epic: 1, legendary: 1, mythic: 0 });
      expect(d.glims.map((g) => g.sort)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(d.glims.every((g) => g.collectionId === d.collection.id)).toBe(true);
      expect(d.collection.id.startsWith(MONTHLY_PREFIX)).toBe(true);
    }
  });

  it('give every Glim valid art that no other Glim, monthly or permanent, shares', () => {
    const seen = new Map<string, string>();
    for (const g of [...GLIMS, ...MONTHLY_GLIMS]) {
      const parsed = itemArtSchema.safeParse(g.art);
      expect(parsed.success, `${g.id}: ${parsed.error?.message}`).toBe(true);
      expect(parsed.data, g.id).toEqual(g.art);
      const key = canonical(parsed.data);
      expect(seen.get(key), `${g.id} has the same art as ${seen.get(key)}`).toBeUndefined();
      seen.set(key, g.id);
    }
  });

  it('give every rare-or-better monthly Glim both a pattern and a topper', () => {
    for (const g of MONTHLY_GLIMS) {
      if (g.art.kind !== 'glim' || RARITIES.indexOf(g.rarity) < RARITIES.indexOf('rare')) continue;
      expect(g.art.pattern, g.id).not.toBe('none');
      expect(g.art.topper, g.id).not.toBe('none');
    }
  });

  it('name Glims uniquely across the whole catalogue, in one or two words of at most 16 characters', () => {
    for (const g of MONTHLY_GLIMS) {
      expect(g.name.length, g.id).toBeLessThanOrEqual(16);
      expect(g.name.split(' ').length, g.id).toBeLessThanOrEqual(2);
      expect(g.description.length, g.id).toBeLessThanOrEqual(120);
    }
    expect(duplicates([...GLIMS, ...MONTHLY_GLIMS].map((g) => g.name.toLowerCase()))).toEqual([]);
  });

  it('use ids unique across every item, and accessories with a real shape and a unique name', () => {
    expect(duplicates(ALL_ITEMS.map((i) => i.id))).toEqual([]);
    for (const d of MONTHLY) {
      const a = d.accessory;
      expect(itemArtSchema.safeParse(a.art).success, a.id).toBe(true);
      if (a.art.kind !== 'accessory') throw new Error(a.id);
      expect(ACCESSORY_SHAPES[a.art.slot] as readonly string[], a.id).toContain(a.art.shape);
      expect(a.description.length, a.id).toBeLessThanOrEqual(100);
      expect(a.collectionId).toBeNull();
    }
    expect(duplicates([...COSMETICS, ...MONTHLY.map((d) => d.accessory)].map((i) => `${i.type}:${i.name.toLowerCase()}`))).toEqual([]);
  });

  it('sell the Lantern and the accessory only inside the month', () => {
    for (const d of MONTHLY) {
      expect(lanternArtSchema.safeParse(d.pack.art).success).toBe(true);
      expect(dropTableSchema.safeParse(d.pack.dropTable).success).toBe(true);
      expect(d.pack.dropTable.collectionIds).toEqual([d.collection.id]);
      expect({ from: d.pack.availableFrom, until: d.pack.availableUntil }).toEqual({ from: d.window.startsAt, until: d.window.endsAt });
      const listings = LISTINGS.filter((l) => l.packId === d.pack.id || l.itemId === d.accessory.id);
      expect(listings.map((l) => l.section).sort()).toEqual(['featured', 'monthly', 'monthly']);
      for (const l of listings) expect({ s: l.startsAt, e: l.endsAt }, l.id).toEqual({ s: d.window.startsAt, e: d.window.endsAt });
    }
  });

  it('keep monthly Glims out of the daily picks and every other Lantern', () => {
    const monthly = new Set(MONTHLY_GLIMS.map((g) => g.id));
    expect(LISTINGS.filter((l) => l.itemId && monthly.has(l.itemId))).toEqual([]);
    for (const p of PACKS.filter((p) => !p.id.startsWith(`lantern-${MONTHLY_PREFIX}`))) {
      expect(p.dropTable.collectionIds.some((c) => c.startsWith(MONTHLY_PREFIX)), p.id).toBe(false);
      expect(p.dropTable.itemIds.some((i) => monthly.has(i)), p.id).toBe(false);
    }
  });
});
