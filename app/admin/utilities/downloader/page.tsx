import { getTranslations } from "next-intl/server";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import BackLabel from "@/components/BackLabel";
import Downloader from "@/components/admin/Downloader";

export default async function DownloaderPage() {
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
      <Downloader />
    </>
  );
}
