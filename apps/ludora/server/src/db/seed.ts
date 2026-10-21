import { sql } from 'drizzle-orm';
import {
  ACHIEVEMENTS,
  ALL_ITEMS,
  COLLECTIONS,
  CURRENCIES,
  LISTINGS,
  PACKS,
  QUESTS,
  SETS,
} from '@ludora/content';
import type { Db } from './client.ts';
import {
  achievements,
  collections,
  currencies,
  economyConfig,
  featureFlags,
  items,
  packs,
  questionSets,
  quests,
  shopListings,
} from './schema.ts';
import { DEFAULT_RULES } from '../modules/economy/config.ts';

export const DEFAULT_FLAGS = [
  { key: 'social.friends', description: 'Friend lists and friend requests.', enabled: true },
  { key: 'social.reactions', description: 'Preset emote reactions in game rooms. There is no free-text chat.', enabled: true },
  { key: 'shop.rotations', description: 'Daily and weekly shop picks.', enabled: true },
  { key: 'events.frost_festival', description: 'The Frost Festival event shop and quests.', enabled: true },
  { key: 'ai.question_drafts', description: 'Draft questions with AI (needs ANTHROPIC_API_KEY). Drafts are always reviewed before saving.', enabled: false },
  { key: 'modes.beta', description: 'Show beta game modes in the mode picker.', enabled: false, roles: ['tester', 'admin', 'superadmin'] },
  { key: 'debug.overlay', description: 'Developer overlay showing room state, versions and timings.', enabled: false, roles: ['tester', 'admin', 'superadmin'] },
];

export interface SeedOptions {
  /** Overwrite catalogue rows that already exist (resets admin edits to the shipped content). */
  force?: boolean;
}

/**
 * Copy shipped content into the database. Safe to run on every start:
 * without `force` it only inserts what is missing, so admin changes stay.
 * Official question sets are always refreshed, since nobody edits them in place.
 */
export async function seedContent(db: Db, opts: SeedOptions = {}): Promise<{ inserted: Record<string, number> }> {
  const force = opts.force ?? false;
  const inserted: Record<string, number> = {};
  const count = (k: string, rows: unknown[]) => (inserted[k] = (inserted[k] ?? 0) + rows.length);

  await db.transaction(async (tx) => {
    for (const c of CURRENCIES) {
      const values = { ...c, expiresAt: c.expiresAt ? new Date(c.expiresAt) : null };
      const q = tx.insert(currencies).values(values);
      count('currencies', await (force ? q.onConflictDoUpdate({ target: currencies.code, set: values }) : q.onConflictDoNothing()).returning({ k: currencies.code }));
    }
    for (const c of COLLECTIONS) {
      const q = tx.insert(collections).values(c);
      await (force ? q.onConflictDoUpdate({ target: collections.id, set: c }) : q.onConflictDoNothing());
    }
    const itemRows = ALL_ITEMS.map((i) => ({
      id: i.id,
      type: i.type,
      name: i.name,
      description: i.description,
      rarity: i.rarity,
      collectionId: i.collectionId,
      art: i.art,
      releaseState: i.releaseState ?? 'live',
      sort: i.sort ?? 0,
    }));
    for (let i = 0; i < itemRows.length; i += 200) {
      const chunk = itemRows.slice(i, i + 200);
      const q = tx.insert(items).values(chunk);
      const done = await (force
        ? q.onConflictDoUpdate({
            target: items.id,
            set: {
              type: sql`excluded.type`,
              name: sql`excluded.name`,
              description: sql`excluded.description`,
              rarity: sql`excluded.rarity`,
              collectionId: sql`excluded.collection_id`,
              art: sql`excluded.art`,
              releaseState: sql`excluded.release_state`,
              sort: sql`excluded.sort`,
              updatedAt: sql`now()`,
            },
          })
        : q.onConflictDoNothing()
      ).returning({ id: items.id });
      inserted.items = (inserted.items ?? 0) + done.length;
    }
    for (const p of PACKS) {
      const q = tx.insert(packs).values(p);
      await (force ? q.onConflictDoUpdate({ target: packs.id, set: p }) : q.onConflictDoNothing());
    }
    for (const l of LISTINGS) {
      const values = {
        id: l.id,
        section: l.section,
        itemId: l.itemId ?? null,
        packId: l.packId ?? null,
        bundle: l.bundle ?? null,
        title: l.title ?? null,
        description: l.description ?? null,
        priceCurrency: l.priceCurrency,
        priceAmount: l.priceAmount,
        worth: l.worth ?? null,
        perUserLimit: l.perUserLimit ?? null,
        rotation: l.rotation ?? null,
        startsAt: l.startsAt ? new Date(l.startsAt) : null,
        endsAt: l.endsAt ? new Date(l.endsAt) : null,
        sort: l.sort ?? 0,
      };
      const q = tx.insert(shopListings).values(values);
      await (force ? q.onConflictDoUpdate({ target: shopListings.id, set: values }) : q.onConflictDoNothing());
    }
    for (const qd of QUESTS) {
      const values = { ...qd, weight: qd.weight ?? 1 };
      const q = tx.insert(quests).values(values);
      await (force ? q.onConflictDoUpdate({ target: quests.id, set: values }) : q.onConflictDoNothing());
    }
    for (const a of ACHIEVEMENTS) {
      const values = { ...a, secret: a.secret ?? false };
      const q = tx.insert(achievements).values(values);
      await (force ? q.onConflictDoUpdate({ target: achievements.id, set: values }) : q.onConflictDoNothing());
    }
    for (const s of SETS) {
      const values = {
        seedKey: s.seedKey,
        ownerId: null,
        title: s.title,
        description: s.description,
        subject: s.subject,
        gradeBand: s.gradeBand ?? null,
        language: 'en',
        tags: s.tags,
        visibility: 'public',
        cover: s.cover,
        questions: s.questions,
        questionCount: s.questions.length,
        isOfficial: true,
      };
      await tx
        .insert(questionSets)
        .values(values)
        .onConflictDoUpdate({
          target: questionSets.seedKey,
          set: { title: values.title, description: values.description, subject: values.subject, gradeBand: values.gradeBand, tags: values.tags, cover: values.cover, questions: values.questions, questionCount: values.questionCount, updatedAt: new Date() },
        });
    }
    inserted.sets = SETS.length;
    await tx.insert(economyConfig).values({ key: 'rules', value: DEFAULT_RULES }).onConflictDoNothing();
    for (const f of DEFAULT_FLAGS) {
      await tx
        .insert(featureFlags)
        .values({ key: f.key, description: f.description, enabled: f.enabled, roles: f.roles ?? [] })
        .onConflictDoNothing();
    }
  });
  return { inserted };
}
