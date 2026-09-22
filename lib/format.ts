export function formatDuration(sec?: number | null): string {
  if (!sec) return "--:--";
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Human-readable duration using the selected display locale. */
export function formatDurationText(sec: number, locale = "en"): string {
  const total = Math.max(0, Math.round(sec));
  const unit = (value: number, name: string) =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: name,
      unitDisplay: "short",
    }).format(value);
  if (total < 60) return unit(total, "second");
  const minutes = Math.floor(total / 60);
  const values =
    minutes < 60
      ? [
          unit(minutes, "minute"),
          ...(total % 60 ? [unit(total % 60, "second")] : []),
        ]
      : [
          unit(Math.floor(minutes / 60), "hour"),
          ...(minutes % 60 ? [unit(minutes % 60, "minute")] : []),
        ];
  return new Intl.ListFormat(locale, { style: "narrow", type: "unit" }).format(
    values,
  );
}

export function formatSize(bytes?: number | null): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}
