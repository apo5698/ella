"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BellIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Dot } from "@/components/ui/dot";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import HeaderSearch from "@/components/video/HeaderSearch";
import { useTaskQueue } from "@/hooks/useTaskQueue";
import { cn } from "@/lib/utils";

export default function TopNav() {
  const t = useTranslations("Navigation");
  const { unreadCount } = useTaskQueue();
  const hasUnread = unreadCount > 0;

  return (
    <div className="sticky top-0 z-20 shrink-0 bg-background/90 backdrop-blur-xl">
      <header className="relative flex h-12 items-center justify-between gap-3 px-4">
        <SidebarTrigger aria-label={t("toggleSidebar")} />
        <Suspense fallback={<div className="flex-1" />}>
          <HeaderSearch />
        </Suspense>
        <Link
          href="/admin/notifications"
          aria-label={
            hasUnread ? t("notificationCenterUnread") : t("notificationCenter")
          }
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "relative",
          )}
        >
          <BellIcon />
          {hasUnread && (
            <Dot
              aria-hidden
              className="absolute top-1 right-1 bg-primary ring-2 ring-background"
            />
          )}
        </Link>
      </header>
      <Separator />
    </div>
  );
}
