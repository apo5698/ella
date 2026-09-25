import { z } from "zod";
import { createTranslator } from "next-intl";
import english from "@/messages/en.json";

export const HTTP_SOURCE_DEFAULT_PASSWORD = "example-password";

type Translate = (key: keyof typeof english.Api) => string;
const defaultTranslate = createTranslator({
  locale: "en",
  messages: english,
  namespace: "Api",
});

export function createHttpSourceDownloadSchema(
  t: Translate = defaultTranslate,
) {
  return z.object({
    name: z.string().trim().min(1, t("downloadNameRequired")),
    url: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        if (!value) {
          ctx.addIssue({ code: "custom", message: t("downloadUrlRequired") });
          return;
        }
        if (!URL.canParse(value)) {
          ctx.addIssue({ code: "custom", message: t("downloadUrlInvalid") });
          return;
        }
        const protocol = new URL(value).protocol;
        if (protocol !== "http:" && protocol !== "https:") {
          ctx.addIssue({ code: "custom", message: t("downloadProtocol") });
        }
      }),
    password: z.string().default(HTTP_SOURCE_DEFAULT_PASSWORD),
  });
}

export const httpsourceDownloadSchema = createHttpSourceDownloadSchema();
export const httpsourceNameSchema = httpsourceDownloadSchema.shape.name;
export const httpsourceUrlSchema = httpsourceDownloadSchema.shape.url;
export type HttpSourceDownloadInput = z.infer<typeof httpsourceDownloadSchema>;
