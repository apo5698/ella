/**
 * Whether a browser request came from a page of this application.
 *
 * Compared with the host the browser addressed, not with `request.url`: in a
 * container the server listens on 0.0.0.0, so the URL it sees never matches
 * the address in the browser. Behind a proxy that rewrites Host, the original
 * arrives as X-Forwarded-Host.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() ||
    request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
