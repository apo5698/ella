"use client";

import { ChevronRight, GripVertical, Pencil, Trash2 } from "lucide-react";
import { AliasBadge, TagBadge } from "@/components/tags/TagBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { TagTreeNode } from "@/lib/types";
import TagStatePopover from "./TagStatePopover";

/** How far each level is indented, in pixels. */
const INDENT = 20;

/**
 * What a row needs to take part in a drag. The gesture itself lives in
 * useTagDrag: a drop concerns two rows and neither of them owns the answer.
 */
export type DragHandlers = {
  active: boolean;
  /** Rows that cannot receive the drop: the dragged tags and their subtrees. */
  blocked: Set<number>;
  target: number | null;
  begin: (id: number, event: React.PointerEvent) => void;
};

/**
 * One tag and everything under it. The row is deliberately plain: the whole
 * hierarchy is drawn at once, so anything heavy here is paid for thousands of
 * times over.
 */
export default function TagNode({
  node,
  depth,
  collapsed,
  selected,
  drag,
  onToggle,
  onSelect,
  onEdit,
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
  onEdit: (node: TagTreeNode) => void;
  onDelete: (node: TagTreeNode) => void;
  onStateChanged: () => Promise<void>;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const isBlocked = drag.active && drag.blocked.has(node.id);
  const isTarget = drag.target === node.id;

  return (
    // Open state is held by the manager rather than by each row: a drag
    // hovering over a shut tag opens it, which the row itself cannot know.
    <Collapsible
      open={hasChildren && !isCollapsed}
      onOpenChange={() => onToggle(node.id)}
    >
      <div
        data-tag-row={node.id}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("[data-row-control]"))
            return;
          onEdit(node);
        }}
        className={cn(
          "group flex cursor-pointer items-start gap-1.5 rounded-md py-1 pr-2",
          isTarget ? "bg-accent ring-2 ring-primary" : "hover:bg-accent/50",
          isBlocked && "opacity-40",
        )}
        style={{ paddingLeft: depth * INDENT + 4 }}
      >
        {/* Ticking a box is a gesture of its own; dragging from it would be a
            misread rather than a shortcut. */}
        <Checkbox
          data-row-control=""
          checked={selected.has(node.id)}
          onCheckedChange={(checked) => onSelect(node.id, checked === true)}
          aria-label={`选择"${node.name}"`}
          className="mt-0.5 mr-1 shrink-0"
        />

        {hasChildren ? (
          <CollapsibleTrigger
            data-row-control=""
            aria-label={isCollapsed ? "展开" : "折叠"}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                !isCollapsed && "rotate-90",
              )}
            />
          </CollapsibleTrigger>
        ) : (
          <span className="size-5 shrink-0" />
        )}

        <div className="flex min-w-0 flex-1 gap-1.5">
          <TagStatePopover
            tagId={node.id}
            name={node.name}
            state={node.reviewState}
            directVideoCount={node.count}
            onChanged={onStateChanged}
          />

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <div className="flex h-5 shrink-0 items-center gap-1.5 text-sm">
              <TagBadge state={node.reviewState}>{node.name}</TagBadge>

              {/* The parent's number covers its whole subtree, which is what
                  selecting it on the home page returns. */}
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {!node.assignable
                  ? node.totalCount
                  : hasChildren && node.totalCount !== node.count
                    ? `${node.count} / ${node.totalCount}`
                    : node.count}
              </span>
            </div>

            {/* The dashed outline is what marks these as aliases; a tooltip
                repeating that would only get in the way of a drag. */}
            {node.aliases.map((alias) => (
              <AliasBadge key={alias} className="shrink-0">
                {alias}
              </AliasBadge>
            ))}
          </div>
        </div>

        {/* Shown outright where there is no hover to reveal them. */}
        <div className="ml-auto flex shrink-0 items-center [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:group-hover:opacity-100">
          <Button
            data-row-control=""
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(node)}
            title="编辑标签"
            className="text-muted-foreground"
          >
            <Pencil />
          </Button>
          <Button
            data-row-control=""
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(node)}
            title="删除标签"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </Button>
          <Button
            data-row-control=""
            type="button"
            variant="ghost"
            size="icon-sm"
            onPointerDown={(event) => drag.begin(node.id, event)}
            aria-label={`拖动"${node.name}"`}
            title="拖动标签"
            className={cn(
              "cursor-grab text-muted-foreground/50 active:cursor-grabbing",
              drag.active && "cursor-grabbing",
            )}
          >
            <GripVertical />
          </Button>
        </div>
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
            onEdit={onEdit}
            onDelete={onDelete}
            onStateChanged={onStateChanged}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
