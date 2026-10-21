import type { Rarity, ShopSection } from '@ludora/shared';
import type { SeedItem, SeedListing, SeedPack } from './types.ts';

export const GLIM_PRICES: Record<Rarity, number> = { common: 60, uncommon: 120, rare: 260, epic: 520, legendary: 1400, mythic: 4000 };
const COSMETIC_SPARKS: Partial<Record<Rarity, number>> = { common: 80, uncommon: 160, rare: 320 };
const COSMETIC_MOONSTONES: Partial<Record<Rarity, number>> = { epic: 25, legendary: 60 };

/** The Frost Festival window. Admins can move it from the staff panel. */
export const FROST_FESTIVAL = { startsAt: '2026-10-01T00:00:00Z', endsAt: '2027-01-31T23:59:59Z' };

function sectionFor(item: SeedItem): ShopSection {
  switch (item.type) {
    case 'accessory':
      return 'accessories';
    case 'frame':
    case 'banner':
    case 'title':
      return 'profile';
    default:
      return 'effects';
  }
}

function cosmeticPrice(item: SeedItem): { priceCurrency: string; priceAmount: number } {
  const sparks = COSMETIC_SPARKS[item.rarity];
  if (sparks) return { priceCurrency: 'sparks', priceAmount: sparks };
  return { priceCurrency: 'moonstones', priceAmount: COSMETIC_MOONSTONES[item.rarity] ?? 60 };
}

export function buildListings(glims: readonly SeedItem[], cosmetics: readonly SeedItem[], packs: readonly SeedPack[]): SeedListing[] {
  const live = (i: SeedItem) => (i.releaseState ?? 'live') === 'live';
  const listings: SeedListing[] = [];

  for (const p of packs) listings.push({ id: `l-${p.id}`, section: 'lanterns', packId: p.id, priceCurrency: p.priceCurrency, priceAmount: p.priceAmount, sort: p.sort });

  // Daily picks: six Glims a day are drawn from this pool. Mythics only ever come from Lanterns or crafting.
  for (const g of glims.filter((g) => live(g) && g.rarity !== 'mythic')) {
    listings.push({ id: `l-daily-${g.id}`, section: 'daily', itemId: g.id, priceCurrency: 'sparks', priceAmount: GLIM_PRICES[g.rarity], rotation: 'daily', perUserLimit: 1 });
  }

  const regular = cosmetics.filter((c) => live(c) && !c.id.startsWith('frost-'));
  for (const c of regular) {
    const price = cosmeticPrice(c);
    listings.push({ id: `l-${c.id}`, section: sectionFor(c), itemId: c.id, ...price, perUserLimit: 1, sort: c.sort ?? 0 });
    // Weekly picks: four cosmetics a week at a quarter off, drawn from this pool.
    if (price.priceCurrency === 'sparks') {
      listings.push({ id: `l-weekly-${c.id}`, section: 'weekly', itemId: c.id, priceCurrency: 'sparks', priceAmount: Math.round((price.priceAmount * 0.75) / 5) * 5, rotation: 'weekly', perUserLimit: 1 });
    }
  }

  const has = (id: string) => regular.some((c) => c.id === id);
  const bundle = (id: string, title: string, description: string, ids: string[], priceAmount: number, section: ShopSection = 'bundles') => {
    const present = ids.filter(has);
    if (present.length < 2) return;
    const worth = present.reduce((n, i) => n + cosmeticPrice(regular.find((c) => c.id === i)!).priceAmount, 0);
    listings.push({ id, section, bundle: present, title, description, priceCurrency: 'sparks', priceAmount: Math.min(priceAmount, Math.round(worth * 0.7)), worth, perUserLimit: 1 });
  };
  bundle('b-scholar', "Scholar's Kit", 'A mortarboard, round glasses and a title to match.', ['acc-mortarboard', 'acc-round-glasses', 'title-bookworm'], 400);
  bundle('b-stargazer', 'Stargazer Set', 'A constellation banner, star frame and star shades.', ['banner-constellation', 'frame-stars', 'acc-star-shades'], 450);
  bundle('b-party', 'Party Pack', 'A party hat, confetti victory and the party emote.', ['acc-party-hat', 'victory-confetti', 'emote-party'], 350, 'featured');

  // Featured: the newest Lantern plus whatever bundle is in the featured section.
  const featuredPack = packs.find((p) => p.id === 'lantern-starfall') ?? packs[0];
  if (featuredPack) listings.push({ id: `l-featured-${featuredPack.id}`, section: 'featured', packId: featuredPack.id, priceCurrency: featuredPack.priceCurrency, priceAmount: featuredPack.priceAmount, sort: 1 });

  for (const c of cosmetics.filter((c) => live(c) && c.id.startsWith('frost-'))) {
    listings.push({ id: `l-${c.id}`, section: 'event', itemId: c.id, priceCurrency: 'frost_tickets', priceAmount: c.rarity === 'common' ? 30 : c.rarity === 'uncommon' ? 50 : 80, perUserLimit: 1, startsAt: FROST_FESTIVAL.startsAt, endsAt: FROST_FESTIVAL.endsAt });
  }
  return listings;
}
