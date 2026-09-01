import Link from "next/link";
import { redirect } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import BackLabel from "@/components/BackLabel";
import Downloader from "@/components/admin/Downloader";
import {
  DOWNLOADER_SOURCES,
  type DownloaderSource,
} from "@/lib/utilities/registry";

export default async function DownloaderPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string | string[] }>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.source)
    ? params.source[0]
    : params.source;
  const source = DOWNLOADER_SOURCES.some((item) => item.slug === requested)
    ? (requested as DownloaderSource)
    : DOWNLOADER_SOURCES[0].slug;

  if (source !== requested)
    redirect(`/admin/utilities/downloader?source=${source}`);

  return (
    <>
      <Link
        href="/admin/utilities"
        className="flex items-center gap-1 self-start text-sm text-link hover:underline"
      >
        <BackLabel />
      </Link>
      <AdminPageHeader
        title="下载器"
        description="从不同来源下载视频并录入媒体库"
      />
      <Downloader source={source} />
    </>
  );
}
