import { NextResponse } from "next/server";
import db from "@/lib/db";
import {
  markAllNotificationsRead,
  notifyNotificationsChanged,
} from "@/lib/notifications";

export const runtime = "nodejs";

export async function POST() {
  const updated = markAllNotificationsRead(db);
  if (updated > 0) notifyNotificationsChanged();
  return NextResponse.json({ ok: true, updated });
}
