import db from "@/lib/db";
import { listNotifications, notificationCount } from "@/lib/notifications";
// Opening the notification center also resumes work left by an earlier server.
import "@/lib/taskRunner";
import NotificationList from "./NotificationList";

export default async function AdminNotificationsPage() {
  return (
    <NotificationList
      initialNotifications={listNotifications(db)}
      initialTotal={notificationCount(db)}
    />
  );
}
