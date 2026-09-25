import { DownloadIcon } from "lucide-react";

export const DOWNLOADER_SOURCES = [
  {
    slug: "httpsource",
    name: "source",
    description: "sourceDescription",
  },
  { slug: "share", name: "share", description: "shareDescription" },
] as const;

export type DownloaderSource = (typeof DOWNLOADER_SOURCES)[number]["slug"];

export const UTILITY_MODULES = [
  {
    slug: "downloader",
    name: "downloader",
    description: "downloadDescription",
    href: "/admin/utilities/downloader",
    icon: DownloadIcon,
  },
] as const;
