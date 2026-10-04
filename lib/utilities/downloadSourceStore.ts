import db from "@/lib/db";
import {
  createDownloadSourcesSchema,
  downloadSourceSchema,
  type DownloadSource,
} from "@/lib/utilities/downloadSources";

const KEY = "downloadSources";

/**
 * Sources were code before they were settings. An install that downloaded
 * then has no saved list, so one is rebuilt from its own download history:
 * the ids its tasks were stored under, with the layout each kind of source
 * had. Nothing about a particular source is written here.
 */
function sourcesFromHistory(): DownloadSource[] {
  const rows = db
    .prepare(
      "SELECT payload FROM background_jobs WHERE kind = 'VIDEO_DOWNLOAD' ORDER BY id DESC",
    )
    .all() as { payload: string }[];
  const sources = new Map<string, DownloadSource>();
  for (const row of rows) {
    let payload: {
      source?: unknown;
      input?: Record<string, unknown>;
      config?: unknown;
    };
    try {
      payload = JSON.parse(row.payload);
    } catch {
      continue;
    }
    const id = payload.source;
    if (typeof id !== "string" || sources.has(id) || payload.config) continue;
    const input = payload.input ?? {};
    const parsed = downloadSourceSchema.safeParse(
      typeof input.code === "string"
        ? // A share link and code: two archive layers, kept on a mismatch.
          { id, name: id, transport: "baidu-share", layers: 2 }
        : // A direct link and a password: one archive, refused on a mismatch.
          {
            id,
            name: id,
            transport: "http",
            layers: 1,
            onUnexpectedLayout: "fail",
            ...(typeof input.password === "string"
              ? { password: input.password }
              : {}),
          },
    );
    if (parsed.success) sources.set(id, parsed.data);
  }
  return [...sources.values()];
}

function write(sources: DownloadSource[]) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(KEY, JSON.stringify(sources));
}

/** Read fresh each time, so an edit applies to the next download at once. */
export function getDownloadSources(): DownloadSource[] {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(KEY) as { value: string } | undefined;
  if (!row) {
    const sources = sourcesFromHistory();
    write(sources);
    return sources;
  }
  try {
    const parsed = createDownloadSourcesSchema().safeParse(
      JSON.parse(row.value),
    );
    if (parsed.success) return parsed.data;
  } catch {
    // Not JSON: treated as no sources until it is saved again.
  }
  console.error("[downloads] The saved download sources are not valid");
  return [];
}

export function getDownloadSource(id: string) {
  return getDownloadSources().find((source) => source.id === id);
}

/** Saves a list already checked by `createDownloadSourcesSchema`. */
export function saveDownloadSources(sources: DownloadSource[]) {
  write(sources);
}
