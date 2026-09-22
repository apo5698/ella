"use client";

import { useTranslations } from "next-intl";

import { ChevronLeftIcon } from "lucide-react";

export default function BackLabel() {
  const t = useTranslations("Common");
  return (
    <>
      <ChevronLeftIcon className="h-4 w-4" />
      {t("back")}
    </>
  );
}
