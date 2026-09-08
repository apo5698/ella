"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import TagImpactAnalysis, { type TagImpactRequest } from "./TagImpactAnalysis";

/**
 * Confirming an operation, with what it will do stated above the buttons.
 *
 * Mount this only while it should be open, keyed on what it acts on, so each
 * decision starts fresh.
 */
export default function TagConfirmDialog({
  title,
  subject,
  request,
  confirmLabel = "删除",
  confirmVariant = "destructive",
  onOpenChange,
  onConfirm,
}: {
  title: React.ReactNode;
  /** What is being acted on, when a title cannot name all of it. */
  subject?: React.ReactNode;
  request: TagImpactRequest;
  confirmLabel?: string;
  confirmVariant?: React.ComponentProps<typeof Button>["variant"];
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/* A column rather than the default grid, so the impact panel can be
          handed the room the title and buttons do not use. */}
      <DialogContent className="flex max-h-5/6 flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {subject && <div>{subject}</div>}
        <TagImpactAnalysis request={request} />

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
          <Button variant={confirmVariant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
