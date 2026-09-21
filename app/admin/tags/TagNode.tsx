"use client";

import {
  ChevronRightIcon,
  GripVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { AliasBadge } from "@/components/tags/TagBadge";
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
        className={cn(
          "group flex items-start gap-1.5 rounded-md py-1 pr-2",
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

        <div className="flex min-w-0 flex-1 gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <div className="flex shrink-0 items-center gap-1.5 text-sm">
              <TagStatePopover
                tagId={node.id}
                name={node.name}
                state={node.reviewState}
                directVideoCount={node.count}
                onChanged={onStateChanged}
              />

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

        {/* Keep actions visible so each operation has an explicit target. */}
        <div className="ml-auto flex shrink-0 items-center [&>button]:pointer-coarse:h-auto [&>button]:pointer-coarse:w-auto [&>button]:pointer-coarse:p-3">
          <Button
            data-row-control=""
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(node)}
            title="编辑标签"
            aria-label={`编辑标签：${node.name}`}
            className="text-muted-foreground"
          >
            <PencilIcon />
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
            <Trash2Icon />
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
            <GripVerticalIcon />
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
