import { getTranslations } from "next-intl/server";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function POST(req: NextRequest) {
  const t = await getTranslations("Api");
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: t("tagNameRequired") }, { status: 400 });
  }
  db.prepare("UPDATE tags SET clicks = clicks + 1 WHERE name = ?").run(name);
  return NextResponse.json({ ok: true });
}
