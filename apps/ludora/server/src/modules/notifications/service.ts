import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { assignments, classMembers, classes, gameParticipants, gameSessions, notifications } from '../../db/schema.ts';

/*
 * Notifications: things that happened while a player was elsewhere. Friend
 * requests, invites and rewards are written when they happen; work due is
 * worked out each time the list is read, from the player's classes, so it is
 * never out of date. Only the player can read their own.
 */

export const NOTIFICATION_KINDS = ['friend_request', 'friend_accepted', 'invite', 'achievement', 'level', 'collection', 'due'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** How long notifications are kept. */
const KEEP_DAYS = 60;
/** Assignments due within this many hours, not yet played, show as work due. */
const DUE_SOON_HOURS = 72;

export interface NewNotification {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string | null;
  actorId?: string | null;
  /** The same key for the same player never notifies twice. */
  dedupeKey?: string;
}

export async function notify(tx: DbOrTx, n: NewNotification): Promise<void> {
  await tx
    .insert(notifications)
    .values({ userId: n.userId, kind: n.kind, title: n.title.slice(0, 120), body: (n.body ?? '').slice(0, 300), link: n.link ?? null, actorId: n.actorId ?? null, dedupeKey: n.dedupeKey ?? null })
    .onConflictDoNothing();
}

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

/** Assignments due soon that the player has not played yet, as notifications that read themselves when played. */
export async function workDue(db: DbOrTx, userId: string, now = new Date()): Promise<NotificationView[]> {
  const soon = new Date(now.getTime() + DUE_SOON_HOURS * 3600_000);
  const rows = await db
    .select({ id: assignments.id, title: assignments.title, dueAt: assignments.dueAt, className: classes.name, classId: classes.id })
    .from(assignments)
    .innerJoin(classes, eq(classes.id, assignments.classId))
    .innerJoin(classMembers, and(eq(classMembers.classId, classes.id), eq(classMembers.userId, userId)))
    .where(and(isNull(classes.archivedAt), sql`${assignments.dueAt} is not null`, sql`${assignments.dueAt} > ${now.toISOString()}`, sql`${assignments.dueAt} <= ${soon.toISOString()}`))
    .orderBy(assignments.dueAt)
    .limit(10);
  if (!rows.length) return [];
  const played = await db
    .selectDistinct({ id: gameSessions.assignmentId })
    .from(gameParticipants)
    .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
    .where(and(eq(gameParticipants.userId, userId), inArray(gameSessions.assignmentId, rows.map((r) => r.id))));
  const done = new Set(played.map((p) => p.id));
  return rows
    .filter((r) => !done.has(r.id))
    .map((r) => ({ id: `due:${r.id}`, kind: 'due' as const, title: `Due soon: ${r.title}`, body: r.className, link: `/classes/${r.classId}`, createdAt: r.dueAt!.toISOString(), read: false }));
}

export async function listNotifications(db: DbOrTx, userId: string, opts: { before?: number; limit: number }) {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000);
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.createdAt} > ${cutoff.toISOString()}`, opts.before ? lt(notifications.id, opts.before) : sql`true`))
    .orderBy(desc(notifications.id))
    .limit(opts.limit + 1);
  const more = rows.length > opts.limit;
  const page = rows.slice(0, opts.limit).map(
    (r): NotificationView => ({ id: String(r.id), kind: r.kind as NotificationKind, title: r.title, body: r.body, link: r.link, createdAt: r.createdAt.toISOString(), read: Boolean(r.readAt) }),
  );
  return { items: page, nextBefore: more ? rows[opts.limit - 1]!.id : null };
}

export async function unreadCount(db: DbOrTx, userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), sql`${notifications.createdAt} > ${cutoff.toISOString()}`));
  return row?.n ?? 0;
}
