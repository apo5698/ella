/** The columns behind a VideoCardData, for queries over `CARD_FROM`. */
export const CARD_COLUMNS = `v.id, v.title, v.thumbnail, v.duration_sec, v.width,
  v.height, v.views, v.mtime, v.ext, v.series_id, s.name AS series_name,
  v.preview_points`;

export const CARD_FROM = "videos v LEFT JOIN series s ON s.id = v.series_id";
