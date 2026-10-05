import assert from "node:assert/strict";
import { test } from "node:test";
import { createTranslator } from "next-intl";
import english from "../messages/en.json";
import chinese from "../messages/zh-CN.json";
import {
  formatNotification,
  type NotificationTranslator,
} from "../lib/notificationMessages";
import type { Notification } from "../lib/notifications";

function translators(messages: typeof english) {
  const t = createTranslator({
    locale: "en",
    messages,
    namespace: "Notifications",
  }) as unknown as NotificationTranslator;
  const errors = createTranslator({
    locale: "en",
    messages,
    namespace: "Api",
  }) as unknown as NotificationTranslator;
  return { t, errors };
}

function failure(payload: Record<string, unknown>): Notification {
  return { id: 1, type: "ERROR", payload, isRead: false, createdAt: 0 };
}

test("a failed task names the task and the video", () => {
  const { t, errors } = translators(english);
  const message = formatNotification(
    t,
    failure({ jobKind: "VIDEO_DOWNLOAD", videoTitle: "Clip" }),
    errors,
  );
  assert.equal(message.title, "Download Failed");
  assert.equal(message.body, "Ella could not download Clip.");
});

test("a failed task states its reason unless the reason is generic", () => {
  const { t, errors } = translators(english);
  const generic = formatNotification(
    t,
    failure({
      jobKind: "VIDEO_RETAG",
      videoTitle: "Clip",
      error: { code: "operationFailed", values: {} },
    }),
    errors,
  );
  assert.equal(generic.body, "Smartag could not tag Clip.");

  const code = Object.keys(english.Api).find(
    (key) =>
      key !== "operationFailed" &&
      !english.Api[key as keyof typeof english.Api].includes("{"),
  )!;
  const specific = formatNotification(
    t,
    failure({ jobKind: "VIDEO_RETAG", videoTitle: "Clip", error: { code } }),
    errors,
  );
  assert.equal(
    specific.body,
    `Smartag could not tag Clip. ${english.Api[code as keyof typeof english.Api]}`,
  );
});

test("an error without a known task keeps the generic message", () => {
  const { t, errors } = translators(english);
  const message = formatNotification(t, failure({}), errors);
  assert.equal(message.title, english.Notifications.types.ERROR.title);
});

test("every failure has copy in both languages", () => {
  assert.deepEqual(
    Object.keys(chinese.Notifications.failures).sort(),
    Object.keys(english.Notifications.failures).sort(),
  );
});
