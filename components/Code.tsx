import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** A short code fragment inside running text. */
function Code({ className, ...props }: ComponentProps<"code">) {
  return (
    <code
      data-slot="code"
      className={cn(
        "rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Code };
