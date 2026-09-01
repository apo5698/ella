"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DeleteMode } from "@/app/api/videos/[id]/route";

const DELETE_OPTIONS: {
  mode: DeleteMode;
  label: string;
  description: string;
  destructive?: boolean;
}[] = [
  {
    mode: "record",
    label: "仅移除记录",
    description:
      "从库中删除该视频及其标签，文件保留在原位置。重新扫描后会再次加入。",
  },
  {
    mode: "trash",
    label: "移至回收目录",
    description: "删除记录，文件移动至视频根目录下的 .trash，扫描时不再收录。",
  },
  {
    mode: "file",
    label: "删除记录与文件",
    description: "删除记录，并永久删除该文件。此操作无法撤销。",
    destructive: true,
  },
];

export default function VideoDeleteDialog({
  open,
  onOpenChange,
  videoId,
  title,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: number;
  title: string;
  onDeleted: () => void;
}) {
  // Opens on the option that leaves the file untouched.
  const [mode, setMode] = useState<DeleteMode>("record");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/videos/${videoId}?mode=${mode}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "删除失败");
        return;
      }
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>删除视频</DialogTitle>
          <DialogDescription className="break-all">{title}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {DELETE_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              aria-pressed={mode === option.mode}
              onClick={() => setMode(option.mode)}
              className={cn(
                "rounded-lg border p-3 text-left transition",
                mode === option.mode
                  ? option.destructive
                    ? "border-destructive bg-destructive/5"
                    : "border-primary bg-accent"
                  : "border-border hover:bg-accent/50",
              )}
            >
              <div
                className={cn(
                  "text-sm font-medium",
                  option.destructive && "text-destructive",
                )}
              >
                {option.label}
              </div>
              <div className="mt-0.5 text-muted-foreground">
                {option.description}
              </div>
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="destructive" onClick={remove} disabled={deleting}>
            <Trash2 />
            {deleting ? "删除中" : "删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
