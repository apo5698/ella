"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import Link from "next/link";
import {
  EllipsisVerticalIcon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Video } from "@/lib/types";
import VideoDeleteDialog from "./VideoDeleteDialog";

export default function VideoRowActions({
  video,
  editHref,
  onDeleted,
}: {
  video: Video;
  editHref: string;
  onDeleted: (videoId: number) => void;
}) {
  const t = useTranslations("VideoActions");
  const edit = useTranslations("VideoEdit");
  const common = useTranslations("Common");
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("actions", { title: video.title })}
            />
          }
        >
          <EllipsisVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link href={editHref} />}>
              <PencilIcon />
              {t("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <Link
                  href={`/video/${video.id}`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <PlayIcon />
              {edit("openPlayer")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon />
              {common("delete")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <VideoDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        videoId={video.id}
        title={video.title}
        onDeleted={() => {
          setDeleteOpen(false);
          toast.success(t("deleted"));
          onDeleted(video.id);
        }}
      />
    </>
  );
}
