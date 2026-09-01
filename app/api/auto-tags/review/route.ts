import db from "@/lib/db";
import {
  autoTagKind,
  createAutoTagSuggester,
  isAutoTagStrategy,
  loadAutoTagVideo,
  type AutoTagStrategy,
} from "@/lib/autoTagging";
import { ensureTag } from "@/lib/tagHierarchy";
import { ensureSeries } from "@/lib/series";
import { enqueueTagPromotion } from "@/lib/taskRunner";

type RequestedSuggestion = {
  name: string;
  strategy: AutoTagStrategy;
  regexPattern?: string;
};

/**
 * Applies the suggestions the user accepted. Turning one down is not a
 * request: it is dropped in the browser, and nothing about it reaches the
 * database, neither the link nor the tag it named.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const videoId = Number(body.videoId);
  const requested: RequestedSuggestion[] = Array.isArray(body.suggestions)
    ? body.suggestions.flatMap((item: unknown): RequestedSuggestion[] => {
        const value = item as Record<string, unknown>;
        const name = String(value.name ?? "").trim();
        if (!name || !isAutoTagStrategy(value.strategy)) return [];
        return [
          {
            name,
            strategy: value.strategy,
            regexPattern:
              value.strategy === "filename-regex"
                ? String(value.regexPattern ?? "")
                : undefined,
          },
        ];
      })
    : [];

  if (!Number.isInteger(videoId) || videoId < 1) {
    return Response.json({ error: "视频无效" }, { status: 400 });
  }
  if (requested.length === 0) {
    return Response.json({ error: "没有可接受的建议" }, { status: 400 });
  }

  const video = loadAutoTagVideo(db, videoId);
  if (!video) {
    return Response.json({ error: "视频不存在" }, { status: 404 });
  }

  const valid = requested.filter((item) => {
    try {
      return createAutoTagSuggester(
        db,
        [item.strategy],
        item.regexPattern,
      )(video).some(
        (suggestion) =>
          suggestion.strategy === item.strategy &&
          suggestion.name === item.name,
      );
    } catch {
      return false;
    }
  });

  if (valid.length === 0) {
    return Response.json(
      { error: "这些建议已经处理或不再适用" },
      { status: 409 },
    );
  }

  const canonicalNames: string[] = [];
  const promoted: number[] = [];
  const tx = db.transaction(() => {
    const saveTag = db.prepare(
      `INSERT INTO video_tags (video_id, tag_id, source, status)
       VALUES (?, ?, 'manual', 'active')
       ON CONFLICT(video_id, tag_id)
       DO UPDATE SET source = excluded.source, status = excluded.status`,
    );
    const saveSeries = db.prepare(
      "UPDATE videos SET series_id = ? WHERE id = ?",
    );

    for (const suggestion of valid) {
      if (autoTagKind(suggestion.strategy) === "series") {
        const series = ensureSeries(db, suggestion.name);
        saveSeries.run(series.id, videoId);
        canonicalNames.push(series.name);
        continue;
      }
      const tag = ensureTag(db, suggestion.name);
      saveTag.run(videoId, tag.id);
      canonicalNames.push(tag.name);
      promoted.push(tag.id);
    }
  });
  tx();

  // Outside the transaction: queueing is a write of its own, and the accepted
  // tags are the user's own words from here on.
  for (const tagId of promoted) enqueueTagPromotion(db, tagId);

  return Response.json({
    ok: true,
    videoId,
    names: canonicalNames,
  });
}
