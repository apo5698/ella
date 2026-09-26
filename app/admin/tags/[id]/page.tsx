import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import TagDetailManager from "../TagDetailManager";
import db from "@/lib/db";
import { flattenTree, loadTagTree } from "@/lib/tagHierarchy";

export default async function AdminTagPage({
  params,
}: PageProps<"/admin/tags/[id]">) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) notFound();

  const all = flattenTree(loadTagTree(db));
  const node = all.find((tag) => tag.id === id);
  if (!node) notFound();
  const descendantIds = flattenTree([node]).map((tag) => tag.id);

  return (
    <>
      <AdminPageHeader
        title={node.name}
        description={`id=${String(node.id)}`}
      />
      <TagDetailManager
        node={node}
        descendantIds={descendantIds}
        tagOptions={all.map(({ id, name, parentId, reviewState }) => ({
          id,
          name,
          parentId,
          reviewState,
        }))}
      />
    </>
  );
}
