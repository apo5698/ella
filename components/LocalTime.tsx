"use client";

import { useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const relativeFormatter = new Intl.RelativeTimeFormat("zh-CN", {
  numeric: "auto",
});

function relativeTime(value: number, now: number) {
  const seconds = Math.round((value - now) / 1000);
  const intervals = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ] as const;

  let amount = seconds;
  for (const [limit, unit] of intervals) {
    if (Math.abs(amount) < limit) {
      return relativeFormatter.format(amount, unit);
    }
    amount = Math.round(amount / limit);
  }
}

export default function LocalTime({ value }: { value: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const local = new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  const relative = relativeTime(value, now);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="cursor-pointer text-right tabular-nums decoration-dotted underline-offset-4 hover:underline"
            aria-label={`${relative}，点击显示完整时间`}
          />
        }
      >
        <time dateTime={new Date(value).toISOString()} suppressHydrationWarning>
          {relative}
        </time>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-auto tabular-nums">
        <time dateTime={new Date(value).toISOString()}>{local}</time>
      </PopoverContent>
    </Popover>
  );
}
