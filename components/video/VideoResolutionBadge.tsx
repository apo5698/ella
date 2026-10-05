import { cva, type VariantProps } from "class-variance-authority";
import { Badge } from "@/components/ui/badge";
import { formatResolution } from "@/lib/format";
import { cn } from "@/lib/utils";

const resolutionBadgeVariants = cva("h-auto rounded px-1 py-0 text-xs/4", {
  variants: {
    variant: {
      /** Carries its own backing, so it reads over any picture. */
      overlay:
        "border-0 bg-black/60 text-white ring-1 ring-white/15 ring-inset backdrop-blur-sm",
      /** Drawn in theme colors, for use on the page itself. */
      outline: "",
    },
  },
  defaultVariants: { variant: "overlay" },
});

/**
 * The resolution class of a video as a badge, such as "1080p" or "4K".
 * Standard definition is the unremarkable case and shows nothing.
 */
export default function VideoResolutionBadge({
  width,
  height,
  variant,
  className,
}: {
  width: number | null;
  height: number | null;
  className?: string;
} & VariantProps<typeof resolutionBadgeVariants>) {
  const label = formatResolution(width, height);
  if (!label || label === "SD") return null;
  return (
    <Badge
      variant={variant === "outline" ? "outline" : "default"}
      className={cn(resolutionBadgeVariants({ variant }), className)}
    >
      {label}
    </Badge>
  );
}
