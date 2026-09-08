"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dragging tags around the tree, built on pointer events rather than HTML5
 * drag and drop.
 *
 * The native API decides for itself whether a press begins a drag, and it
 * declines on form controls. Owning the gesture keeps touch support,
 * auto-scroll and drop targeting under our control while letting the visible
 * grip be the only place that starts a drag.
 */

/** How far the pointer travels before a press is read as a drag. */
const THRESHOLD_PX = 4;

/**
 * How long a finger rests before its press is read as a drag.
 *
 * A mouse can say "drag" by moving, because it has nothing else to do while
 * held down. A finger cannot: the same movement is how the list is scrolled.
 * Holding still is the only gesture left that scrolling has not claimed.
 */
const HOLD_MS = 400;
/** How far a finger may stray during the hold before it counts as a scroll. */
const HOLD_SLOP_PX = 10;

/** How close to the viewport edge the pointer scrolls the page. */
const EDGE_PX = 72;
/** Pixels per frame at the very edge. */
const EDGE_SPEED = 14;

export type DropTarget = number | "root" | null;

export type TagDrag = {
  /** The tags being dragged. Empty while idle. */
  ids: number[];
  active: boolean;
  target: DropTarget;
  /** The dragged tags and their subtrees, which cannot receive the drop. */
  blocked: Set<number>;
  /** Where the pointer is, for placing the preview. */
  cursor: { x: number; y: number } | null;
  begin: (id: number, event: React.PointerEvent) => void;
};

type Press = { id: number; x: number; y: number; touch: boolean };

export function useTagDrag({
  idsFor,
  blockedFor,
  onDrop,
}: {
  /** Which tags a press on this one drags, so a selection moves together. */
  idsFor: (id: number) => number[];
  blockedFor: (ids: number[]) => Set<number>;
  onDrop: (ids: number[], parentId: number | null) => void;
}): TagDrag {
  const [ids, setIds] = useState<number[]>([]);
  const [target, setTarget] = useState<DropTarget>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // Held twice on purpose: the rows read it while rendering, and the pointer
  // listeners need the value before the next render delivers it.
  const [blockedIds, setBlockedIds] = useState<Set<number>>(new Set());

  // The gesture reads and writes these from window listeners, where a value
  // captured at render time would be a frame or more out of date.
  const pending = useRef<Press | null>(null);
  const live = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragIds = useRef<number[]>([]);
  const blocked = useRef<Set<number>>(new Set());
  const point = useRef<{ x: number; y: number } | null>(null);
  const dropAt = useRef<DropTarget>(null);
  /** Assigned by the effect below so `begin`, which owns no state, can call it. */
  const startRef = useRef<(press: Press) => void>(() => {});

  /**
   * While a finger is down the browser is also deciding whether to scroll.
   * Cancelling touchmove is the only way to keep the page still once the drag
   * has begun, and that needs a listener the browser did not mark passive.
   */
  const blockScroll = useRef((event: TouchEvent) => {
    if (live.current) event.preventDefault();
  });

  const releaseTouch = useCallback(() => {
    window.removeEventListener("touchmove", blockScroll.current);
  }, []);

  const finish = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    releaseTouch();
    pending.current = null;
    live.current = false;
    dragIds.current = [];
    blocked.current = new Set();
    point.current = null;
    dropAt.current = null;
    setIds([]);
    setBlockedIds(new Set());
    setTarget(null);
    setCursor(null);
    document.body.classList.remove("select-none");
  }, [releaseTouch]);

  /** What sits under the pointer: a row, the top-level strip, or nothing. */
  const resolveTarget = useCallback((x: number, y: number): DropTarget => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    if (el.closest("[data-drop-root]")) return "root";
    const row = el.closest("[data-tag-row]");
    if (!row) return null;
    const id = Number(row.getAttribute("data-tag-row"));
    if (!Number.isFinite(id) || blocked.current.has(id)) return null;
    return id;
  }, []);

  const aim = useCallback(
    (x: number, y: number) => {
      point.current = { x, y };
      setCursor(point.current);
      const next = resolveTarget(x, y);
      if (next !== dropAt.current) {
        dropAt.current = next;
        setTarget(next);
      }
    },
    [resolveTarget],
  );

  useEffect(() => {
    function start(press: Press) {
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      live.current = true;
      dragIds.current = idsFor(press.id);
      blocked.current = blockedFor(dragIds.current);
      setIds(dragIds.current);
      setBlockedIds(blocked.current);
      // Otherwise the pointer paints a text selection across the tree as it
      // travels.
      document.body.classList.add("select-none");
      aim(press.x, press.y);
    }
    startRef.current = start;

    function move(event: PointerEvent) {
      const press = pending.current;
      if (!press) return;

      const strayed =
        Math.abs(event.clientX - press.x) >
          (press.touch ? HOLD_SLOP_PX : THRESHOLD_PX) ||
        Math.abs(event.clientY - press.y) >
          (press.touch ? HOLD_SLOP_PX : THRESHOLD_PX);

      if (!live.current) {
        // A finger that strays before the hold completes is scrolling, not
        // dragging, and the press is abandoned to it.
        if (press.touch) {
          if (strayed) finish();
          return;
        }
        if (!strayed) return;
        start(press);
      }

      aim(event.clientX, event.clientY);
    }

    function up() {
      if (live.current && dropAt.current !== null) {
        const parentId = dropAt.current === "root" ? null : dropAt.current;
        onDrop(dragIds.current, parentId);
      }
      if (live.current) {
        // The browser fires a click on release when the press and the release
        // land on the same element, which after a drag would open the editor.
        const swallow = (event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
        };
        window.addEventListener("click", swallow, {
          capture: true,
          once: true,
        });
        setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      }
      finish();
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", finish);
    };
  }, [idsFor, blockedFor, onDrop, aim, finish]);

  // Escape abandons the drag, which is the only way out once the pointer is
  // down and the drop would land somewhere unwanted.
  useEffect(() => {
    if (ids.length === 0) return;
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") finish();
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [ids.length, finish]);

  // Reaching a tag that is off screen means the page has to move while the
  // pointer is held, and a pointer resting at the edge sends no more events.
  useEffect(() => {
    if (ids.length === 0) return;
    let frame = 0;
    const step = () => {
      const at = point.current;
      // The top-level strip sits in the bottom edge band. Scrolling while the
      // pointer rests on it would drag the page out from under the drop.
      if (at && dropAt.current !== "root") {
        const top = at.y - EDGE_PX;
        const bottom = window.innerHeight - EDGE_PX - at.y;
        if (top < 0)
          window.scrollBy(
            0,
            Math.max(-EDGE_SPEED, (top / EDGE_PX) * EDGE_SPEED),
          );
        else if (bottom < 0)
          window.scrollBy(
            0,
            Math.min(EDGE_SPEED, (-bottom / EDGE_PX) * EDGE_SPEED),
          );
      }
      if (at) {
        // The rows under the pointer change as the page moves, even though the
        // pointer itself has not.
        const next = resolveTarget(at.x, at.y);
        if (next !== dropAt.current) {
          dropAt.current = next;
          setTarget(next);
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [ids.length, resolveTarget]);

  const begin = useCallback((id: number, event: React.PointerEvent) => {
    // Left button only. TagNode calls this exclusively from its grip.
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-no-drag]")) return;

    const touch = event.pointerType !== "mouse";
    const press: Press = { id, x: event.clientX, y: event.clientY, touch };
    pending.current = press;

    if (!touch) return;
    // Attached now rather than when the drag starts: by then the browser has
    // already read the first touchmove and begun scrolling.
    window.addEventListener("touchmove", blockScroll.current, {
      passive: false,
    });
    holdTimer.current = setTimeout(() => {
      if (pending.current === press) startRef.current(press);
    }, HOLD_MS);
  }, []);

  return {
    ids,
    active: ids.length > 0,
    target,
    blocked: blockedIds,
    cursor,
    begin,
  };
}
