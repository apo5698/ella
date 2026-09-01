import { redirect } from "next/navigation";

export default function LegacyHttpSourcePage() {
  redirect("/admin/utilities/downloader?source=httpsource");
}
