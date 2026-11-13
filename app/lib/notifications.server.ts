import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { alias } from "drizzle-orm/sqlite-core";
import * as schema from "~/db/schema";
import { notifications, users, NotificationType, UserRole } from "~/db/schema";
import type { Email } from "~/lib/mailer.server";

// ─── Notifications ───
// Everything about Notifications: recording what happened, the Notification
// Menu's rows, read state and the bell count. See GLOSSARY.md for the
// language.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention). Recording returns the
// emails to send rather than sending them.

export type Db = BetterSQLite3Database<typeof schema>;

type StoredNotification = typeof notifications.$inferSelect;

// ─── Recording what happened ───

/** What happened, with the acting user and the subject it is about. */
export type NotificationEvent = {
  type: NotificationType.RoleChanged;
  actorId: number;
  userId: number;
  newRole: UserRole;
};

type Delivery = { recipientId: number; subjectId: number; detail: string | null };

function deliveriesFor(event: NotificationEvent): Delivery[] {
  switch (event.type) {
    case NotificationType.RoleChanged:
      return [
        { recipientId: event.userId, subjectId: event.userId, detail: event.newRole },
      ];
  }
}

/**
 * Records one In-app Notification per recipient. The acting user never gets a
 * Notification about their own action.
 */
export function recordNotification(
  db: Db,
  event: NotificationEvent,
  now: Date
): Email[] {
  const deliveries = deliveriesFor(event).filter(
    (delivery) => delivery.recipientId !== event.actorId
  );

  if (deliveries.length > 0) {
    db.insert(notifications)
      .values(
        deliveries.map((delivery) => ({
          type: event.type,
          actorId: event.actorId,
          ...delivery,
          createdAt: now.toISOString(),
        }))
      )
      .run();
  }

  return [];
}

// ─── Reading ───

export type SentencePart = { text: string; bold?: boolean };

export type NotificationRow = {
  id: number;
  type: NotificationType;
  actor: { name: string; avatarUrl: string | null };
  sentence: SentencePart[];
  isRead: boolean;
  createdAt: string;
  href: string;
};

const ROLE_NAMES: Record<UserRole, string> = {
  [UserRole.Student]: "Student",
  [UserRole.Instructor]: "Instructor",
  [UserRole.Admin]: "Platform Admin",
};

function isUserRole(value: string | null): value is UserRole {
  return Object.values<string | null>(UserRole).includes(value);
}

/** The sentence and click target for one Notification. */
function present(
  notification: StoredNotification,
  actorName: string
): Pick<NotificationRow, "sentence" | "href"> {
  switch (notification.type) {
    case NotificationType.RoleChanged: {
      const { detail } = notification;
      return {
        sentence: [
          { text: `${actorName} changed your role to ` },
          { text: isUserRole(detail) ? ROLE_NAMES[detail] : "a new role", bold: true },
        ],
        href: "/dashboard",
      };
    }
    default:
      throw new Error(`No way to show a ${notification.type} Notification yet.`);
  }
}

const actors = alias(users, "actors");

function selectNotifications(db: Db) {
  return db
    .select({
      notification: notifications,
      actorName: actors.name,
      actorAvatarUrl: actors.avatarUrl,
    })
    .from(notifications)
    .innerJoin(actors, eq(notifications.actorId, actors.id));
}

type SelectedNotification = ReturnType<
  ReturnType<typeof selectNotifications>["all"]
>[number];

function toRow({
  notification,
  actorName,
  actorAvatarUrl,
}: SelectedNotification): NotificationRow {
  return {
    id: notification.id,
    type: notification.type,
    actor: { name: actorName, avatarUrl: actorAvatarUrl },
    ...present(notification, actorName),
    isRead: notification.readAt !== null,
    createdAt: notification.createdAt,
  };
}

const MENU_SIZE = 8;

/** The newest Notifications for the Notification Menu. */
export function listNotificationMenu(db: Db, userId: number): NotificationRow[] {
  return selectNotifications(db)
    .where(eq(notifications.recipientId, userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(MENU_SIZE)
    .all()
    .map(toRow);
}

// ─── Read state ───

/**
 * Marks one of the user's Notifications read and returns the page it is
 * about, or null if the user has no such Notification.
 */
export function openNotification(
  db: Db,
  userId: number,
  notificationId: number,
  now: Date
): string | null {
  const selected = selectNotifications(db)
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientId, userId)
      )
    )
    .get();

  if (!selected) return null;

  db.update(notifications)
    .set({ readAt: now.toISOString() })
    .where(and(eq(notifications.id, notificationId), isNull(notifications.readAt)))
    .run();

  return toRow(selected).href;
}

/** Marks every one of the user's unread Notifications read. */
export function markAllNotificationsRead(db: Db, userId: number, now: Date) {
  db.update(notifications)
    .set({ readAt: now.toISOString() })
    .where(
      and(eq(notifications.recipientId, userId), isNull(notifications.readAt))
    )
    .run();
}

// ─── The bell ───

/**
 * How many unread Notifications arrived since the user last opened the
 * Notification Menu or Notification Feed.
 */
export function getBellCount(db: Db, userId: number): number {
  const user = db
    .select({ openedAt: users.notificationsOpenedAt })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!user) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, userId),
        isNull(notifications.readAt),
        user.openedAt ? gt(notifications.createdAt, user.openedAt) : undefined
      )
    )
    .get();

  return result?.count ?? 0;
}

/** Resets the bell count to 0. Nothing is marked read. */
export function markNotificationsOpened(db: Db, userId: number, now: Date) {
  db.update(users)
    .set({ notificationsOpenedAt: now.toISOString() })
    .where(eq(users.id, userId))
    .run();
}
