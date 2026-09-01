import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Positive review action, kept outside the upstream shadcn primitive. */
export default function AcceptButton({
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "variant">) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "text-success hover:bg-success/10 hover:text-success",
        className,
      )}
      {...props}
    />
  );
}
