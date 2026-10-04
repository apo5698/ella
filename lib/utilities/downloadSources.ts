import { z } from "zod";
import { createTranslator } from "next-intl";
import english from "@/messages/en.json";
import { createBaiduShareSchema } from "@/lib/utilities/baiduShareSchema";

/**
 * Download sources are data, not code. Each one names a transport the code
 * implements and the archive layout its files arrive in, so a new source is
 * an entry in Settings rather than a release. No source ships with Ella.
 */

/** How the files of a download are fetched. Each is implemented in code. */
export const DOWNLOAD_TRANSPORTS = ["http", "baidu-share"] as const;
export type DownloadTransport = (typeof DOWNLOAD_TRANSPORTS)[number];

/** Archives inside archives are unpacked at most this many levels deep. */
export const MAX_ARCHIVE_LAYERS = 3;

export const downloadSourceSchema = z.strictObject({
  /** Stored with each download, so it stays the same when the name changes. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/),
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).optional(),
  transport: z.enum(DOWNLOAD_TRANSPORTS),
  /**
   * Archives the video is packed in, outermost first. 0 means the download
   * is the video itself. Every layer before the last holds one archive.
   */
  layers: z.number().int().min(0).max(MAX_ARCHIVE_LAYERS).default(1),
  /** Prefilled archive password. Present means the form asks for one. */
  password: z.string().optional(),
  /** Keep the files for the user to choose from, or discard them. */
  onUnexpectedLayout: z.enum(["retain", "fail"]).default("retain"),
});

export type DownloadSource = z.infer<typeof downloadSourceSchema>;

/** The form fields a source asks for, in order. Name is always last. */
export type DownloadField = "url" | "code" | "password" | "name";

export function downloadFields(source: DownloadSource): DownloadField[] {
  return [
    "url",
    ...(source.transport === "baidu-share" ? (["code"] as const) : []),
    ...(source.password !== undefined && source.layers > 0
      ? (["password"] as const)
      : []),
    "name",
  ];
}

export function initialDownloadValues(
  source: DownloadSource,
): { name: string } & Record<string, string> {
  return Object.fromEntries(
    downloadFields(source).map((field) => [
      field,
      field === "password" ? (source.password ?? "") : "",
    ]),
  ) as { name: string } & Record<string, string>;
}

type Translate = (key: keyof typeof english.Api) => string;
const defaultTranslate: Translate = createTranslator({
  locale: "en",
  messages: english,
  namespace: "Api",
});

/** The whole list, as saved in Settings. */
export function createDownloadSourcesSchema(t: Translate = defaultTranslate) {
  return z
    .array(downloadSourceSchema)
    .max(50)
    .superRefine((sources, ctx) => {
      const seen = new Set<string>();
      sources.forEach((source, index) => {
        if (seen.has(source.id))
          ctx.addIssue({
            code: "custom",
            path: [index, "id"],
            message: t("downloadSourceDuplicateId"),
          });
        seen.add(source.id);
      });
    });
}

function httpUrl(t: Translate) {
  return z
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
      if (protocol !== "http:" && protocol !== "https:")
        ctx.addIssue({ code: "custom", message: t("downloadProtocol") });
    });
}

/** What one download of `source` must be given, localized by the caller. */
export function createDownloadInputSchema(
  source: DownloadSource,
  t: Translate = defaultTranslate,
) {
  const name = z.string().trim().min(1, t("downloadNameRequired"));
  const password =
    source.password !== undefined && source.layers > 0
      ? { password: z.string().default(source.password) }
      : {};
  return source.transport === "baidu-share"
    ? createBaiduShareSchema(t).extend({ name, ...password })
    : z.object({ url: httpUrl(t), name, ...password });
}

export type DownloadInput = { name: string; url: string } & {
  code?: string;
  password?: string;
};

/** Interface text the JSON Schema below carries, in the reader's language. */
export type DownloadSourceSchemaText = Record<
  | keyof DownloadSource
  | "transportHttp"
  | "transportBaiduShare"
  | "retain"
  | "fail"
  | "snippetHttp"
  | "snippetShare",
  string
>;

type JsonSchemaNode = Record<string, unknown> & {
  properties?: Record<string, Record<string, unknown>>;
};

/**
 * The list as JSON Schema, so an editor can complete and check it while the
 * user types. The server still validates with the zod schema on save.
 */
export function createDownloadSourcesJsonSchema(
  text: DownloadSourceSchemaText,
) {
  const schema = z.toJSONSchema(z.array(downloadSourceSchema).max(50), {
    io: "input",
    target: "draft-7",
  }) as JsonSchemaNode;
  const item = schema.items as JsonSchemaNode;
  for (const [key, property] of Object.entries(item.properties ?? {}))
    property.description = text[key as keyof DownloadSource];
  Object.assign(item.properties!.transport, {
    enumDescriptions: [text.transportHttp, text.transportBaiduShare],
  });
  Object.assign(item.properties!.onUnexpectedLayout, {
    enumDescriptions: [text.retain, text.fail],
  });
  item.defaultSnippets = [
    {
      label: text.snippetHttp,
      body: {
        id: "$1",
        name: "$2",
        transport: "http",
        layers: 1,
        password: "$3",
        onUnexpectedLayout: "retain",
      },
    },
    {
      label: text.snippetShare,
      body: { id: "$1", name: "$2", transport: "baidu-share", layers: 1 },
    },
  ];
  return schema;
}
