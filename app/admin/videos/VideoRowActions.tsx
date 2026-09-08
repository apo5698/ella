"use client";

import { useState } from "react";
import { EllipsisVerticalIcon, PencilIcon, Trash2Icon } from "lucide-react";
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
import type {
  EditableVideo,
  Video,
  VideoMetadataPatch,
  VideoTagState,
} from "@/lib/types";
import VideoDeleteDialog from "./VideoDeleteDialog";
import VideoEditDialog from "./VideoEditDialog";

type EditorState = {
  video: EditableVideo;
  initialThumbSec: number;
  initialPathExists: boolean;
  tagState: VideoTagState;
};

function defaultThumbSec(duration: number | null) {
  return duration ? Math.min(Math.max(duration * 0.15, 1), 60) : 3;
}

export default function VideoRowActions({
  video,
  onChanged,
  onDeleted,
}: {
  video: Video;
  onChanged: () => void;
  onDeleted: (videoId: number) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);

  async function openEditor() {
    if (editLoading) return;
    setEditLoading(true);
    try {
      const detailResponse = await fetch(`/api/videos/${video.id}`);
      const detail = await detailResponse.json();
      if (!detailResponse.ok) {
        throw new Error(detail.error ?? "无法加载视频信息");
      }

      const pathResponse = await fetch(
        `/api/videos/path-check?path=${encodeURIComponent(detail.path)}&id=${video.id}`,
      );
      const pathCheck = await pathResponse.json();
      if (!pathResponse.ok) {
        throw new Error(pathCheck.error ?? "无法检查视频路径");
      }

      setEditor({
        video: {
          id: detail.id,
          title: detail.title,
          path: detail.path,
          duration_sec: detail.duration_sec,
        },
        initialThumbSec:
          detail.thumbnail_sec ?? defaultThumbSec(detail.duration_sec),
        initialPathExists: pathCheck.exists === true,
        tagState: detail.tagState,
      });
      setEditKey((key) => key + 1);
      setEditOpen(true);
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setEditLoading(false);
    }
  }

  function handleSaved(patch: VideoMetadataPatch) {
    setEditor((current) =>
      current
        ? {
            ...current,
            video: {
              ...current.video,
              title: patch.title,
              path: patch.path,
            },
            initialThumbSec: patch.thumbnailSec ?? current.initialThumbSec,
          }
        : current,
    );
    onChanged();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${video.title}的操作`}
            />
          }
        >
          <EllipsisVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={editLoading}
              onClick={() => void openEditor()}
            >
              <PencilIcon />
              编辑
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon />
              删除
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {editor && (
        <VideoEditDialog
          key={editKey}
          open={editOpen}
          onOpenChange={setEditOpen}
          video={editor.video}
          initialThumbSec={editor.initialThumbSec}
          initialPathExists={editor.initialPathExists}
          tags={editor.tagState.tags}
          rejectedTags={editor.tagState.rejectedTags}
          seriesName={editor.tagState.seriesName}
          onSaved={handleSaved}
          onTagStateChange={(tagState) =>
            setEditor((current) =>
              current ? { ...current, tagState } : current,
            )
          }
        />
      )}

      <VideoDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        videoId={video.id}
        title={video.title}
        onDeleted={() => {
          setDeleteOpen(false);
          toast.success("视频已删除");
          onDeleted(video.id);
        }}
      />
    </>
  );
}
