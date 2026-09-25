import { getTranslations } from "next-intl/server";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import BaiduSetupWizard from "@/components/settings/BaiduSetupWizard";

export default async function DownloadServiceSettingsPage() {
  const t = await getTranslations("Navigation");
  return (
    <>
      <AdminPageHeader
        title={t("downloadServices")}
        description={t("downloadServicesDescription")}
      />
      <div className="flex flex-col gap-4">
        <BaiduSetupWizard />
      </div>
    </>
  );
}
