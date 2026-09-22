"use client";

import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export default function LoadingSpinner({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  const t = useTranslations("Common");
  return (
    <div
      className={cn(
        "flex min-h-64 flex-1 items-center justify-center",
        className,
      )}
    >
      <Spinner className="size-8" aria-label={label ?? t("loading")} />
    </div>
  );
}
