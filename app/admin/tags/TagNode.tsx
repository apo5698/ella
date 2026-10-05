"use client";

import { useTranslations } from "next-intl";

import Link from "next/link";
import {
  ChevronRightIcon,
  EllipsisIcon,
  GripVerticalIcon,
  MergeIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { AliasBadge, TagBadge } from "@/components/tags/TagBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TagTreeNode } from "@/lib/types";
import TagStatePopover from "./TagStatePopover";

/**
 * What a row needs to take part in a drag. The gesture itself lives in
 * useTagDrag: a drop concerns two rows and neither of them owns the answer.
 */
export type DragHandlers = {
  active: boolean;
  /** Rows that cannot receive the drop: the dragged tags and their subtrees. */
  blocked: Set<number>;
  target: number | null;
  /** Whether the drop on `target` merges into it rather than nesting under it. */
  merge: boolean;
  begin: (id: number, event: React.PointerEvent) => void;
};

/**
 * One tag and everything under it. The row is deliberately plain: a page can
 * draw hundreds of them at once.
 *
 * The dot changes the state, the name opens the tag, and everything else a
 * row can do sits in its menu.
 */
export default function TagNode({
  node,
  depth,
  collapsed,
  selected,
  drag,
  onToggle,
  onSelect,
  onCreateChild,
  onDelete,
  onStateChanged,
}: {
  node: TagTreeNode;
  depth: number;
  collapsed: Set<number>;
  selected: Set<number>;
  drag: DragHandlers;
  onToggle: (id: number) => void;
  onSelect: (id: number, checked: boolean) => void;
  onCreateChild: (node: TagTreeNode) => void;
  onDelete: (node: TagTreeNode) => void;
  onStateChanged: () => Promise<void>;
}) {
  const t = useTranslations("TagNode");
  const manager = useTranslations("TagManager");
  const tagActions = useTranslations("TagActions");
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const isSelected = selected.has(node.id);
  const isBlocked = drag.active && drag.blocked.has(node.id);
  const isTarget = drag.target === node.id;
  const href = `/admin/tags/${node.id}`;

  return (
    // Open state is held by the manager rather than by each row: a drag
    // hovering over a shut tag opens it, which the row itself cannot know.
    <Collapsible
      open={hasChildren && !isCollapsed}
      onOpenChange={() => onToggle(node.id)}
    >
      <div
        data-tag-row={node.id}
        className={cn(
          "relative flex min-h-9 items-center gap-2 rounded-md py-1 pr-1 pl-1",
          isTarget
            ? cn("bg-accent", !drag.merge && "ring-2 ring-primary")
            : isSelected
              ? "bg-muted"
              : "hover:bg-muted/50",
          isBlocked && "opacity-40",
        )}
      >
        {/* On the left, away from the merge zone at the right end, so a drag
            straight down nests rather than merges. */}
        <Button
          data-row-control=""
          type="button"
          variant="ghost"
          size="icon-sm"
          onPointerDown={(event) => drag.begin(node.id, event)}
          aria-label={t("dragNamed", { name: node.name })}
          title={t("drag")}
          className={cn(
            "cursor-grab text-muted-foreground/50 active:cursor-grabbing",
            drag.active && "cursor-grabbing",
          )}
        >
          <GripVerticalIcon />
        </Button>

        {/* Ticking a box is a gesture of its own; dragging from it would be a
            misread rather than a shortcut. */}
        <Checkbox
          data-row-control=""
          checked={isSelected}
          onCheckedChange={(checked) => onSelect(node.id, checked === true)}
          aria-label={t("selectNamed", { name: node.name })}
          className="shrink-0"
        />

        {/* Indented after the checkbox, so the boxes stay in one column. */}
        <div
          className="flex min-w-0 flex-1 items-center gap-1 pl-[calc(var(--depth)*1rem)] sm:pl-[calc(var(--depth)*1.25rem)]"
          style={{ "--depth": depth } as React.CSSProperties}
        >
          {hasChildren ? (
            <CollapsibleTrigger
              data-row-control=""
              aria-label={isCollapsed ? t("expand") : t("collapse")}
              className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <ChevronRightIcon
                className={cn(
                  "size-3.5 transition-transform",
                  !isCollapsed && "rotate-90",
                )}
              />
            </CollapsibleTrigger>
          ) : (
            <span className="size-5 shrink-0" />
          )}

          <TagStatePopover
            tagId={node.id}
            name={node.name}
            state={node.reviewState}
            directVideoCount={node.count}
            onChanged={onStateChanged}
          />

          <TagBadge
            state={node.reviewState}
            title={node.name}
            className="max-w-full shrink hover:underline"
            render={<Link href={href} data-row-control="" />}
          >
            <span className="min-w-0 truncate">{node.name}</span>
          </TagBadge>

          {/* The dashed outline is what marks these as aliases. They are only
              a hint, so they stay on one line, fade out where they run out of
              room, and leave narrow screens to the detail page. */}
          {node.aliases.length > 0 && (
            <div className="ml-1 hidden min-w-0 flex-1 items-center gap-1 overflow-hidden mask-[linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] @xl/tags:flex">
              {node.aliases.map((alias) => (
                <AliasBadge key={alias} className="shrink-0">
                  {alias}
                </AliasBadge>
              ))}
            </div>
          )}
        </div>

        {/* A parent's number covers its whole subtree, which is what selecting
            it on the home page returns. */}
        <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {!node.assignable
            ? node.totalCount
            : hasChildren && node.totalCount !== node.count
              ? `${node.count} / ${node.totalCount}`
              : node.count}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                data-row-control=""
                variant="ghost"
                size="icon-sm"
                aria-label={t("actions", { name: node.name })}
                className="text-muted-foreground"
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href={href} />}>
                <PencilIcon />
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreateChild(node)}>
                <PlusIcon />
                {manager("newChild")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(node)}
              >
                <Trash2Icon />
                {tagActions("delete")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Shown only on the row under the pointer, so the split is visible
            exactly where it applies. It must not be hit-testable: the drag
            reads the row beneath it. */}
        {isTarget && (
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-y-0 right-0 flex w-[min(10rem,40%)] items-center justify-center gap-1.5 rounded-md border-2 border-dashed text-xs",
              drag.merge
                ? "border-primary bg-[color-mix(in_oklab,var(--primary)_20%,var(--background))] text-foreground"
                : "border-border bg-background text-muted-foreground",
            )}
          >
            <MergeIcon className="size-3.5" />
            {manager("dropMerge")}
          </div>
        )}
      </div>

      <CollapsibleContent>
        {node.children.map((child) => (
          <TagNode
            key={child.id}
            node={child}
            depth={depth + 1}
            collapsed={collapsed}
            selected={selected}
            drag={drag}
            onToggle={onToggle}
            onSelect={onSelect}
            onCreateChild={onCreateChild}
            onDelete={onDelete}
            onStateChanged={onStateChanged}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
