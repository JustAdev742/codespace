import { eq } from 'drizzle-orm';
import { FROST_FESTIVAL } from '@ludora/content';
import type { DbOrTx } from '../../db/client.ts';
import { economyConfig, featureFlags } from '../../db/schema.ts';

/*
 * Limited-time events. Each one is a feature flag (the on/off switch), a
 * date window stored in economy_config, an event currency that expires
 * with it, a shop section and a set of event quests.
 */

export interface EventDef {
  key: string;
  name: string;
  flag: string;
  currency: string;
  section: 'event';
  /** Quests with this kind are handed out each week while the event runs. */
  questKind: 'event';
  defaults: { startsAt: string; endsAt: string };
}

export const EVENTS: readonly EventDef[] = [
  { key: 'frost_festival', name: 'Frost Festival', flag: 'events.frost_festival', currency: 'frost_tickets', section: 'event', questKind: 'event', defaults: FROST_FESTIVAL },
];

const configKey = (key: string) => `event:${key}`;

export interface EventWindow {
  startsAt: Date;
  endsAt: Date;
}

export async function eventWindow(db: DbOrTx, ev: EventDef): Promise<EventWindow> {
  const [row] = await db.select().from(economyConfig).where(eq(economyConfig.key, configKey(ev.key))).limit(1);
  const v = (row?.value ?? {}) as Partial<{ startsAt: string; endsAt: string }>;
  return { startsAt: new Date(v.startsAt ?? ev.defaults.startsAt), endsAt: new Date(v.endsAt ?? ev.defaults.endsAt) };
}

export async function saveEventWindow(db: DbOrTx, ev: EventDef, w: EventWindow, userId: string | null): Promise<void> {
  const value = { startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString() };
  await db
    .insert(economyConfig)
    .values({ key: configKey(ev.key), value, updatedBy: userId })
    .onConflictDoUpdate({ target: economyConfig.key, set: { value, updatedAt: new Date(), updatedBy: userId } });
}

/** An event is running when its flag is switched on for everyone and today is inside its window. */
export async function runningEvents(db: DbOrTx, now = new Date()): Promise<EventDef[]> {
  const out: EventDef[] = [];
  for (const ev of EVENTS) {
    const [flag] = await db.select({ enabled: featureFlags.enabled }).from(featureFlags).where(eq(featureFlags.key, ev.flag)).limit(1);
    if (!flag?.enabled) continue;
    const w = await eventWindow(db, ev);
    if (w.startsAt <= now && now <= w.endsAt) out.push(ev);
  }
  return out;
}
