import { redirect } from "next/navigation";
import { withSearchParams, type RouteSearchParams } from "@/lib/adminRoutes";

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>;
}) {
  redirect(withSearchParams("/admin/videos", await searchParams));
}
