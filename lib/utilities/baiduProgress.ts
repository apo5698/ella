// Kept free of imports so it can be tested without loading the library
// configuration.

export type BaiduTransfer = { received: number; total: number | null };

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];

function parseSize(value: string, unit: string) {
  const power = SIZE_UNITS.indexOf(unit.toUpperCase());
  return power < 0 ? NaN : Math.round(Number(value) * 1024 ** power);
}

/**
 * Reads the latest progress redraw, such as
 * `[1] ↓ 1.50MB/10.00GB 2.00MB/s in 3s, left 1m20s ............`.
 * Only the two sizes are taken: the rest of the output is never forwarded.
 */
export function parseBaiduTransfer(output: string): BaiduTransfer | null {
  const matches = [
    ...output.matchAll(
      /↓\s*([\d.]+)\s*([KMGTPE]?B)\s*\/\s*([\d.]+)\s*([KMGTPE]?B)/gi,
    ),
  ];
  const last = matches.at(-1);
  if (!last) return null;
  const received = parseSize(last[1], last[2]);
  const total = parseSize(last[3], last[4]);
  if (!Number.isFinite(received)) return null;
  return {
    received,
    total: Number.isFinite(total) && total > 0 ? total : null,
  };
}
