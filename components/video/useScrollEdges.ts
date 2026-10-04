"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Whether a sideways scroller sits at its start or end, kept current. */
export function useScrollEdges<T extends HTMLElement>(itemCount: number) {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    setEdges({
      start: element.scrollLeft <= 4,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    measure();
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, itemCount]);

  /** Scrolls most of one width forward or back. */
  const page = useCallback((direction: -1 | 1) => {
    const element = ref.current;
    element?.scrollBy({
      left: direction * element.clientWidth * 0.8,
      behavior: "smooth",
    });
  }, []);

  return { ref, edges, measure, page };
}
