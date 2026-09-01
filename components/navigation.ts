import { Clapperboard, Film, ListChecks, Settings, Tags } from "lucide-react";
import { UTILITY_MODULES } from "@/lib/utilities/registry";

export const MAIN_NAVIGATION = [
  { href: "/", label: "首页", icon: Film },
] as const;

export const ADMIN_NAVIGATION = [
  { href: "/admin/videos", label: "视频管理", icon: Clapperboard },
  { href: "/admin/tags", label: "标签管理", icon: Tags },
  { href: "/admin/tasks", label: "任务队列", icon: ListChecks },
  { href: "/admin/settings", label: "设置", icon: Settings },
] as const;

export const UTILITY_NAVIGATION = UTILITY_MODULES.map((module) => ({
  href: module.href,
  label: module.name,
  icon: module.icon,
}));

export const APP_NAVIGATION = [
  ...MAIN_NAVIGATION,
  ...ADMIN_NAVIGATION,
  ...UTILITY_NAVIGATION,
] as const;

export function isNavigationActive(pathname: string, href: string) {
  const hrefPath = href.split("?")[0];
  return hrefPath === "/"
    ? pathname === hrefPath
    : pathname.startsWith(hrefPath);
}
