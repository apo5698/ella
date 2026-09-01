import { Download } from "lucide-react";

export const DOWNLOADER_SOURCES = [
  {
    slug: "qinglanhua",
    name: "青兰花",
    description: "下载压缩包、解压视频并录入媒体库",
  },
] as const;

export type DownloaderSource = (typeof DOWNLOADER_SOURCES)[number]["slug"];

export const UTILITY_MODULES = [
  {
    slug: "downloader",
    name: "下载器",
    description: "从不同来源下载视频并录入媒体库",
    href: `/admin/utilities/downloader?source=${DOWNLOADER_SOURCES[0].slug}`,
    icon: Download,
  },
] as const;
