import { z } from "zod";

export const HTTP_SOURCE_DEFAULT_PASSWORD = "example-password";

export const httpsourceNameSchema = z.string().trim().min(1, "请输入文件名");

export const httpsourceUrlSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    if (!value) {
      ctx.addIssue({ code: "custom", message: "请输入视频 URL" });
      return;
    }
    if (!URL.canParse(value)) {
      ctx.addIssue({ code: "custom", message: "请输入有效的视频 URL" });
      return;
    }
    const protocol = new URL(value).protocol;
    if (protocol !== "http:" && protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        message: "视频 URL 必须使用 HTTP 或 HTTPS",
      });
    }
  });

export const httpsourceDownloadSchema = z.object({
  name: httpsourceNameSchema,
  url: httpsourceUrlSchema,
  password: z.string().default(HTTP_SOURCE_DEFAULT_PASSWORD),
});

export type HttpSourceDownloadInput = z.infer<typeof httpsourceDownloadSchema>;
