import { NextResponse } from "next/server";
import db from "@/lib/db";
import {
  getNotification,
  markNotificationRead,
  notifyNotificationsChanged,
} from "@/lib/notifications";

export const runtime = "nodejs";

/** Marks one notification as read. The id is the complete request payload. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const notificationId = Number(id);
  if (
    !Number.isSafeInteger(notificationId) ||
    notificationId <= 0 ||
    !getNotification(db, notificationId)
  ) {
    return NextResponse.json({ error: "通知不存在" }, { status: 404 });
  }

  const updated = markNotificationRead(db, notificationId);
  if (updated) notifyNotificationsChanged();
  return NextResponse.json({ ok: true, updated });
}
