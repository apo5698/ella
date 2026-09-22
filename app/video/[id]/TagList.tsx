"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { SeriesBadge, TagBadge } from "@/components/tags/TagBadge";
import { groupTags } from "@/lib/tagOrder";

/**
 * The tags as they stand. Read only on purpose: adding, accepting and removing
 * them lives in the edit dialog.
 */
export default function TagList({
  series,
  tags,
}: {
  series: string | null;
  tags: { id: number; name: string; source: string; path?: string[] }[];
}) {
  const t = useTranslations("Common");
  if (!series && tags.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noTags")}</p>;
  }

  // Tags of one family sit closer together than the space between families,
  // so a parent and its children read as a set rather than unrelated words.
  const families = groupTags(tags);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {/* Always first, so a video's origin reads before its contents. */}
      {series && <SeriesBadge>{series}</SeriesBadge>}
      {families.map((family) => (
        <div key={family[0].name} className="flex flex-wrap items-center gap-1">
          {family.map((tag) => (
            <TagBadge
              key={tag.id}
              source={tag.source}
              render={
                <Link
                  href={{ pathname: "/", query: { tags: String(tag.id) } }}
                />
              }
            >
              {tag.name}
            </TagBadge>
          ))}
        </div>
      ))}
    </div>
  );
}
