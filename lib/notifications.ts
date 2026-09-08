import type Database from "better-sqlite3";

/** Stable keys that select a localized message, icon, and color. */
export const NOTIFICATION_TYPES = [
  "TAG_APPROVAL",
  "VIDEO_RETAG",
  "VIDEO_CATALOG_SCAN",
  "WARNING",
  "ERROR",
  "MENTIONED",
  "PASSWORD_EXPIRING",
  "NEW_LOGIN_DETECTED",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationPayload = Record<string, unknown>;

export type Notification = {
  id: number;
  type: NotificationType;
  payload: NotificationPayload;
  isRead: boolean;
  createdAt: number;
};

export const NOTIFICATION_LIST_LIMIT = 50;

type NotificationRow = {
  id: number;
  type: NotificationType;
  payload: string;
  isRead: 0 | 1;
  createdAt: number;
};

const COLUMNS = `id, type, payload, is_read AS isRead, created_at AS createdAt`;

function parsePayload(value: string): NotificationPayload {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as NotificationPayload)
      : {};
  } catch {
    return {};
  }
}

function toNotification(row: NotificationRow): Notification {
  return {
    ...row,
    payload: parsePayload(row.payload),
    isRead: row.isRead === 1,
  };
}

export function listNotifications(
  db: Database.Database,
  limit = NOTIFICATION_LIST_LIMIT,
): Notification[] {
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM notifications ORDER BY id DESC LIMIT ?`)
    .all(limit) as NotificationRow[];
  return rows.map(toNotification);
}

export function getNotification(
  db: Database.Database,
  id: number,
): Notification | undefined {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM notifications WHERE id = ?`)
    .get(id) as NotificationRow | undefined;
  return row && toNotification(row);
}

export function notificationCount(db: Database.Database): number {
  return (
    db.prepare("SELECT COUNT(*) AS c FROM notifications").get() as {
      c: number;
    }
  ).c;
}

export function unreadNotificationCount(db: Database.Database): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS c FROM notifications WHERE is_read = FALSE")
      .get() as { c: number }
  ).c;
}

export function createNotification(
  db: Database.Database,
  notification: {
    type: NotificationType;
    payload?: NotificationPayload;
  },
): number {
  const info = db
    .prepare(
      `INSERT INTO notifications (type, payload, is_read, created_at)
       VALUES (?, ?, FALSE, ?)`,
    )
    .run(
      notification.type,
      JSON.stringify(notification.payload ?? {}),
      Date.now(),
    );
  return Number(info.lastInsertRowid);
}

export function markAllNotificationsRead(db: Database.Database): number {
  return db
    .prepare("UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE")
    .run().changes;
}

export function markNotificationRead(
  db: Database.Database,
  id: number,
): boolean {
  return (
    db
      .prepare(
        "UPDATE notifications SET is_read = TRUE WHERE id = ? AND is_read = FALSE",
      )
      .run(id).changes > 0
  );
}

type Listener = () => void;

const g = globalThis as unknown as {
  __notificationListeners?: Set<Listener>;
};
if (!g.__notificationListeners) g.__notificationListeners = new Set();
const listeners = g.__notificationListeners;

export function subscribeNotifications(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyNotificationsChanged() {
  for (const listener of listeners) listener();
}
