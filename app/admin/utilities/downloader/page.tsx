import { getTranslations } from "next-intl/server";
import Link from "next/link";
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

  const t = await getTranslations("Utilities");
  return (
    <>
      <Link
        href="/admin/utilities"
        className="flex items-center gap-1 self-start text-sm text-link hover:underline"
      >
        <BackLabel />
      </Link>
      <AdminPageHeader
        title={t("downloader")}
        description={t("downloadDescription")}
      />
      <Downloader source={source} />
    </>
  );
}
