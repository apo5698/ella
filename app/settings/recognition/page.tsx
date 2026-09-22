import { getTranslations } from "next-intl/server";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import RecognitionSettings from "@/components/settings/RecognitionSettings";

export default async function RecognitionSettingsPage() {
  const t = await getTranslations("Navigation");
  return (
    <>
      <AdminPageHeader
        title={t("recognition")}
        description={t("recognitionDescription")}
      />
      <RecognitionSettings />
    </>
  );
}
