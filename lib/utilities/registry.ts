import { DownloadIcon } from "lucide-react";

export const DOWNLOADER_SOURCES = [
  {
    slug: "qinglanhua",
    name: "source",
    description: "sourceDescription",
  },
  { slug: "sykb", name: "sykb", description: "sykbDescription" },
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
