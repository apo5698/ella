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

export function createSykbDownloadSchema(t: Translate = defaultTranslate) {
  return createBaiduShareSchema(t).extend({
    name: z.string().trim().min(1, t("downloadNameRequired")),
  });
}
export const sykbDownloadSchema = createSykbDownloadSchema();
export type SykbDownloadInput = z.infer<typeof sykbDownloadSchema>;
