import { redirect } from "next/navigation";
import { withSearchParams, type RouteSearchParams } from "@/lib/adminRoutes";

export default async function LegacyTagsPage({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>;
}) {
  redirect(withSearchParams("/admin/tags", await searchParams));
}
