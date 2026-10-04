import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import BaiduSetupWizard from "@/components/settings/BaiduSetupWizard";
import DownloadSourcesEditor from "@/components/settings/DownloadSourcesEditor";
import { Button } from "@/components/ui/button";

export default async function DownloadServiceSettingsPage() {
  const t = await getTranslations("Navigation");
  const utilities = await getTranslations("Utilities");
  return (
    <>
      <div>
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/admin/utilities/downloader" />}
          nativeButton={false}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {utilities("downloader")}
        </Button>
      </div>
      <AdminPageHeader
        title={t("downloadServices")}
        description={t("downloadServicesDescription")}
      />
      <div className="flex flex-col gap-4">
        <DownloadSourcesEditor />
        <BaiduSetupWizard />
      </div>
    </>
  );
}
