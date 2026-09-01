import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import BackLabel from "@/components/BackLabel";
import TagDetailManager from "@/app/tags/TagDetailManager";
import db from "@/lib/db";
import { flattenTree, loadTagTree } from "@/lib/tagHierarchy";

function tagListHref(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return "/admin/tags";

  const url = new URL(candidate, "http://localhost");
  if (url.origin !== "http://localhost" || url.pathname !== "/admin/tags")
    return "/admin/tags";

  return `${url.pathname}${url.search}${url.hash}`;
}

export default async function AdminTagPage({
  params,
  searchParams,
}: PageProps<"/admin/tags/[id]">) {
  const { id: rawId } = await params;
  const { from } = await searchParams;
  const backHref = tagListHref(from);
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) notFound();

  const all = flattenTree(loadTagTree(db));
  const node = all.find((tag) => tag.id === id);
  if (!node) notFound();
  const descendantIds = flattenTree([node]).map((tag) => tag.id);

  return (
    <>
      <Link
        href={backHref}
        className="flex items-center gap-1 self-start text-sm text-link hover:underline"
      >
        <BackLabel />
      </Link>
      <AdminPageHeader
        title={node.name}
        description={`id=${String(node.id)}`}
      />
      <TagDetailManager
        node={node}
        tagListHref={backHref}
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
