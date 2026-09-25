"use client";

import { useTranslations } from "next-intl";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, Trash2Icon } from "lucide-react";
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
  const t = useTranslations("TagDetail");
  const common = useTranslations("Common");
  const tagActions = useTranslations("TagActions");
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
    setError(data.error ?? common("operationFailed"));
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
    toast.success(t("saved"));
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
      t.rich("aliasAdded", {
        source: alias,
        name: node.name,
        alias: (children) => <InlineAliasBadge>{children}</InlineAliasBadge>,
        tag: (children) => (
          <InlineTagBadge state={node.reviewState}>{children}</InlineTagBadge>
        ),
      }),
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
      setError(data.error ?? t("mergeFailed"));
      setMerging(null);
      return;
    }
    setAliases(data.targetAliases ?? aliases);
    toast.success(
      t.rich("merged", {
        source: merging.name,
        name: node.name,
        alias: (children) => <InlineAliasBadge>{children}</InlineAliasBadge>,
        tag: (children) => (
          <InlineTagBadge state={node.reviewState}>{children}</InlineTagBadge>
        ),
      }),
    );
    setMerging(null);
    router.refresh();
  }

  async function remove() {
    const ok = await call(`/api/tags/${node.id}`, { method: "DELETE" });
    if (!ok) return;
    toast.success(
      tagActions.rich("deleted", {
        name: node.name,
        tag: (children) => (
          <InlineTagBadge state={node.reviewState}>{children}</InlineTagBadge>
        ),
      }),
    );
    router.push("/admin/tags");
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("details")}</CardTitle>
          <CardDescription>
            {t("coverage", { direct: node.count, total: node.totalCount })}
          </CardDescription>
          <CardAction>
            <Button
              onClick={save}
              disabled={saving || !trimmedName || classificationBlocked}
            >
              {saving && <Spinner data-icon="inline-start" />}
              {saving ? common("saving") : common("save")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="tag-name">{common("name")}</FieldLabel>
              <Input
                id="tag-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            </Field>

            <Field>
              <FieldLabel>{tagActions("parent")}</FieldLabel>
              <div className="flex items-center gap-2">
                {parentName ? (
                  <RemovableTagBadge
                    state={
                      tagOptions.find((option) => option.id === parentId)
                        ?.reviewState
                    }
                    removeLabel={t("removeParent", { name: parentName })}
                    onClick={() => setParentId(null)}
                    title={tagActions("moveRoot")}
                  >
                    {parentName}
                  </RemovableTagBadge>
                ) : (
                  <TagAutocomplete
                    endpoint="/api/tags/suggest"
                    mode="single"
                    placeholder={t("chooseParent")}
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
              <FieldDescription>{t("parentHelp")}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>
                {t("aliases")}
                <HelpTip>{t("aliasHelp")}</HelpTip>
              </FieldLabel>
              {aliases.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {aliases.map((alias) => (
                    <RemovableAliasBadge
                      key={alias}
                      removeLabel={t("removeAlias", { name: alias })}
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
                placeholder={t("newAlias")}
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
              <FieldLegend variant="label">{t("options")}</FieldLegend>
              <FieldGroup data-slot="checkbox-group">
                <Field orientation="horizontal">
                  <Switch
                    id="tag-excluded"
                    checked={excluded}
                    onCheckedChange={setExcluded}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="tag-excluded">
                      {tagActions("exclude")}
                    </FieldLabel>
                    <FieldDescription>{t("excludeHelp")}</FieldDescription>
                  </FieldContent>
                </Field>

                <Field orientation="horizontal">
                  <Switch
                    id="tag-assignable"
                    checked={!assignable}
                    onCheckedChange={(checked) => setAssignable(!checked)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="tag-assignable">
                      {t("category")}
                    </FieldLabel>
                    <FieldDescription
                      className={
                        classificationBlocked ? "text-destructive" : undefined
                      }
                    >
                      {classificationBlocked
                        ? t("categoryBlocked", { count: node.count })
                        : t("categoryHelp")}
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
            <Trash2Icon data-icon="inline-start" />
            {tagActions("delete")}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("children", { count: node.children.length })}
          </CardTitle>
          <CardDescription>{t("childrenHelp")}</CardDescription>
        </CardHeader>
        <CardContent>
          {node.children.length === 0 ? (
            <Empty className="rounded-lg border">
              <EmptyHeader>
                <EmptyTitle>{t("noChildren")}</EmptyTitle>
                <EmptyDescription>{t("noChildrenHelp")}</EmptyDescription>
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
                        {t("coverage", {
                          direct: child.count,
                          total: child.totalCount,
                        })}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <ChevronRightIcon />
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
          title={tagActions.rich("deleteNamed", {
            name: node.name,
            tag: (children) => (
              <InlineTagBadge state={node.reviewState}>
                {children}
              </InlineTagBadge>
            ),
          })}
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
              {t.rich("mergeTitle", {
                sourceName: merging?.name ?? "",
                name: node.name,
                source: (children) => (
                  <InlineTagBadge state={merging?.reviewState}>
                    {children}
                  </InlineTagBadge>
                ),
                tag: (children) => (
                  <InlineTagBadge state={node.reviewState}>
                    {children}
                  </InlineTagBadge>
                ),
              })}
            </DialogTitle>
            <DialogDescription>
              {t.rich("mergeDescription", {
                sourceName: merging?.name ?? "",
                name: node.name,
                source: (children) => (
                  <InlineTagBadge state={merging?.reviewState}>
                    {children}
                  </InlineTagBadge>
                ),
                tag: (children) => (
                  <InlineTagBadge state={node.reviewState}>
                    {children}
                  </InlineTagBadge>
                ),
              })}
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
              {common("cancel")}
            </DialogClose>
            <Button variant="destructive" onClick={mergeIn}>
              {tagActions("merge")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
