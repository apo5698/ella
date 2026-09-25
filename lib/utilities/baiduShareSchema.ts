import { z } from "zod";
import { createTranslator } from "next-intl";
import english from "@/messages/en.json";

const defaultTranslate = createTranslator({
  locale: "en",
  messages: english,
  namespace: "Api",
});
type Translate = (key: keyof typeof english.Api) => string;

/**
 * A Baidu Netdisk share link and its extraction code. Every source hosted on
 * Baidu Netdisk builds its form schema on this.
 */
export function createBaiduShareSchema(t: Translate = defaultTranslate) {
  return z.object({
    url: z
      .string()
      .trim()
      .refine((value) => {
        if (
          !/^https:\/\/pan\.baidu\.com\/s\/[A-Za-z0-9_-]+(?:\?[^\s#]*)?$/.test(
            value,
          )
        )
          return false;
        const url = new URL(value);
        return url.origin === "https://pan.baidu.com";
      }, t("baiduUrlInvalid")),
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{4}$/, t("baiduCodeInvalid")),
  });
}

export type BaiduShare = z.infer<ReturnType<typeof createBaiduShareSchema>>;
