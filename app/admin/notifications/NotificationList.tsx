"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AtSignIcon,
  CheckCheckIcon,
  CircleAlertIcon,
  KeyRoundIcon,
  LibraryIcon,
  ShieldAlertIcon,
  SparklesIcon,
  TagsIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dot } from "@/components/ui/dot";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import LocalTime from "@/components/LocalTime";
import { useTaskQueue } from "@/hooks/useTaskQueue";
import { formatNotification } from "@/lib/notificationMessages";
import type { Notification, NotificationType } from "@/lib/notifications";
import { cn } from "@/lib/utils";

type NotificationPresentation = {
  label: string;
  icon: LucideIcon;
  className: string;
};

const TYPE_PRESENTATION: Record<
  NotificationType,
  Omit<NotificationPresentation, "label">
> = {
  TAG_APPROVAL: {
    icon: TagsIcon,
    className: "bg-primary/10 text-primary",
  },
  VIDEO_RETAG: {
    icon: SparklesIcon,
    className: "bg-chart-4/15 text-chart-4",
  },
  VIDEO_CATALOG_SCAN: {
    icon: LibraryIcon,
    className: "bg-success/10 text-success",
  },
  WARNING: {
    icon: TriangleAlertIcon,
    className: "bg-warning text-warning-foreground",
  },
  ERROR: {
    icon: CircleAlertIcon,
    className: "bg-destructive/10 text-destructive",
  },
  MENTIONED: {
    icon: AtSignIcon,
    className: "bg-primary/10 text-primary",
  },
  PASSWORD_EXPIRING: {
    icon: KeyRoundIcon,
    className: "bg-warning text-warning-foreground",
  },
  NEW_LOGIN_DETECTED: {
    icon: ShieldAlertIcon,
    className: "bg-chart-5/15 text-chart-5",
  },
};

function notificationPresentation(
  notification: Notification,
  label: string,
): NotificationPresentation {
  return { label, ...TYPE_PRESENTATION[notification.type] };
}

function NotificationBody({
  notification,
  linkVideo = false,
}: {
  notification: Notification;
  linkVideo?: boolean;
}): ReactNode {
  const t = useTranslations("Notifications");
  const body = formatNotification(t, notification).body;
  const videoId = Number(notification.payload.videoId);
  if (
    linkVideo &&
    notification.type === "VIDEO_RETAG" &&
    Number.isSafeInteger(videoId)
  ) {
    return (
      <Link
        href={`/video/${videoId}`}
        className="text-link underline-offset-4 hover:underline"
      >
        {body}
      </Link>
    );
  }
  return body;
}

function NotificationMeta({
  notification,
  interactiveTime = true,
}: {
  notification: Notification;
  interactiveTime?: boolean;
}) {
  const t = useTranslations("Common");
  const actor =
    typeof notification.payload.actor === "string"
      ? notification.payload.actor
      : t("system");
  return (
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>{actor}</span>
      <span aria-hidden="true">·</span>
      <LocalTime value={notification.createdAt} interactive={interactiveTime} />
    </span>
  );
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: (id: number) => Promise<void>;
}) {
  const t = useTranslations("Notifications");
  const message = formatNotification(t, notification);
  const presentation = notificationPresentation(notification, message.label);
  const Icon = presentation.icon;
  const previewRef = useRef<HTMLSpanElement>(null);
  const [isExpandable, setIsExpandable] = useState(false);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    const update = () => {
      if (
        preview
          .closest("[data-slot='accordion-item']")
          ?.hasAttribute("data-open")
      ) {
        return;
      }
      setIsExpandable(
        preview.scrollHeight > preview.clientHeight + 1 ||
          preview.scrollWidth > preview.clientWidth + 1,
      );
    };
    update();
    const resizeObserver = new ResizeObserver(update);
    const mutationObserver = new MutationObserver(update);
    resizeObserver.observe(preview);
    mutationObserver.observe(preview, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [isExpandable]);

  const summary = (
    <>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full [&>svg]:size-4",
          presentation.className,
        )}
      >
        <Icon aria-hidden="true" />
        <span className="sr-only">{presentation.label}</span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-2 text-sm leading-snug font-semibold text-foreground">
          <span className="min-w-0 whitespace-normal break-words">
            {message.title}
          </span>
          {!notification.isRead && (
            <Dot aria-label={t("unread")} className="bg-primary" />
          )}
        </span>

        <span
          ref={previewRef}
          className={cn(
            "line-clamp-1 text-sm/relaxed font-normal text-muted-foreground group-data-open/notification:hidden",
            notification.type === "ERROR" && "text-destructive",
          )}
        >
          <NotificationBody notification={notification} />
        </span>

        <span className="group-data-open/notification:hidden">
          <NotificationMeta
            notification={notification}
            interactiveTime={false}
          />
        </span>
      </span>
    </>
  );

  return (
    <AccordionItem
      value={String(notification.id)}
      className={cn(
        "group/notification select-text",
        !notification.isRead && "bg-primary/5",
      )}
    >
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-3 p-3">
        {summary}
        <div className="flex items-center gap-1">
          {!notification.isRead && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("markRead")}
              title={t("markRead")}
              onClick={() => void onRead(notification.id)}
            >
              <CheckCheckIcon />
            </Button>
          )}
          {isExpandable && (
            <AccordionTrigger
              aria-label={t("toggleDetails")}
              title={t("toggleDetails")}
              className="size-7 items-center justify-center rounded-md p-1 hover:bg-accent hover:no-underline"
            />
          )}
        </div>
      </div>

      {isExpandable && (
        <AccordionContent className="grid grid-cols-[2.5rem_minmax(0,1fr)_1rem] gap-x-3 gap-y-3 px-1 text-sm/relaxed font-normal text-muted-foreground">
          <div
            className={cn(
              "col-start-2 col-end-3",
              notification.type === "ERROR" && "text-destructive",
            )}
          >
            <NotificationBody notification={notification} linkVideo />
          </div>
          <span className="col-start-2 col-end-3">
            <NotificationMeta notification={notification} />
          </span>
        </AccordionContent>
      )}
    </AccordionItem>
  );
}

function NotificationFeed({
  notifications,
  emptyTitle,
  onRead,
}: {
  notifications: Notification[];
  emptyTitle: string;
  onRead: (id: number) => Promise<void>;
}) {
  const t = useTranslations("Notifications");
  const [expanded, setExpanded] = useState<string[]>([]);

  if (notifications.length === 0) {
    return (
      <Empty className="rounded-xl border">
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Accordion
      multiple
      value={expanded}
      onValueChange={setExpanded}
      className="rounded-xl"
    >
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRead={onRead}
        />
      ))}
    </Accordion>
  );
}

export default function NotificationList({
  initialNotifications,
  initialTotal,
}: {
  initialNotifications: Notification[];
  initialTotal: number;
}) {
  const t = useTranslations("Notifications");
  const common = useTranslations("Common");
  const queue = useTaskQueue();
  const notifications = queue.connected
    ? queue.notifications
    : initialNotifications;
  const total = queue.connected ? queue.total : initialTotal;
  const unreadCount = queue.connected
    ? queue.unreadCount
    : initialNotifications.filter((notification) => !notification.isRead)
        .length;
  const [reading, setReading] = useState<number | "all" | null>(null);

  async function postRead(url: string, id: number | "all") {
    if (reading !== null) return;
    setReading(id);
    try {
      const response = await fetch(url, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? common("operationFailed"));
      }
      if (id === "all") {
        toast.success(t("markedAllRead", { count: unreadCount }));
      }
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setReading(null);
    }
  }

  const unreadNotifications = notifications.filter(
    (notification) => !notification.isRead,
  );

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <AdminPageHeader
          title={t("pageTitle")}
          description={t("total", { count: total })}
        />
        <div className="pt-1">
          <Button
            size="sm"
            disabled={reading !== null || unreadCount === 0}
            onClick={() => postRead("/api/notifications/read", "all")}
          >
            <CheckCheckIcon data-icon="inline-start" />
            {t("markAllRead")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all" className="gap-3">
        <TabsList variant="line">
          <TabsTrigger value="all">
            {t("all")}
            <Badge variant="secondary">{total}</Badge>
          </TabsTrigger>
          <TabsTrigger value="unread">
            {t("unread")}
            {unreadCount > 0 && (
              <Badge variant="secondary">{unreadCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="system">
            {t("system")}
            <Badge variant="secondary">{total}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <NotificationFeed
            notifications={notifications}
            emptyTitle={t("empty")}
            onRead={(id) => postRead(`/api/notifications/${id}/read`, id)}
          />
        </TabsContent>
        <TabsContent value="unread">
          <NotificationFeed
            notifications={unreadNotifications}
            emptyTitle={t("emptyUnread")}
            onRead={(id) => postRead(`/api/notifications/${id}/read`, id)}
          />
        </TabsContent>
        <TabsContent value="system">
          <NotificationFeed
            notifications={notifications}
            emptyTitle={t("emptySystem")}
            onRead={(id) => postRead(`/api/notifications/${id}/read`, id)}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
