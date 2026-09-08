import type { Notification, NotificationPayload } from "./notifications";

export type NotificationTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function text(values: NotificationPayload, key: string, fallback: string) {
  return typeof values[key] === "string" ? values[key] : fallback;
}

function number(values: NotificationPayload, key: string, fallback = 0) {
  return typeof values[key] === "number" ? values[key] : fallback;
}

export function formatNotification(
  t: NotificationTranslator,
  notification: Notification,
) {
  const values = {
    tagName: text(notification.payload, "tagName", t("fallbackTag")),
    videoTitle: text(notification.payload, "videoTitle", t("fallbackVideo")),
    count: number(notification.payload, "count"),
    tagCount: number(notification.payload, "tagCount"),
    added: number(notification.payload, "added"),
    updated: number(notification.payload, "updated"),
    skipped: number(notification.payload, "skipped"),
    removed: number(notification.payload, "removed"),
  };

  return {
    label: t(`types.${notification.type}.label`),
    title: t(`types.${notification.type}.title`),
    body: t(`types.${notification.type}.body`, values),
  };
}
