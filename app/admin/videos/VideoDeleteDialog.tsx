"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { Trash2Icon } from "lucide-react";
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
  const t = useTranslations("VideoDelete");
  const common = useTranslations("Common");
  const DELETE_OPTIONS: {
    mode: DeleteMode;
    label: string;
    description: string;
    destructive?: boolean;
  }[] = [
    {
      mode: "record",
      label: t("record"),
      description: t("recordDescription"),
    },
    {
      mode: "trash",
      label: t("trash"),
      description: t("trashDescription"),
    },
    {
      mode: "file",
      label: t("file"),
      description: t("fileDescription"),
      destructive: true,
    },
  ];
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
        setError(data.error ?? t("failed"));
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
          <DialogTitle>{t("title")}</DialogTitle>
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
            {common("cancel")}
          </Button>
          <Button variant="destructive" onClick={remove} disabled={deleting}>
            <Trash2Icon />
            {deleting ? t("deleting") : common("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
