import { getTranslations } from "next-intl/server";
import db from "@/lib/db";
import { loadTagTree } from "@/lib/tagHierarchy";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import TagManager from "./TagManager";
import { parseTagCategories } from "@/lib/tagCategory";
import { DEFAULT_TAG_SORT, isTagSort } from "@/lib/tagSort";

export default async function AdminTagsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
    types?: string | string[];
    sort?: string | string[];
  }>;
}) {
  const t = await getTranslations("Navigation");
  const params = await searchParams;
  const initialQuery = Array.isArray(params.q) ? params.q[0] : (params.q ?? "");
  const initialPage = Number(
    Array.isArray(params.page) ? params.page[0] : params.page,
  );
  const initialPageSize = Number(
    Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize,
  );
  const initialCategories = parseTagCategories(
    Array.isArray(params.types) ? params.types[0] : params.types,
  );
  const sortParam = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const initialSort = isTagSort(sortParam) ? sortParam : DEFAULT_TAG_SORT;

  return (
    <>
      <AdminPageHeader title={t("tags")} description="" />
      <TagManager
        initialTree={loadTagTree(db)}
        initialQuery={initialQuery}
        initialPage={initialPage}
        initialPageSize={initialPageSize}
        initialCategories={[...initialCategories]}
        initialSort={initialSort}
      />
    </>
  );
}
