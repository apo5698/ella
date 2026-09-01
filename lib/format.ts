export function formatDuration(sec?: number | null): string {
  if (!sec) return "--:--";
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * A duration written out in words, for estimates and elapsed times.
 *
 * Distinct from `formatDuration`, which renders a video's length as a
 * timecode. Kept in one place so the wording cannot drift between the pages
 * that show durations.
 */
export function formatDurationText(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  if (total < 60) return `${total} 秒`;

  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    const rest = total % 60;
    // Standalone minutes read as 分钟; alongside seconds, 分 is the idiomatic
    // form. Both refer to the same unit.
    return rest === 0 ? `${minutes} 分钟` : `${minutes} 分 ${rest} 秒`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
}

export function formatSize(bytes?: number | null): string {
  if (!bytes) return "未知";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}
