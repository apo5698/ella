"use client";

import { useEffect, useRef, useState } from "react";
import type { Heat } from "@/lib/heat";

const HEIGHT_PX = 24;

/** x runs over 0..100 and y over 0..1, top down. */
function points(curve: number[]) {
  const step = 100 / curve.length;
  return curve.map((value, i) => `${(i + 0.5) * step},${1 - value}`);
}

/**
 * The two heat curves of lib/heat.ts drawn above the time slider: what
 * viewers played as a white area, how much the picture changes as a line in
 * the accent color. Sits in the layout's slot just before the slider and
 * lines itself up with the slider's track.
 */
export default function HeatCurve({ heat }: { heat: Heat }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{
    left: number;
    width: number;
    bottom: number;
  } | null>(null);

  useEffect(() => {
    const element = ref.current;
    const group = element?.parentElement;
    const slider = element?.nextElementSibling;
    if (!group || !(slider instanceof HTMLElement)) return;
    const measure = () => {
      const track = slider.querySelector(".vds-slider-track") ?? slider;
      const outer = group.getBoundingClientRect();
      const inner = track.getBoundingClientRect();
      setBox({
        left: inner.left - outer.left,
        width: inner.width,
        bottom: outer.bottom - inner.top,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    observer.observe(slider);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute"
      style={
        box
          ? {
              left: box.left,
              width: box.width,
              bottom: box.bottom + 2,
              height: HEIGHT_PX,
            }
          : { visibility: "hidden" }
      }
    >
      <svg
        viewBox="0 0 100 1"
        preserveAspectRatio="none"
        className="size-full overflow-visible"
      >
        {heat.watch && (
          <path
            d={`M0,1 L0,${1 - heat.watch[0]} L${points(heat.watch).join(" L")} L100,${1 - heat.watch.at(-1)!} L100,1 Z`}
            className="fill-white/35"
          />
        )}
        {heat.scene && (
          <polyline
            points={points(heat.scene).join(" ")}
            vectorEffect="non-scaling-stroke"
            strokeWidth={1.5}
            strokeLinejoin="round"
            className="fill-none stroke-primary"
          />
        )}
      </svg>
    </div>
  );
}
