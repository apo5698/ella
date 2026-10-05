/**
 * When the video's preview clip was cut, or NULL while it has none. It is the
 * version in the clip's URL (app/api/preview/[id]).
 */
export const PREVIEW_CLIP_COLUMN = `(SELECT made_at FROM video_previews
  WHERE video_id = v.id AND ok = 1) AS preview_clip`;

/** The columns behind a VideoCardData, for queries over `CARD_FROM`. */
export const CARD_COLUMNS = `v.id, v.title, v.thumbnail, v.duration_sec, v.width,
  v.height, v.views, v.mtime, v.ext, v.series_id, s.name AS series_name,
  v.preview_points, ${PREVIEW_CLIP_COLUMN}`;

export const CARD_FROM = "videos v LEFT JOIN series s ON s.id = v.series_id";
