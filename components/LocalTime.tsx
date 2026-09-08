"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function relativeTime(value: number, now: number, locale: string) {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
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
      return formatter.format(amount, unit);
    }
    amount = Math.round(amount / limit);
  }
}

export default function LocalTime({
  value,
  interactive = true,
}: {
  value: number;
  interactive?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("LocalTime");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const local = new Date(value).toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  const relative = relativeTime(value, now, locale) ?? "";
  const time = (
    <time dateTime={new Date(value).toISOString()} suppressHydrationWarning>
      {relative}
    </time>
  );

  if (!interactive) return time;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="cursor-pointer text-right tabular-nums decoration-dotted underline-offset-4 hover:underline"
            aria-label={t("showFull", { relative })}
          />
        }
      >
        {time}
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-auto tabular-nums">
        <time dateTime={new Date(value).toISOString()}>{local}</time>
      </PopoverContent>
    </Popover>
  );
}
