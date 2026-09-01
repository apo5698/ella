"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EllipsisVertical, Pencil, Sparkles, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import VideoDeleteDialog from "./VideoDeleteDialog";
import VideoEditDialog from "./VideoEditDialog";
import type {
  EditableVideo,
  VideoDetailTag,
  VideoMetadataPatch,
  VideoTagState,
} from "@/lib/types";

export default function VideoActions({
  video,
  initialThumbSec,
  initialPathExists,
  tags,
  rejectedTags,
  seriesName,
  onSaved,
  onTagStateChange,
}: {
  video: EditableVideo;
  initialThumbSec: number;
  initialPathExists: boolean;
  tags: VideoDetailTag[];
  rejectedTags: string[];
  seriesName: string | null;
  onSaved: (patch: VideoMetadataPatch) => void;
  onTagStateChange: (state: VideoTagState) => void;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [retagging, setRetagging] = useState(false);
  // The dialog stays mounted once opened, so a new key gives each visit a form
  // that starts from the record as it now stands.
  const [editKey, setEditKey] = useState(0);

  async function queueRetag() {
    if (retagging) return;
    setRetagging(true);
    try {
      const response = await fetch(`/api/videos/${video.id}/retag`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "无法加入任务队列");
      toast.success(data.queued ? "已加入任务队列" : "该视频已在任务队列中");
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setRetagging(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="icon" aria-label="操作" />}
        >
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem
            onClick={() => {
              setEditKey((n) => n + 1);
              setEditOpen(true);
            }}
          >
            <Pencil />
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={retagging}
            onClick={() => void queueRetag()}
          >
            <Sparkles />
            重新识别标签
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <VideoEditDialog
        key={editKey}
        open={editOpen}
        onOpenChange={setEditOpen}
        video={video}
        initialThumbSec={initialThumbSec}
        initialPathExists={initialPathExists}
        tags={tags}
        rejectedTags={rejectedTags}
        seriesName={seriesName}
        onSaved={onSaved}
        onTagStateChange={onTagStateChange}
      />

      <VideoDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        videoId={video.id}
        title={video.title}
        // The record is gone, so this page has nothing left to show.
        onDeleted={() => router.push("/")}
      />
    </>
  );
}
