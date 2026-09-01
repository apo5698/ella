import { redirect } from "next/navigation";
import { withSearchParams, type RouteSearchParams } from "@/lib/adminRoutes";

export default async function LegacySettingsPage({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>;
}) {
  redirect(withSearchParams("/admin/settings", await searchParams));
}
