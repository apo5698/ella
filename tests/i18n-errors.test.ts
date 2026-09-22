import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator } from "next-intl";
import en from "../messages/en.json";
import zh from "../messages/zh-CN.json";
import { AppError, errorDetails, errorMessage } from "../lib/appError";

test("serialized errors can be rendered in either interface language", () => {
  const error = new AppError("modelRequestFailed", { status: 503 });
  const details = JSON.parse(JSON.stringify(errorDetails(error)));
  for (const [locale, messages] of [
    ["en", en],
    ["zh-CN", zh],
  ] as const) {
    const t = createTranslator({ locale, messages, namespace: "Api" });
    assert.equal(t(details.code, details.values), errorMessage(error, t));
    assert.match(errorMessage(error, t), /503/);
  }
});

test("unexpected errors use a localized fallback without exposing internals", () => {
  const error = new Error("Internal diagnostic details");
  for (const [locale, messages] of [
    ["en", en],
    ["zh-CN", zh],
  ] as const) {
    const t = createTranslator({ locale, messages, namespace: "Api" });
    assert.equal(errorMessage(error, t), t("operationFailed"));
    const details = errorDetails(error);
    assert.equal(t(details.code, details.values), t("operationFailed"));
  }
});
