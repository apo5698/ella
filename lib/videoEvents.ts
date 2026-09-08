export type VideoEvent =
  | {
      type: "metrics";
      videoId: number;
      clicks?: number;
      views?: number;
    }
  | {
      type: "invalidate";
      videoIds?: number[];
    };

type Listener = (event: VideoEvent) => void;

const globalEvents = globalThis as unknown as {
  __videoEventListeners?: Set<Listener>;
};
if (!globalEvents.__videoEventListeners) {
  globalEvents.__videoEventListeners = new Set();
}
const listeners = globalEvents.__videoEventListeners;

export function subscribeVideoEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyVideoMetrics(
  event: Omit<Extract<VideoEvent, { type: "metrics" }>, "type">,
) {
  for (const listener of listeners) listener({ type: "metrics", ...event });
}

export function notifyVideosChanged(videoIds?: number[]) {
  const event: VideoEvent = videoIds
    ? { type: "invalidate", videoIds: [...new Set(videoIds)] }
    : { type: "invalidate" };
  for (const listener of listeners) listener(event);
}
