import { createTranslator } from "next-intl";
import english from "@/messages/en.json";

type ErrorCode = keyof typeof english.Api;
type ErrorValues = Record<string, string | number>;
type Translate = (key: ErrorCode, values?: ErrorValues) => string;
const englishError = createTranslator({
  locale: "en",
  messages: english,
  namespace: "Api",
});

/** A stable error code with an English message for logs and non-UI consumers. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly values: ErrorValues = {},
    options?: ErrorOptions,
  ) {
    super(englishError(code, values), options);
    this.name = "AppError";
  }
}

export function errorMessage(error: unknown, t: Translate): string {
  if (error instanceof AppError) return t(error.code, error.values);
  return t("operationFailed");
}

export type ErrorDetails = Pick<AppError, "code" | "values">;

export function errorDetails(error: unknown): ErrorDetails {
  return error instanceof AppError
    ? { code: error.code, values: error.values }
    : { code: "operationFailed", values: {} };
}
