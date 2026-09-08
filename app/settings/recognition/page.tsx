import AdminPageHeader from "@/components/admin/AdminPageHeader";
import RecognitionSettings from "@/components/settings/RecognitionSettings";

export default function RecognitionSettingsPage() {
  return (
    <>
      <AdminPageHeader
        title="智能识别"
        description="配置识别模型、视频抽帧和自动标签任务。"
      />
      <RecognitionSettings />
    </>
  );
}
