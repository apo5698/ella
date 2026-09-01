import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TagReviewState } from "@/lib/types";
import {
  ALIAS_STYLE,
  GLOBAL_STYLE,
  INLINE_STYLE,
  SERIES_STYLE,
  SOURCE_LABEL,
  TAG_STATE_LABEL,
  TAG_STATE_STYLE,
} from "./tag-presentation";

type BadgeProps = ComponentProps<typeof Badge>;
type RemovableBadgeProps = Omit<BadgeProps, "render"> & {
  removeLabel: string;
};

export function TagBadge({
  source,
  state,
  className,
  title,
  variant = "secondary",
  ...props
}: BadgeProps & { source?: string; state?: TagReviewState }) {
  const resolvedState =
    state ?? (source === "manual" ? "approved" : "automatic");
  return (
    <Badge
      variant={variant}
      title={
        title ??
        TAG_STATE_LABEL[resolvedState] ??
        (source ? (SOURCE_LABEL[source] ?? source) : undefined)
      }
      className={cn(GLOBAL_STYLE, TAG_STATE_STYLE[resolvedState], className)}
      {...props}
    />
  );
}

/** A semantic tag reference that flows with prose and wraps as one word. */
export function InlineTagBadge({
  className,
  ...props
}: ComponentProps<typeof TagBadge>) {
  return <TagBadge className={cn(INLINE_STYLE, className)} {...props} />;
}

export function SeriesBadge({
  className,
  title = "系列",
  variant = "secondary",
  ...props
}: BadgeProps) {
  return (
    <Badge
      variant={variant}
      title={title}
      className={cn(GLOBAL_STYLE, SERIES_STYLE, className)}
      {...props}
    />
  );
}

export function InlineSeriesBadge({
  className,
  ...props
}: ComponentProps<typeof SeriesBadge>) {
  return <SeriesBadge className={cn(INLINE_STYLE, className)} {...props} />;
}

export function AliasBadge({
  className,
  title = "别名",
  variant = "outline",
  ...props
}: BadgeProps) {
  return (
    <Badge
      variant={variant}
      title={title}
      className={cn(GLOBAL_STYLE, ALIAS_STYLE, className)}
      {...props}
    />
  );
}

export function InlineAliasBadge({
  className,
  ...props
}: ComponentProps<typeof AliasBadge>) {
  return <AliasBadge className={cn(INLINE_STYLE, className)} {...props} />;
}

export function RemovableBadge({
  removeLabel,
  className,
  children,
  ...props
}: RemovableBadgeProps) {
  return (
    <Badge
      render={<button type="button" />}
      aria-label={removeLabel}
      className={cn("cursor-pointer", className)}
      {...props}
    >
      {children}
      <X data-icon="inline-end" />
    </Badge>
  );
}

export function RemovableTagBadge({
  source,
  state,
  className,
  title,
  ...props
}: RemovableBadgeProps & { source?: string; state?: TagReviewState }) {
  const resolvedState =
    state ?? (source === "manual" ? "approved" : "automatic");
  return (
    <RemovableBadge
      variant="secondary"
      title={title ?? TAG_STATE_LABEL[resolvedState]}
      className={cn(GLOBAL_STYLE, TAG_STATE_STYLE[resolvedState], className)}
      {...props}
    />
  );
}

export function RemovableSeriesBadge({
  className,
  title = "系列",
  ...props
}: RemovableBadgeProps) {
  return (
    <RemovableBadge
      variant="secondary"
      title={title}
      className={cn(GLOBAL_STYLE, SERIES_STYLE, className)}
      {...props}
    />
  );
}

export function RemovableAliasBadge({
  className,
  title = "移除别名",
  ...props
}: RemovableBadgeProps) {
  return (
    <RemovableBadge
      variant="outline"
      title={title}
      className={cn(GLOBAL_STYLE, ALIAS_STYLE, className)}
      {...props}
    />
  );
}
