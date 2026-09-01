"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import HelpTip from "@/components/HelpTip";
import TagAutocomplete from "@/components/TagAutocomplete";
import {
  InlineAliasBadge,
  InlineTagBadge,
  RemovableAliasBadge,
  RemovableTagBadge,
  TagBadge,
} from "@/components/tags/TagBadge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { tagExclusionAction } from "@/lib/tagCategory";
import type { TagTreeNode } from "@/lib/types";
import TagConfirmDialog from "./TagConfirmDialog";
import TagImpactAnalysis, { type TagImpactRequest } from "./TagImpactAnalysis";
import TagVideoList from "./TagVideoList";

type TagOption = Pick<TagTreeNode, "id" | "name" | "parentId" | "reviewState">;

export default function TagDetailManager({
  node,
  tagOptions,
  descendantIds,
  tagListHref,
}: {
  node: TagTreeNode;
  tagOptions: TagOption[];
  descendantIds: number[];
  tagListHref: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(node.name);
  const [parentId, setParentId] = useState<number | null>(node.parentId);
  const [aliases, setAliases] = useState<string[]>(node.aliases);
  const [merging, setMerging] = useState<{
    id: number;
    name: string;
    count: number;
    reviewState: TagTreeNode["reviewState"];
  } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const wasExcluded = tagExclusionAction(node) === "restore";
  const [excluded, setExcluded] = useState(wasExcluded);
  const [assignable, setAssignable] = useState(node.assignable);
  const optionByName = useMemo(
    () => new Map(tagOptions.map((option) => [option.name, option])),
    [tagOptions],
  );
  const parentName =
    parentId === null
      ? null
      : (tagOptions.find((option) => option.id === parentId)?.name ?? null);
  const blockedNames = useMemo(() => {
    const blocked = new Set(descendantIds);
    return tagOptions
      .filter((option) => blocked.has(option.id))
      .map((option) => option.name);
  }, [descendantIds, tagOptions]);

  const trimmedName = name.trim();
  const becomingClassificationOnly = node.assignable && !assignable;
  const classificationBlocked = becomingClassificationOnly && node.count > 0;
  const pending: TagImpactRequest | null = becomingClassificationOnly
    ? { action: "categorize", id: node.id }
    : trimmedName && trimmedName !== node.name
      ? { action: "rename", id: node.id, name: trimmedName }
      : parentId !== node.parentId
        ? { action: "move", ids: [node.id], parentId }
        : excluded !== wasExcluded
          ? {
              action: excluded ? "exclude" : "restore",
              ids: [node.id],
            }
          : null;

  async function call(url: string, init: RequestInit): Promise<boolean> {
    setError("");
    const response = await fetch(url, init);
    if (response.ok) return true;
    const data = await response.json().catch(() => ({}));
    setError(data.error ?? "操作失败，请重试");
    return false;
  }

  async function save() {
    setSaving(true);
    let ok = await call(`/api/tags/${node.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId, assignable }),
    });
    if (ok && excluded !== wasExcluded) {
      ok = await call("/api/tags/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: excluded ? "exclude" : "restore",
          ids: [node.id],
        }),
      });
    }
    setSaving(false);
    if (!ok) return;
    toast.success("标签已保存");
    router.refresh();
  }

  async function addAlias(value: string) {
    const alias = value.trim();
    if (!alias) return;
    const ok = await call(`/api/tags/${node.id}/aliases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias }),
    });
    if (!ok) return;
    setAliases((current) => [...current, alias].sort());
    toast.success(
      <>
        <InlineAliasBadge>{alias}</InlineAliasBadge>
        将解析为
        <InlineTagBadge state={node.reviewState}>{node.name}</InlineTagBadge>
      </>,
    );
    router.refresh();
  }

  async function removeAlias(alias: string) {
    const ok = await call(
      `/api/tags/${node.id}/aliases?alias=${encodeURIComponent(alias)}`,
      { method: "DELETE" },
    );
    if (!ok) return;
    setAliases((current) => current.filter((value) => value !== alias));
    router.refresh();
  }

  async function mergeIn() {
    if (!merging) return;
    const response = await fetch("/api/tags/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceIds: [merging.id], targetId: node.id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "合并失败，请重试");
      setMerging(null);
      return;
    }
    setAliases(data.targetAliases ?? aliases);
    toast.success(
      <>
        <InlineAliasBadge>{merging.name}</InlineAliasBadge>
        已并入
        <InlineTagBadge state={node.reviewState}>{node.name}</InlineTagBadge>
      </>,
    );
    setMerging(null);
    router.refresh();
  }

  async function remove() {
    const ok = await call(`/api/tags/${node.id}`, { method: "DELETE" });
    if (!ok) return;
    toast.success(
      <>
        已删除标签
        <InlineTagBadge state={node.reviewState}>{node.name}</InlineTagBadge>
      </>,
    );
    router.push("/admin/tags");
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
          <CardDescription>
            直接关联 {node.count} 个视频，共覆盖 {node.totalCount} 个视频
          </CardDescription>
          <CardAction>
            <Button
              onClick={save}
              disabled={saving || !trimmedName || classificationBlocked}
            >
              {saving && <Spinner data-icon="inline-start" />}
              {saving ? "保存中" : "保存"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="tag-name">名称</FieldLabel>
              <Input
                id="tag-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            </Field>

            <Field>
              <FieldLabel>父标签</FieldLabel>
              <div className="flex items-center gap-2">
                {parentName ? (
                  <RemovableTagBadge
                    state={
                      tagOptions.find((option) => option.id === parentId)
                        ?.reviewState
                    }
                    removeLabel={`移除父标签"${parentName}"`}
                    onClick={() => setParentId(null)}
                    title="移至顶级"
                  >
                    {parentName}
                  </RemovableTagBadge>
                ) : (
                  <TagAutocomplete
                    endpoint="/api/tags/suggest"
                    mode="single"
                    placeholder="选择父标签"
                    allowCreate={false}
                    disabledNames={blockedNames}
                    onSelect={(picked) => {
                      const target = optionByName.get(picked);
                      if (target) setParentId(target.id);
                    }}
                    className="w-64"
                  />
                )}
              </div>
              <FieldDescription>
                筛选父标签时一并返回其下所有子标签的视频
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>
                别名
                <HelpTip>
                  添加标签时输入别名将解析为本标签，别名不会出现在视频上
                </HelpTip>
              </FieldLabel>
              {aliases.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {aliases.map((alias) => (
                    <RemovableAliasBadge
                      key={alias}
                      removeLabel={`移除别名"${alias}"`}
                      onClick={() => removeAlias(alias)}
                    >
                      {alias}
                    </RemovableAliasBadge>
                  ))}
                </div>
              )}
              <TagAutocomplete
                endpoint="/api/tags/suggest"
                mode="single"
                placeholder="输入新别名，或选择要并入的标签"
                disabledNames={[node.name, ...aliases]}
                onSelect={(picked, option) => {
                  if (option.isNew || option.id === undefined)
                    void addAlias(picked);
                  else
                    setMerging({
                      id: option.id,
                      name: picked,
                      count: option.count ?? 0,
                      reviewState: option.reviewState ?? "approved",
                    });
                }}
                className="w-80 max-w-full"
              />
            </Field>

            <FieldSet>
              <FieldLegend variant="label">选项</FieldLegend>
              <FieldGroup data-slot="checkbox-group">
                <Field orientation="horizontal">
                  <Switch
                    id="tag-excluded"
                    checked={excluded}
                    onCheckedChange={setExcluded}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="tag-excluded">排除该标签</FieldLabel>
                    <FieldDescription>
                      从所有视频上移除该标签，重新识别时不再生成
                    </FieldDescription>
                  </FieldContent>
                </Field>

                <Field orientation="horizontal">
                  <Switch
                    id="tag-assignable"
                    checked={!assignable}
                    onCheckedChange={(checked) => setAssignable(!checked)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="tag-assignable">升级为分类</FieldLabel>
                    <FieldDescription
                      className={
                        classificationBlocked ? "text-destructive" : undefined
                      }
                    >
                      {classificationBlocked
                        ? `${node.count} 个视频仍直接使用该标签，请先移除或改用子标签`
                        : "该标签将不能直接添加到视频上"}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </FieldSet>

            {pending && <TagImpactAnalysis request={pending} />}
            {error && (
              <Alert variant="destructive">
                <AlertTitle>{error}</AlertTitle>
              </Alert>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-between border-t">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 data-icon="inline-start" />
            删除标签
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>子标签（{node.children.length}）</CardTitle>
          <CardDescription>直接位于该标签下的标签</CardDescription>
        </CardHeader>
        <CardContent>
          {node.children.length === 0 ? (
            <Empty className="rounded-lg border">
              <EmptyHeader>
                <EmptyTitle>没有子标签</EmptyTitle>
                <EmptyDescription>可在其他标签页面设置父标签</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup>
              {node.children.map((child) => (
                <div key={child.id} role="listitem">
                  <Item
                    variant="outline"
                    render={
                      <Link
                        href={`/admin/tags/${child.id}?from=${encodeURIComponent(tagListHref)}`}
                      />
                    }
                  >
                    <ItemContent>
                      <ItemTitle>
                        <TagBadge state={child.reviewState}>
                          {child.name}
                        </TagBadge>
                      </ItemTitle>
                      <ItemDescription>
                        直接关联 {child.count} 个视频，共覆盖 {child.totalCount}{" "}
                        个视频
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <ChevronRight />
                    </ItemActions>
                  </Item>
                </div>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>

      <TagVideoList
        key={`${node.id}-${node.count}`}
        tagId={node.id}
        tagName={node.name}
        tagState={node.reviewState}
        initialTotal={node.count}
      />

      {confirmingDelete && (
        <TagConfirmDialog
          title={
            <>
              删除标签
              <InlineTagBadge state={node.reviewState}>
                {node.name}
              </InlineTagBadge>
            </>
          }
          request={{ action: "delete", ids: [node.id] }}
          onOpenChange={(open) => !open && setConfirmingDelete(false)}
          onConfirm={remove}
        />
      )}

      <Dialog
        open={merging !== null}
        onOpenChange={(open) => !open && setMerging(null)}
      >
        <DialogContent className="flex max-h-5/6 flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              将
              {merging && (
                <InlineTagBadge state={merging.reviewState}>
                  {merging.name}
                </InlineTagBadge>
              )}
              并入
              <InlineTagBadge state={node.reviewState}>
                {node.name}
              </InlineTagBadge>
            </DialogTitle>
            <DialogDescription>
              {merging && (
                <InlineTagBadge state={merging.reviewState}>
                  {merging.name}
                </InlineTagBadge>
              )}
              是一个标签，并入后成为
              <InlineTagBadge state={node.reviewState}>
                {node.name}
              </InlineTagBadge>
              的别名
            </DialogDescription>
          </DialogHeader>
          {merging && (
            <TagImpactAnalysis
              request={{
                action: "merge",
                sourceIds: [merging.id],
                targetId: node.id,
              }}
            />
          )}
          <DialogFooter className="shrink-0">
            <DialogClose render={<Button variant="outline" />}>
              取消
            </DialogClose>
            <Button variant="destructive" onClick={mergeIn}>
              合并
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
