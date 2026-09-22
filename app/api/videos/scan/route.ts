import { getTranslations } from "next-intl/server";
import db from "@/lib/db";
import { enqueueCatalogScan } from "@/lib/taskRunner";

export const runtime = "nodejs";

export async function POST() {
  const t = await getTranslations("Api");
  const taskId = enqueueCatalogScan(db);
  if (taskId === null) {
    return Response.json({ error: t("scanQueued") }, { status: 409 });
  }

  return Response.json({ taskId }, { status: 202 });
}
