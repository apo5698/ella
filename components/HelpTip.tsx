"use client";

import { CircleQuestionMark } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Inline help marker. Explanatory prose belongs here rather than as visible
 * body text, so section labels stay short.
 */
export default function HelpTip({
  children,
  side = "top",
  className,
}: {
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="说明"
            className={cn(
              "inline-flex shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
              className,
            )}
          />
        }
      >
        <CircleQuestionMark className="size-3" />
      </TooltipTrigger>
      <TooltipContent side={side}>{children}</TooltipContent>
    </Tooltip>
  );
}
