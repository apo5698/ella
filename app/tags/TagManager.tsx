"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { InlineTagBadge, TagBadge } from "@/components/tags/TagBadge";
import { Button } from "@/components/ui/button";
import SearchInput from "@/components/SearchInput";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import TagAutocomplete from "@/components/TagAutocomplete";
import ListPagination from "@/components/ListPagination";
import { TAG_DOT_LEGEND } from "@/components/tags/tag-presentation";
import { cn } from "@/lib/utils";
import { normalizeSearchText, pinyinSearchForms } from "@/lib/pinyinSearch";
import { isManagerPageSize, MANAGER_PAGE_SIZES } from "@/lib/pagination";
import {
  parseTagCategories,
  TAG_CATEGORIES,
  tagCategory,
  type TagCategory,
} from "@/lib/tagCategory";
import {
  DEFAULT_TAG_SORT,
  isTagSort,
  sortTagTree,
  TAG_SORT_LABELS,
  TAG_SORT_OPTIONS,
  type TagSort,
} from "@/lib/tagSort";
import TagNode, { type DragHandlers } from "./TagNode";
import TagImpactAnalysis, { type TagImpactRequest } from "./TagImpactAnalysis";
import TagConfirmDialog from "./TagConfirmDialog";
import { useTagDrag } from "./useTagDrag";
import type { TagTreeNode } from "@/lib/types";

/** How many of the selected names the batch dialogs spell out. */
const NAMES_SHOWN = 12;

/** How long a drag rests over a shut tag before it opens. */
const SPRING_MS = 600;

function flatten(nodes: TagTreeNode[]): TagTreeNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

/**
 * Keeps a tag when its own name or one of its aliases matches, and keeps a
 * parent whose descendants matched so the match stays reachable. A tag that
 * matched brings its whole subtree with it.
 */
function filterTree(
  nodes: TagTreeNode[],
  q: string,
  searchIndex: Map<number, string[]>,
): TagTreeNode[] {
  const out: TagTreeNode[] = [];
  for (const node of nodes) {
    const hit =
      searchIndex.get(node.id)?.some((form) => form.includes(q)) ?? false;
    const children = hit
      ? node.children
      : filterTree(node.children, q, searchIndex);
    if (hit || children.length > 0) out.push({ ...node, children });
  }
  return out;
}

/**
 * Keeps tags of the shown groups, and the parent path needed to reach each
 * one: a hidden group still draws the parent that leads to a shown tag.
 */
function filterCategories(
  nodes: TagTreeNode[],
  shown: ReadonlySet<TagCategory>,
): TagTreeNode[] {
  const out: TagTreeNode[] = [];
  for (const node of nodes) {
    const children = filterCategories(node.children, shown);
    if (shown.has(tagCategory(node)) || children.length > 0) {
      out.push({ ...node, children });
    }
  }
  return out;
}

type BatchAction = "parent" | "merge" | "delete" | "exclude" | "restore";

/** The tree arrives rendered from the server; only edits fetch it again. */
export default function TagManager({
  initialTree,
  initialQuery,
  initialPage,
  initialPageSize,
  initialCategories,
  initialSort,
}: {
  initialTree: TagTreeNode[];
  initialQuery: string;
  initialPage: number;
  initialPageSize: number;
  initialCategories: TagCategory[];
  initialSort: TagSort;
}) {
  const router = useRouter();
  const [tree, setTree] = useState<TagTreeNode[]>(initialTree);
  const [query, setQuery] = useState(initialQuery);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pageSize, setPageSize] = useState<number>(() =>
    isManagerPageSize(initialPageSize)
      ? initialPageSize
      : MANAGER_PAGE_SIZES[0],
  );
  const [page, setPage] = useState(() =>
    Number.isInteger(initialPage) && initialPage > 0 ? initialPage : 1,
  );
  const [categories, setCategories] = useState<Set<TagCategory>>(
    () => new Set(initialCategories),
  );
  // Validated like the other props restored from the URL, so the Select is
  // controlled from its first render even if the value that arrives is not one
  // of the options.
  const [sort, setSort] = useState<TagSort>(() =>
    isTagSort(initialSort) ? initialSort : DEFAULT_TAG_SORT,
  );
  const [creatingUnder, setCreatingUnder] = useState<TagTreeNode | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [batch, setBatch] = useState<BatchAction | null>(null);
  // The tag chosen in a batch dialog. A null `name` means the top level, which
  // only the parent dialog offers.
  const [picked, setPicked] = useState<{ name: string | null } | null>(null);
  const [deleting, setDeleting] = useState<TagTreeNode | null>(null);
  const [busy, setBusy] = useState(false);
  // Shown inside the batch dialog when one is open, and above the tree when
  // the failure came from a drop, which has no dialog to report into.
  const [error, setError] = useState("");

  const updatePaginationUrl = useCallback(
    (
      nextPage: number,
      nextPageSize: number,
      mode: "push" | "replace",
      filters?: {
        query?: string;
        categories?: ReadonlySet<TagCategory>;
        sort?: TagSort;
      },
    ) => {
      const params = new URLSearchParams(window.location.search);
      if (filters?.query !== undefined) {
        if (filters.query) params.set("q", filters.query);
        else params.delete("q");
      }
      if (filters?.categories !== undefined) {
        const shown = TAG_CATEGORIES.filter((id) =>
          filters.categories!.has(id),
        );
        if (shown.length === TAG_CATEGORIES.length) params.delete("types");
        else params.set("types", shown.join(","));
      }
      if (filters?.sort !== undefined) {
        if (filters.sort !== DEFAULT_TAG_SORT) params.set("sort", filters.sort);
        else params.delete("sort");
      }
      if (nextPage > 1) params.set("page", String(nextPage));
      else params.delete("page");
      params.set("pageSize", String(nextPageSize));
      const queryString = params.toString();
      const url = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
      window.history[mode === "push" ? "pushState" : "replaceState"](
        null,
        "",
        url,
      );
    },
    [],
  );

  useEffect(() => {
    const restorePagination = () => {
      const params = new URLSearchParams(window.location.search);
      const urlPage = Number(params.get("page"));
      const urlPageSize = Number(params.get("pageSize"));
      const urlSort = params.get("sort");
      setQuery(params.get("q") ?? "");
      setCategories(parseTagCategories(params.get("types") ?? undefined));
      setSort(isTagSort(urlSort) ? urlSort : DEFAULT_TAG_SORT);
      setPage(Number.isInteger(urlPage) && urlPage > 0 ? urlPage : 1);
      setPageSize(
        isManagerPageSize(urlPageSize) ? urlPageSize : MANAGER_PAGE_SIZES[0],
      );
    };
    window.addEventListener("popstate", restorePagination);
    return () => window.removeEventListener("popstate", restorePagination);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/tags/tree");
    const data = await res.json();
    setTree(data.tree ?? []);
  }, []);

  const all = useMemo(() => flatten(tree), [tree]);
  const index = useMemo(
    () => new Map(all.map((node) => [node.name, node])),
    [all],
  );
  const byId = useMemo(
    () => new Map(all.map((node) => [node.id, node])),
    [all],
  );
  const searchIndex = useMemo(
    () =>
      new Map(
        all.map((node) => [
          node.id,
          [node.name, ...node.aliases].flatMap(pinyinSearchForms),
        ]),
      ),
    [all],
  );

  const trimmed = normalizeSearchText(query);
  const searched = useMemo(
    () => (trimmed ? filterTree(tree, trimmed, searchIndex) : tree),
    [tree, trimmed, searchIndex],
  );
  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(
      TAG_CATEGORIES.map((category) => [category, 0]),
    ) as Record<TagCategory, number>;
    for (const node of flatten(searched)) counts[tagCategory(node)] += 1;
    return counts;
  }, [searched]);
  const filtered = useMemo(
    () =>
      categories.size === TAG_CATEGORIES.length
        ? searched
        : filterCategories(searched, categories),
    [categories, searched],
  );
  const visible = useMemo(() => sortTagTree(filtered, sort), [filtered, sort]);
  // Pagination is by roots so a parent and its descendants never land on
  // different pages. The visible row count can therefore exceed pageSize.
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRoots = visible.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const selectedNames = [...selected]
    .map((id) => byId.get(id)?.name)
    .filter((name): name is string => Boolean(name));
  const selectedTags = [...selected]
    .map((id) => byId.get(id))
    .filter((node): node is TagTreeNode => Boolean(node));
  const selectedRejected = [...selected].some(
    (id) => byId.get(id)?.reviewState === "excluded",
  );

  function toggle(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function select(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectShown() {
    setSelected(new Set(flatten(pageRoots).map((node) => node.id)));
  }

  function toggleCategory(category: TagCategory, shown: boolean) {
    const next = new Set(categories);
    if (shown) next.add(category);
    else next.delete(category);
    setCategories(next);
    setPage(1);
    updatePaginationUrl(1, pageSize, "replace", { categories: next });
  }

  function startCreate(parent: TagTreeNode | null) {
    setCreatingUnder(parent);
    setCreating(true);
    setNewName("");
    setCreateError("");
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: creatingUnder?.id ?? null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setCreateError(data.error ?? "创建失败，请重试。");
      return;
    }
    // A new child is worth seeing, so its parent is opened if it was shut.
    if (creatingUnder) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(creatingUnder.id);
        return next;
      });
    }
    setCreating(false);
    await refresh();
  }

  function openBatch(action: BatchAction) {
    setBatch(action);
    setPicked(null);
    setError("");
  }

  /**
   * What the pending batch would do. Built from the selection and the tag
   * picked in the dialog, and null until there is something to describe.
   */
  const batchImpact: TagImpactRequest | null = (() => {
    const ids = [...selected];
    if (ids.length === 0) return null;
    if (batch === "delete") return { action: "delete", ids };
    if (batch === "exclude") return { action: "exclude", ids };
    if (batch === "restore") return { action: "restore", ids };
    if (picked === null) return null;
    if (batch === "parent") {
      if (picked.name === null) return { action: "move", ids, parentId: null };
      const known = index.get(picked.name);
      return known
        ? { action: "move", ids, parentId: known.id }
        : { action: "move", ids, parentId: null, parentName: picked.name };
    }
    if (batch === "merge" && picked.name) {
      const target = index.get(picked.name);
      if (target)
        return { action: "merge", sourceIds: ids, targetId: target.id };
    }
    return null;
  })();

  /** Runs what the panel above has just described. */
  async function applyBatch() {
    if (picked === null) return;
    const ids = [...selected];
    if (batch === "parent") {
      const parentId =
        picked.name === null ? null : await idForName(picked.name);
      if (picked.name !== null && parentId === null) return;
      await runBatch(
        "/api/tags/batch",
        { action: "setParent", ids, parentId },
        picked.name === null ? (
          `${ids.length} 个标签已移至顶级`
        ) : (
          <>
            {ids.length} 个标签已移至
            <InlineTagBadge
              state={index.get(picked.name)?.reviewState ?? "approved"}
            >
              {picked.name}
            </InlineTagBadge>
            下
          </>
        ),
      );
      return;
    }
    if (batch === "merge" && picked.name) {
      const targetId = index.get(picked.name)?.id;
      if (targetId === undefined) {
        setError("目标标签不存在。");
        return;
      }
      await runBatch(
        "/api/tags/merge",
        { sourceIds: ids, targetId },
        <>
          {ids.length} 个标签已合并到
          <InlineTagBadge state={index.get(picked.name)?.reviewState}>
            {picked.name}
          </InlineTagBadge>
        </>,
      );
    }
  }

  /**
   * `done` is announced as a toast. A drop has no dialog to report into, and
   * a rearrangement several rows away is easy to miss otherwise.
   */
  async function post(
    url: string,
    body: unknown,
    done: React.ReactNode,
  ): Promise<boolean> {
    setBusy(true);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message = data.error ?? "操作失败，请重试。";
      // Shown in the dialog when one is open, and as a toast when the failure
      // came from a drop.
      setError(message);
      if (batch === null) toast.error(message);
      return false;
    }
    toast.success(done);
    await refresh();
    return true;
  }

  /** The row's own delete. One dialog serves every row rather than each row
   *  carrying its own, which at this list length is thousands of them. */
  async function removeTag(node: TagTreeNode) {
    const res = await fetch(`/api/tags/${node.id}`, { method: "DELETE" });
    setDeleting(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "删除失败，请重试。");
      return;
    }
    toast.success(
      <>
        已删除标签
        <InlineTagBadge state={node.reviewState}>{node.name}</InlineTagBadge>
      </>,
    );
    await refresh();
  }

  async function runBatch(url: string, body: unknown, done: React.ReactNode) {
    if (!(await post(url, body, done))) return;
    setBatch(null);
    setSelected(new Set());
  }

  // --- dragging ------------------------------------------------------------
  // Dropping one tag on another makes it a child. Merging is deliberately not
  // a drop: it rewrites video tags and cannot be undone, so it stays behind an
  // explicit choice.

  // Dragging a row that is part of the selection moves the whole selection,
  // which is what makes rearranging seventy tags bearable.
  const idsFor = useCallback(
    (id: number) => (selected.has(id) ? [...selected] : [id]),
    [selected],
  );

  /** The dragged tags and their subtrees, none of which can receive the drop. */
  const blockedFor = useCallback(
    (ids: number[]) => {
      const out = new Set<number>();
      for (const id of ids) {
        const node = byId.get(id);
        if (node) for (const inside of flatten([node])) out.add(inside.id);
      }
      return out;
    },
    [byId],
  );

  const applyDrop = useCallback(
    (ids: number[], parentId: number | null) => {
      const parent = parentId === null ? null : byId.get(parentId);
      void post(
        "/api/tags/batch",
        { action: "setParent", ids, parentId },
        parent === null ? (
          `${ids.length} 个标签已移至顶级`
        ) : (
          <>
            {ids.length} 个标签已移至
            <InlineTagBadge state={parent?.reviewState}>
              {parent?.name}
            </InlineTagBadge>
            下
          </>
        ),
      );
    },
    // post reads the current tree through refresh, and nothing it closes over
    // changes what this call should send.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byId],
  );

  const dragState = useTagDrag({ idsFor, blockedFor, onDrop: applyDrop });

  const drag: DragHandlers = {
    active: dragState.active,
    blocked: dragState.blocked,
    target: typeof dragState.target === "number" ? dragState.target : null,
    begin: dragState.begin,
  };

  // A tag shut over during a drag opens on its own, so a family can be dropped
  // into without breaking off to expand it first.
  const springTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (springTimer.current) clearTimeout(springTimer.current);
    const over = dragState.target;
    if (typeof over !== "number" || !collapsed.has(over)) return;
    springTimer.current = setTimeout(() => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(over);
        return next;
      });
    }, SPRING_MS);
    return () => {
      if (springTimer.current) clearTimeout(springTimer.current);
    };
  }, [dragState.target, collapsed]);

  /**
   * Turns the name picked in a batch dialog into an id, creating the tag when
   * it is new. Choosing a parent that does not exist yet is the common case:
   * grouping tags is usually what introduces the tag they are grouped under.
   */
  async function idForName(name: string): Promise<number | null> {
    const known = index.get(name);
    if (known) return known.id;
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "创建失败，请重试。");
      return null;
    }
    return (await res.json()).id as number;
  }

  /** What the batch dialogs are about to act on, shown in each of them. */
  const chosen = (
    <div className="flex flex-wrap gap-1">
      {selectedTags.slice(0, NAMES_SHOWN).map((tag) => (
        <TagBadge key={tag.id} state={tag.reviewState}>
          {tag.name}
        </TagBadge>
      ))}
      {selectedNames.length > NAMES_SHOWN && (
        <Badge variant="outline" className="text-muted-foreground">
          另有 {selectedNames.length - NAMES_SHOWN} 个
        </Badge>
      )}
    </div>
  );

  const paginationControls = visible.length > 0 && (
    <ListPagination
      page={currentPage}
      totalPages={pageCount}
      buttonSize="sm"
      className="gap-3"
      pageSize={{
        value: pageSize,
        options: MANAGER_PAGE_SIZES,
        label: "每页标签",
        onChange: (nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
          updatePaginationUrl(1, nextPageSize, "replace");
        },
      }}
      onPageChange={(nextPage) => {
        setPage(nextPage);
        updatePaginationUrl(nextPage, pageSize, "push");
      }}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <SearchInput
          value={query}
          onValueChange={(nextQuery) => {
            setQuery(nextQuery);
            setPage(1);
            updatePaginationUrl(1, pageSize, "replace", { query: nextQuery });
          }}
          placeholder="搜索标签、别名或拼音"
          className="basis-full sm:flex-1"
        />
        <Select
          value={sort}
          onValueChange={(value) => {
            if (!isTagSort(value)) return;
            setSort(value);
            setPage(1);
            updatePaginationUrl(1, pageSize, "replace", { sort: value });
          }}
        >
          <SelectTrigger aria-label="排序">
            <SelectValue>
              {(value: TagSort) => TAG_SORT_LABELS[value] ?? "排序"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {TAG_SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={selectShown}>
          全选当前
        </Button>
        <Button onClick={() => startCreate(null)}>
          <Plus data-icon="inline-start" />
          新建标签
        </Button>
      </div>

      {/* The legend and the display filter are one control: each dot names a
          group, and its switch decides whether that group is listed. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span>显示</span>
        {TAG_DOT_LEGEND.map((item) => (
          <label
            key={item.id}
            className="flex cursor-pointer items-center gap-1.5"
          >
            <Switch
              size="sm"
              aria-label={`显示${item.label}标签`}
              checked={categories.has(item.id)}
              onCheckedChange={(checked) => toggleCategory(item.id, checked)}
            />
            <span
              aria-hidden="true"
              className={cn("size-2 shrink-0 rounded-full", item.className)}
            />
            {item.label}
            <span className="tabular-nums text-muted-foreground">
              {categoryCounts[item.id]}
            </span>
          </label>
        ))}
      </div>

      {selected.size > 0 ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card/80 px-3 py-2 backdrop-blur-md">
          <span className="text-xs">已选择 {selected.size} 个标签</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openBatch("parent")}
            >
              设置父标签
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openBatch("merge")}
            >
              合并到
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openBatch("exclude")}
            >
              排除
            </Button>
            {/* Offered only when the selection holds something to restore, so
                the bar stays as short as the situation allows. */}
            {selectedRejected && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openBatch("restore")}
              >
                取消排除
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => openBatch("delete")}
            >
              删除
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              取消选择
            </Button>
          </div>
        </div>
      ) : (
        <span className="text-muted-foreground text-xs">
          共 {all.length} 个标签
        </span>
      )}

      {error && !batch && <p className="text-sm text-destructive">{error}</p>}

      {paginationControls}

      {pageRoots.length === 0 ? (
        <Empty className="rounded-xl border">
          <EmptyHeader>
            <EmptyTitle>
              {categories.size === 0 ? "未选择标签类型" : "未找到匹配的标签"}
            </EmptyTitle>
            <EmptyDescription>
              {categories.size === 0
                ? "请至少开启一种类型。"
                : "请调整搜索词或显示类型。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-xl border p-2">
          {pageRoots.map((node) => (
            <TagNode
              key={node.id}
              node={node}
              depth={0}
              collapsed={collapsed}
              selected={selected}
              drag={drag}
              onToggle={toggle}
              onSelect={select}
              onEdit={(tag) => {
                const from = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                router.push(
                  `/admin/tags/${tag.id}?from=${encodeURIComponent(from)}`,
                );
              }}
              onDelete={setDeleting}
              onStateChanged={refresh}
            />
          ))}
        </div>
      )}

      {paginationControls}

      {dragState.active && (
        <>
          {/* Fixed rather than placed in the list: a strip inserted above the
              tree would push every row down the moment the drag began, moving
              the intended target out from under the pointer. */}
          <div
            data-drop-root=""
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 border-t border-dashed py-4 text-center text-sm backdrop-blur-sm transition-colors",
              dragState.target === "root"
                ? "border-primary bg-accent text-foreground"
                : "border-border bg-background/90 text-muted-foreground",
            )}
          >
            拖放至此移至顶级
          </div>
          {dragState.cursor && (
            <div
              // Must not be hit-testable: the drop target is whatever sits
              // under the pointer, and this follows the pointer.
              className="pointer-events-none fixed z-50 translate-x-3.5 translate-y-3.5 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
              style={{
                left: dragState.cursor.x,
                top: dragState.cursor.y,
              }}
            >
              {dragState.ids.length === 1
                ? (() => {
                    const dragged = byId.get(dragState.ids[0]);
                    return dragged ? (
                      <TagBadge state={dragged.reviewState}>
                        {dragged.name}
                      </TagBadge>
                    ) : null;
                  })()
                : `${dragState.ids.length} 个标签`}
            </div>
          )}
        </>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {creatingUnder ? (
                <>
                  在
                  <InlineTagBadge state={creatingUnder.reviewState}>
                    {creatingUnder.name}
                  </InlineTagBadge>
                  下新建标签
                </>
              ) : (
                "新建标签"
              )}
            </DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="new-tag-name">名称</FieldLabel>
            <Input
              id="new-tag-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                void create();
              }}
              autoComplete="off"
            />
            {createError ? (
              <FieldDescription className="text-destructive">
                {createError}
              </FieldDescription>
            ) : (
              creatingUnder && (
                <FieldDescription>
                  筛选
                  <InlineTagBadge state={creatingUnder.reviewState}>
                    {creatingUnder.name}
                  </InlineTagBadge>
                  时一并返回该标签的视频
                </FieldDescription>
              )
            )}
          </Field>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCreating(false)}>
              取消
            </Button>
            <Button onClick={create} disabled={!newName.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={batch === "parent" || batch === "merge"}
        onOpenChange={(open) => !open && setBatch(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {batch === "parent" && `为 ${selected.size} 个标签设置父标签`}
              {batch === "merge" && `合并 ${selected.size} 个标签`}
            </DialogTitle>
          </DialogHeader>

          {chosen}

          {batch === "parent" && (
            <Field className="mt-4">
              <FieldLabel>父标签</FieldLabel>
              <TagAutocomplete
                endpoint="/api/tags/suggest"
                mode="single"
                placeholder="选择或新建父标签"
                disabledNames={selectedNames}
                // Choosing only fills in the target. Applying it is a separate
                // press, so the impact below can be read first.
                onSelect={(name) => setPicked({ name })}
                className="w-64"
              />
              <FieldDescription>
                筛选父标签时一并返回其下所有子标签的视频。
              </FieldDescription>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 self-start"
                onClick={() => setPicked({ name: null })}
              >
                移至顶级
              </Button>
            </Field>
          )}

          {batch === "merge" && (
            <Field className="mt-4">
              <FieldLabel>目标标签</FieldLabel>
              <TagAutocomplete
                endpoint="/api/tags/suggest"
                mode="single"
                placeholder="选择目标标签"
                allowCreate={false}
                disabledNames={selectedNames}
                onSelect={(name) => setPicked({ name })}
                className="w-64"
              />
              <FieldDescription>
                所选标签的视频改为使用目标标签，其名称成为目标标签的别名。
              </FieldDescription>
            </Field>
          )}

          {batchImpact && (
            <TagImpactAnalysis className="mt-4" request={batchImpact} />
          )}

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setBatch(null)}>
              取消
            </Button>
            <Button disabled={busy || picked === null} onClick={applyBatch}>
              {batch === "merge" ? "合并" : "移动"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Keyed so the acknowledgement is never carried over from the last
          deletion to the next one. */}
      {deleting && (
        <TagConfirmDialog
          key={deleting.id}
          title={
            <>
              删除标签
              <InlineTagBadge state={deleting.reviewState}>
                {deleting.name}
              </InlineTagBadge>
            </>
          }
          request={{ action: "delete", ids: [deleting.id] }}
          onOpenChange={(open) => !open && setDeleting(null)}
          onConfirm={() => removeTag(deleting)}
        />
      )}

      {batch === "delete" && batchImpact && (
        <TagConfirmDialog
          title={`删除 ${selected.size} 个标签`}
          subject={chosen}
          request={batchImpact}
          onOpenChange={(open) => !open && setBatch(null)}
          onConfirm={() =>
            runBatch(
              "/api/tags/batch",
              { action: "delete", ids: [...selected] },
              `已删除 ${selected.size} 个标签`,
            )
          }
        />
      )}

      {(batch === "exclude" || batch === "restore") && batchImpact && (
        <TagConfirmDialog
          title={`${batch === "exclude" ? "排除" : "取消排除"} ${selected.size} 个标签`}
          subject={chosen}
          request={batchImpact}
          confirmLabel={batch === "exclude" ? "排除" : "取消排除"}
          confirmVariant={batch === "exclude" ? "destructive" : "default"}
          onOpenChange={(open) => !open && setBatch(null)}
          onConfirm={() =>
            runBatch(
              "/api/tags/batch",
              { action: batch, ids: [...selected] },
              batch === "exclude"
                ? `已排除 ${selected.size} 个标签`
                : `已取消排除 ${selected.size} 个标签`,
            )
          }
        />
      )}
    </div>
  );
}
