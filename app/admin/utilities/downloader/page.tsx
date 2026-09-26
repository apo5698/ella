import { getTranslations } from "next-intl/server";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import Downloader from "@/components/admin/Downloader";

export default async function DownloaderPage() {
  const t = await getTranslations("Utilities");
  return (
    <>
      <AdminPageHeader
        title={t("downloader")}
        description={t("downloadDescription")}
      />
      <Downloader />
    </>
  );
}
