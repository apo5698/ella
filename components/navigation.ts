import {
  ClapperboardIcon,
  DownloadIcon,
  FilmIcon,
  SettingsIcon,
  SparklesIcon,
  TagsIcon,
} from "lucide-react";
import { UTILITY_MODULES } from "@/lib/utilities/registry";

export const MAIN_NAVIGATION = [
  { href: "/", labelKey: "home", icon: FilmIcon },
] as const;

export const ADMIN_NAVIGATION = [
  { href: "/admin/videos", labelKey: "videos", icon: ClapperboardIcon },
  { href: "/admin/tags", labelKey: "tags", icon: TagsIcon },
] as const;

export const SETTINGS_NAVIGATION = {
  href: "/settings",
  labelKey: "settings",
  icon: SettingsIcon,
  children: [
    {
      href: "/settings/recognition",
      labelKey: "recognition",
      icon: SparklesIcon,
    },
    {
      href: "/settings/downloads",
      labelKey: "downloadServices",
      icon: DownloadIcon,
    },
  ],
} as const;

export const UTILITY_NAVIGATION = UTILITY_MODULES.map((module) => ({
  href: module.href,
  label: module.name,
  icon: module.icon,
}));

export function isNavigationActive(pathname: string, href: string) {
  const hrefPath = href.split("?")[0];
  return hrefPath === "/"
    ? pathname === hrefPath
    : pathname.startsWith(hrefPath);
}
