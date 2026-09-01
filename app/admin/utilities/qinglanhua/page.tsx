import { redirect } from "next/navigation";

export default function LegacyQinglanhuaPage() {
  redirect("/admin/utilities/downloader?source=qinglanhua");
}
