// Connectivity probe for the model server.
//
// The only assumption is the OpenAI-compatible surface: `GET {url}/models`
// answers with a list, and `POST {url}/chat/completions` accepts requests.
// Nothing vendor-specific is read, and nothing about a model is inferred. The
// response body is only parsed far enough to read standard model identifiers.

// The settings page must stay responsive when nothing is listening on the
// port, which is the normal state when the server simply is not running.
const PROBE_TIMEOUT_MS = 5000;

export type LlmProbe = {
  reachable: boolean;
  /** HTTP status, or null when the request never completed. */
  httpStatus: number | null;
  latencyMs: number | null;
  error: string | null;
  /**
   * Model identifiers taken from the standard list shape (`data[].id`). Empty
   * when the server answers in some other shape; the model can then be typed
   * in by hand.
   */
  modelIds: string[];
};

function readModelIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data
    .map((entry) =>
      entry && typeof entry === "object"
        ? (entry as { id?: unknown }).id
        : undefined,
    )
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

export async function probeLlm(baseUrl: string): Promise<LlmProbe> {
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/models`;
  const base: LlmProbe = {
    reachable: false,
    httpStatus: null,
    latencyMs: null,
    error: null,
    modelIds: [],
  };

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      signal: controller.signal,
      cache: "no-store",
    });
    const latencyMs = Date.now() - startedAt;
    const text = await res.text();

    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // A non-JSON response simply contains no readable model list.
    }

    return {
      ...base,
      reachable: res.ok,
      httpStatus: res.status,
      latencyMs,
      modelIds: res.ok ? readModelIds(body) : [],
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    const aborted = (err as Error).name === "AbortError";
    return {
      ...base,
      latencyMs: Date.now() - startedAt,
      error: aborted
        ? `连接超时（${PROBE_TIMEOUT_MS / 1000} 秒）`
        : (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}
