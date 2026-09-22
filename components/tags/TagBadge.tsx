"use client";

import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TagReviewState } from "@/lib/types";
import {
  ALIAS_STYLE,
  GLOBAL_STYLE,
  INLINE_STYLE,
  SERIES_STYLE,
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
  const t = useTranslations("TagLabels");
  const resolvedState =
    state ?? (source === "manual" ? "approved" : "automatic");
  return (
    <Badge
      variant={variant}
      title={title ?? t(TAG_STATE_LABEL[resolvedState])}
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
  title,
  variant = "secondary",
  ...props
}: BadgeProps) {
  const t = useTranslations("TagLabels");
  return (
    <Badge
      variant={variant}
      title={title ?? t("series")}
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
  title,
  variant = "outline",
  ...props
}: BadgeProps) {
  const t = useTranslations("TagLabels");
  return (
    <Badge
      variant={variant}
      title={title ?? t("alias")}
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
      <XIcon data-icon="inline-end" />
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
  const t = useTranslations("TagLabels");
  const resolvedState =
    state ?? (source === "manual" ? "approved" : "automatic");
  return (
    <RemovableBadge
      variant="secondary"
      title={title ?? t(TAG_STATE_LABEL[resolvedState])}
      className={cn(GLOBAL_STYLE, TAG_STATE_STYLE[resolvedState], className)}
      {...props}
    />
  );
}

export function RemovableSeriesBadge({
  className,
  title,
  ...props
}: RemovableBadgeProps) {
  const t = useTranslations("TagLabels");
  return (
    <RemovableBadge
      variant="secondary"
      title={title ?? t("series")}
      className={cn(GLOBAL_STYLE, SERIES_STYLE, className)}
      {...props}
    />
  );
}

export function RemovableAliasBadge({
  className,
  title,
  ...props
}: RemovableBadgeProps) {
  const t = useTranslations("TagLabels");
  return (
    <RemovableBadge
      variant="outline"
      title={title ?? t("removeAlias")}
      className={cn(GLOBAL_STYLE, ALIAS_STYLE, className)}
      {...props}
    />
  );
}
