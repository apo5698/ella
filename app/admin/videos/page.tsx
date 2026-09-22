import { getTranslations } from "next-intl/server";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import VideoManager from "./VideoManager";

export default async function AdminVideosPage() {
  const t = await getTranslations("Navigation");
  return (
    <>
      <AdminPageHeader title={t("videos")} description="" />
      <VideoManager />
    </>
  );
}
