import AdminPageHeader from "@/components/admin/AdminPageHeader";
import VideoManager from "@/app/videos/VideoManager";

export default function AdminVideosPage() {
  return (
    <>
      <AdminPageHeader title="视频管理" description="" />
      <VideoManager />
    </>
  );
}
