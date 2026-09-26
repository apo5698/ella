"use client";

import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import {
  ChevronRightIcon,
  FileArchiveIcon,
  FileIcon,
  FileVideoIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react";
import { toast } from "sonner";
import { downloadRequest } from "@/components/admin/downloadRequest";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatSize } from "@/lib/format";
import type {
  ArchiveNode,
  DownloadInspection,
} from "@/lib/utilities/downloadTypes";
import { cn } from "@/lib/utils";

/** Indent per level. Depth is shown by indent alone, so nothing can drift. */
const INDENT_PX = 20;

type TreeRow = {
  node: ArchiveNode;
  depth: number;
  expandable: boolean;
  expanded: boolean;
};

function videoNodes(nodes: ArchiveNode[]): ArchiveNode[] {
  return nodes.flatMap((node) => [
    ...(node.kind === "file" && node.video ? [node] : []),
    ...videoNodes(node.children ?? []),
  ]);
}

/** The tree as table rows, skipping what sits inside a collapsed entry. */
function visibleRows(
  nodes: ArchiveNode[],
  collapsed: ReadonlySet<string>,
  depth = 0,
): TreeRow[] {
  return nodes.flatMap((node) => {
    const expandable = Boolean(node.children?.length);
    const expanded = expandable && !collapsed.has(node.path);
    return [
      { node, depth, expandable, expanded },
      ...(expanded ? visibleRows(node.children!, collapsed, depth + 1) : []),
    ];
  });
}

function NodeIcon({
  node,
  expanded,
}: {
  node: ArchiveNode;
  expanded: boolean;
}) {
  const className = "size-4 shrink-0";
  if (node.kind === "directory")
    return expanded ? (
      <FolderOpenIcon className={cn(className, "text-amber-500")} />
    ) : (
      <FolderIcon className={cn(className, "text-amber-500")} />
    );
  if (node.kind === "archive")
    return (
      <FileArchiveIcon className={cn(className, "text-muted-foreground")} />
    );
  if (node.video)
    return <FileVideoIcon className={cn(className, "text-primary")} />;
  return <FileIcon className={cn(className, "text-muted-foreground")} />;
}

function TreeTable({
  tree,
  selected,
  onSelect,
}: {
  tree: ArchiveNode[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const common = useTranslations("Common");
  const errors = useTranslations("Api");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  function toggle(path: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-8" />
          <TableHead className="font-normal text-muted-foreground">
            {common("name")}
          </TableHead>
          <TableHead className="text-right font-normal text-muted-foreground">
            {common("size")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visibleRows(tree, collapsed).map(
          ({ node, depth, expandable, expanded }) => {
            const selectable = node.kind === "file" && node.video !== null;
            return (
              <TableRow
                key={node.path}
                data-state={selected === node.path ? "selected" : undefined}
                onClick={selectable ? () => onSelect(node.path) : undefined}
                className={cn(
                  // An open entry is not a highlighted one.
                  "has-aria-expanded:bg-transparent hover:has-aria-expanded:bg-muted/50",
                  selectable && "cursor-pointer",
                  node.kind === "file" &&
                    !selectable &&
                    "text-muted-foreground",
                )}
              >
                <TableCell className="w-8">
                  {selectable && (
                    <RadioGroupItem value={node.path} aria-label={node.name} />
                  )}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div
                    className="flex items-center gap-1.5"
                    style={{ paddingLeft: depth * INDENT_PX }}
                  >
                    {expandable ? (
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={
                          expanded ? common("collapse") : common("expand")
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle(node.path);
                        }}
                        className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRightIcon
                          className={cn(
                            "size-3.5 transition-transform",
                            expanded && "rotate-90",
                          )}
                        />
                      </button>
                    ) : (
                      <span aria-hidden="true" className="size-4 shrink-0" />
                    )}
                    <NodeIcon node={node} expanded={expanded} />
                    <span className="min-w-0 break-all">{node.name}</span>
                  </div>
                  {node.error && (
                    <p
                      className="mt-1 text-destructive"
                      // Under the name: past the chevron, the icon and gaps.
                      style={{ paddingLeft: depth * INDENT_PX + 44 }}
                    >
                      {errors(node.error as never)}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {node.kind !== "directory" &&
                    (node.size > 0 ? formatSize(node.size) : "0 B")}
                </TableCell>
              </TableRow>
            );
          },
        )}
      </TableBody>
    </Table>
  );
}

/**
 * The files a download kept after its layout was not the expected one, with
 * nested archives opened. Choosing a video imports it under the task's name.
 */
export default function DownloadInspectDialog({
  jobId,
  open,
  onOpenChange,
}: {
  jobId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Downloads");
  const common = useTranslations("Common");
  const [inspection, setInspection] = useState<DownloadInspection | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The row remounts this dialog each time it opens, so the listing is read
  // afresh: choosing a file that fails keeps the download to choose again.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/admin/utilities/downloads/${jobId}/inspect`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        const result = data as DownloadInspection;
        // One video is almost always the one wanted.
        const videos = videoNodes(result.tree);
        setSelected(videos.length === 1 ? videos[0].path : null);
        setInspection(result);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        toast.error(
          cause instanceof Error && cause.message
            ? cause.message
            : t("inspectFailed"),
        );
        onOpenChange(false);
      });
    return () => controller.abort();
  }, [open, jobId, t, onOpenChange]);

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    try {
      await downloadRequest(
        `/api/admin/utilities/downloads/${jobId}/resolve`,
        "POST",
        { path: selected },
      );
      toast.success(t("importStarted"));
      onOpenChange(false);
    } catch (cause) {
      toast.error(
        cause instanceof Error && cause.message
          ? cause.message
          : common("operationFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-5/6 flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("inspectTitle")}</DialogTitle>
          <DialogDescription>{t("inspectDescription")}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
          {!inspection ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <RadioGroup
              aria-label={t("inspectTitle")}
              value={selected ?? ""}
              onValueChange={(value) => setSelected(value as string)}
              disabled={submitting}
              className="block"
            >
              <TreeTable
                tree={inspection.tree}
                selected={selected}
                onSelect={setSelected}
              />
              {inspection.truncated && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("inspectTruncated")}
                </p>
              )}
            </RadioGroup>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {common("cancel")}
          </DialogClose>
          <Button
            disabled={!selected || submitting}
            onClick={() => void submit()}
          >
            {submitting && <Spinner data-icon="inline-start" />}
            {t("useFile")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
