import { z } from "zod";
import { createTranslator } from "next-intl";
import english from "@/messages/en.json";
import { createBaiduShareSchema } from "@/lib/utilities/baiduShareSchema";

const defaultTranslate = createTranslator({
  locale: "en",
  messages: english,
  namespace: "Api",
});
type Translate = (key: keyof typeof english.Api) => string;

export function createShareDownloadSchema(t: Translate = defaultTranslate) {
  return createBaiduShareSchema(t).extend({
    name: z.string().trim().min(1, t("downloadNameRequired")),
  });
}
export const shareDownloadSchema = createShareDownloadSchema();
export type ShareDownloadInput = z.infer<typeof shareDownloadSchema>;
