// Display-only resolution label, derived from ffprobe dimensions.
// Not stored as a tag — tags come solely from vision or the user.
export function resolutionLabel(
  width?: number | null,
  height?: number | null,
): string | null {
  if (!width || !height) return null;
  const shortSide = Math.min(width, height);
  if (shortSide >= 2160) return "4k";
  if (shortSide >= 1440) return "1440p";
  if (shortSide >= 1080) return "1080p";
  if (shortSide >= 720) return "720p";
  if (shortSide >= 480) return "480p";
  return "sd";
}
