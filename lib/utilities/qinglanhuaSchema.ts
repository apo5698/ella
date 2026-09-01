import { z } from "zod";

export const QINGLANHUA_DEFAULT_PASSWORD = "qinglanhua.net";

export const qinglanhuaNameSchema = z.string().trim().min(1, "请输入文件名");

export const qinglanhuaUrlSchema = z
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

export const qinglanhuaDownloadSchema = z.object({
  name: qinglanhuaNameSchema,
  url: qinglanhuaUrlSchema,
  password: z.string().default(QINGLANHUA_DEFAULT_PASSWORD),
});

export type QinglanhuaDownloadInput = z.infer<typeof qinglanhuaDownloadSchema>;
