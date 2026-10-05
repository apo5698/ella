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

/** The task kinds a failure notice can name, see lib/jobs.ts. */
const FAILURE_KINDS = new Set([
  "TAG_APPROVAL",
  "VIDEO_RETAG",
  "VIDEO_CATALOG_SCAN",
  "VIDEO_DOWNLOAD",
]);

/**
 * The reason a task failed, from the error code it stored. Nothing for the
 * generic code, which would only repeat the title.
 */
function failureReason(
  payload: NotificationPayload,
  errors: NotificationTranslator,
) {
  const error = payload.error as
    { code?: unknown; values?: Record<string, string | number> } | undefined;
  if (typeof error?.code !== "string" || error.code === "operationFailed")
    return null;
  try {
    return errors(error.code, error.values ?? {});
  } catch {
    return null;
  }
}

export function formatNotification(
  t: NotificationTranslator,
  notification: Notification,
  errors?: NotificationTranslator,
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

  const kind = notification.payload.jobKind;
  if (
    notification.type === "ERROR" &&
    typeof kind === "string" &&
    FAILURE_KINDS.has(kind)
  ) {
    const reason = errors && failureReason(notification.payload, errors);
    const body = t(`failures.${kind}.body`, values);
    return {
      label: t("types.ERROR.label"),
      title: t(`failures.${kind}.title`),
      body: reason ? `${body} ${reason}` : body,
    };
  }

  return {
    label: t(`types.${notification.type}.label`),
    title: t(`types.${notification.type}.title`),
    body: t(`types.${notification.type}.body`, values),
  };
}
