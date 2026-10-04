import { Suspense } from "react";
import { connection } from "next/server";
import HomeView from "@/components/video/HomeView";
import LoadingSpinner from "@/components/LoadingSpinner";
import db from "@/lib/db";
import { loadTagCounts } from "@/lib/tagHierarchy";
import { loadHome } from "@/lib/videoCards";

export default async function Home() {
  // The library changes at run time, so the page is never built ahead.
  await connection();
  return (
    // The view reads its filters from the URL on the client.
    <Suspense fallback={<LoadingSpinner />}>
      <HomeView home={loadHome(db)} tags={loadTagCounts(db)} />
    </Suspense>
  );
}
