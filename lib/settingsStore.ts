// Persistence for the frame-extraction settings. Server-only: it pulls in the
// SQLite binding, so the settings page imports the pure half (lib/settings.ts)
// and never this file.
//
// Read fresh on every use rather than cached at module load: the long-lived
// server must see an edit immediately, and a SELECT over three rows costs
// nothing.
import db from "./db";
import { LMSTUDIO_URL, LMSTUDIO_MODEL } from "./config";
import {
  normalizeLlmSettings,
  normalizeTagSettings,
  type LlmSettings,
  type TagSettings,
} from "./settings";

function readAll(): Record<string, unknown> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const stored: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      stored[row.key] = JSON.parse(row.value);
    } catch {
      // A hand-edited row: fall through to the default for that key.
    }
  }
  return stored;
}

export function getTagSettings(): TagSettings {
  return normalizeTagSettings(readAll());
}

export function saveTagSettings(patch: Partial<TagSettings>): TagSettings {
  const next = normalizeTagSettings({ ...getTagSettings(), ...patch });
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  db.transaction(() => {
    for (const [key, value] of Object.entries(next)) {
      stmt.run(key, JSON.stringify(value));
    }
  })();
  return next;
}

/**
 * The saved server address and model, falling back to the environment when the
 * user has never set them from the settings page.
 */
export function getLlmSettings(): LlmSettings {
  return normalizeLlmSettings(readAll(), {
    url: LMSTUDIO_URL.replace(/\/+$/, ""),
    model: LMSTUDIO_MODEL,
  });
}

export function saveLlmSettings(patch: Partial<LlmSettings>): LlmSettings {
  const current = getLlmSettings();
  const next = normalizeLlmSettings(
    {
      llmUrl: patch.url ?? current.url,
      llmModel: patch.model ?? current.model,
    },
    current,
  );
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  db.transaction(() => {
    stmt.run("llmUrl", JSON.stringify(next.url));
    stmt.run("llmModel", JSON.stringify(next.model));
  })();
  return next;
}
