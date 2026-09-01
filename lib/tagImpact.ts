import type Database from "better-sqlite3";
import { withDescendants } from "./tagHierarchy";
import type { TagReviewState } from "./types";

/**
 * What a tag operation is about to do, worked out before it is done.
 *
 * The number of videos carrying a tag is not the whole story, and for a move
 * it is not the story at all: nothing is removed from a video, but the tag's
 * reach changes, and that is what the person doing it wants to know.
 */

export type ImpactedVideo = {
  id: number;
  title: string;
  thumbnail: string | null;
};
export type ImpactedTag = {
  id: number | null;
  name: string;
  reviewState: TagReviewState;
};

export type TagImpactFact =
  | {
      kind: "videos-lose-tags";
      count: number;
      videoIds: number[];
      multipleTags: boolean;
    }
  | { kind: "classification-conflict"; count: number; videoIds: number[] }
  | {
      kind: "children-moved";
      items: ImpactedTag[];
      destination: { kind: "up" } | { kind: "tag"; tag: ImpactedTag };
    }
  | { kind: "children-unaffected"; items: ImpactedTag[] }
  | { kind: "rejections-deleted"; count: number }
  | { kind: "manual-links-excluded"; count: number }
  | { kind: "regeneration-blocked"; multipleTags: boolean }
  | { kind: "restorable" }
  | {
      kind: "rejections-restored";
      count: number;
      videoCount: number;
      videoIds: number[];
      multipleTags: boolean;
    }
  | { kind: "restore-covers-earlier" }
  | { kind: "automatic-links-approved"; count: number; videoIds: number[] }
  | { kind: "tag-made-assignable" }
  | { kind: "aliases-invalidated"; count: number }
  | { kind: "video-tags-unchanged" }
  | {
      kind: "filter-gain";
      parent: ImpactedTag;
      count: number;
      videoIds: number[];
    }
  | { kind: "tag-created"; tag: ImpactedTag }
  | {
      kind: "filter-loss";
      parent: ImpactedTag;
      count: number;
      videoIds: number[];
    }
  | { kind: "already-top-level" }
  | {
      kind: "videos-retagged";
      count: number;
      videoIds: number[];
      target: ImpactedTag;
      multipleTags: boolean;
    }
  | {
      kind: "merge-overlap";
      count: number;
      videoIds: number[];
      target: ImpactedTag;
    }
  | { kind: "names-become-aliases"; count: number; target: ImpactedTag }
  | {
      kind: "video-tag-renamed";
      count: number;
      videoIds: number[];
      tag: ImpactedTag;
    }
  | { kind: "old-name-unmatched"; tag: ImpactedTag }
  | { kind: "irreversible" };

export type TagImpact = {
  /** Structured consequences. Display wording lives in tagImpactMessages.ts. */
  facts: TagImpactFact[];
  /** Every affected video, available for the panel's opt-in full list. */
  videos: ImpactedVideo[];
  total: number;
};

const list = (ids: number[]) => ids.map(() => "?").join(",");
const videoIds = (videos: ImpactedVideo[]) => videos.map((video) => video.id);

function tagOf(db: Database.Database, id: number): ImpactedTag {
  const row = db
    .prepare(
      "SELECT id, name, review_state AS reviewState FROM tags WHERE id = ?",
    )
    .get(id) as ImpactedTag | undefined;
  return row ?? { id, name: "", reviewState: "approved" };
}

function childrenOf(db: Database.Database, parentIds: number[]): ImpactedTag[] {
  if (parentIds.length === 0) return [];
  return db
    .prepare(
      `SELECT id, name, review_state AS reviewState FROM tags
       WHERE parent_id IN (${list(parentIds)})
       ORDER BY name COLLATE NOCASE ASC, id ASC`,
    )
    .all(...parentIds) as ImpactedTag[];
}

/** Every video linked to any of these tags, active links unless asked otherwise. */
function videosCarrying(
  db: Database.Database,
  tagIds: number[],
  status: "active" | "rejected" = "active",
) {
  if (tagIds.length === 0) return { videos: [] as ImpactedVideo[], total: 0 };
  const videos = db
    .prepare(
      `SELECT DISTINCT v.id, v.title, v.thumbnail
       FROM videos v JOIN video_tags vt ON vt.video_id = v.id
       WHERE vt.tag_id IN (${list(tagIds)}) AND vt.status = ?
       ORDER BY v.views DESC, v.title ASC`,
    )
    .all(...tagIds, status) as ImpactedVideo[];
  return { videos, total: videos.length };
}

/** A classification-only tag cannot remain directly attached to a video. */
export function categorizeImpact(db: Database.Database, id: number): TagImpact {
  const { videos, total } = videosCarrying(db, [id]);
  return {
    facts: [
      {
        kind: "classification-conflict",
        count: total,
        videoIds: videoIds(videos),
      },
    ],
    videos,
    total,
  };
}

function linkCount(
  db: Database.Database,
  tagIds: number[],
  where: string,
  params: unknown[] = [],
): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM video_tags
         WHERE tag_id IN (${list(tagIds)}) AND ${where}`,
      )
      .get(...tagIds, ...params) as { c: number }
  ).c;
}

/**
 * Excluding marks every active link rejected, which is the same record the
 * video page writes when a generated tag is removed there: the tag leaves the
 * video, and re-generation is told not to bring it back.
 */
export function excludeImpact(db: Database.Database, ids: number[]): TagImpact {
  const { videos, total } = videosCarrying(db, ids);
  const facts: TagImpactFact[] = [
    {
      kind: "videos-lose-tags",
      count: total,
      videoIds: videoIds(videos),
      multipleTags: ids.length !== 1,
    },
  ];

  // Manual links are the surprising half: they are the user's own work, and
  // nothing on the row says how many of them a selection holds.
  const manual = linkCount(db, ids, "status = 'active' AND source = 'manual'");
  if (manual > 0) facts.push({ kind: "manual-links-excluded", count: manual });

  const excluded = new Set(ids);
  const children = childrenOf(db, ids).filter(
    (child) => child.id === null || !excluded.has(child.id),
  );
  if (children.length > 0) {
    facts.push({ kind: "children-unaffected", items: children });
  }

  if (total > 0) {
    facts.push({
      kind: "regeneration-blocked",
      multipleTags: ids.length !== 1,
    });
    facts.push({ kind: "restorable" });
  }
  return { facts, videos, total };
}

/** The inverse: every rejected link becomes active again. */
export function restoreImpact(db: Database.Database, ids: number[]): TagImpact {
  const { videos, total } = videosCarrying(db, ids, "rejected");
  const rejected = linkCount(db, ids, "status = 'rejected'");
  const facts: TagImpactFact[] = [
    {
      kind: "rejections-restored",
      count: rejected,
      videoCount: total,
      videoIds: videoIds(videos),
      multipleTags: ids.length !== 1,
    },
  ];
  // A restore cannot tell an exclusion made here from one made on a video
  // page: both are the same row, so both come back.
  if (rejected > 0) facts.push({ kind: "restore-covers-earlier" });
  return { facts, videos, total };
}

/** Preview one transition from the tag-state slider. */
export function stateImpact(
  db: Database.Database,
  id: number,
  state: TagReviewState,
): TagImpact {
  if (state === "excluded") return excludeImpact(db, [id]);
  if (state === "category") return categorizeImpact(db, id);

  const current = tagOf(db, id).reviewState;
  if (current === "excluded") return restoreImpact(db, [id]);
  if (current === "category") {
    return {
      facts: [{ kind: "tag-made-assignable" }],
      videos: [],
      total: 0,
    };
  }

  const { videos, total } = videosCarrying(db, [id]);
  return {
    facts: [
      {
        kind: "automatic-links-approved",
        count: total,
        videoIds: videoIds(videos),
      },
    ],
    videos,
    total,
  };
}

/** Videos on the left that are not already reached by the tags on the right. */
function videosGained(db: Database.Database, moving: number[], had: number[]) {
  if (moving.length === 0) return { videos: [] as ImpactedVideo[], total: 0 };
  const gained = `
    SELECT video_id FROM video_tags
    WHERE tag_id IN (${list(moving)}) AND status = 'active'
    ${had.length > 0 ? `EXCEPT SELECT video_id FROM video_tags WHERE tag_id IN (${list(had)}) AND status = 'active'` : ""}`;
  const params = had.length > 0 ? [...moving, ...had] : moving;
  const videos = db
    .prepare(
      `SELECT v.id, v.title, v.thumbnail FROM videos v
       WHERE v.id IN (${gained})
       ORDER BY v.views DESC, v.title ASC`,
    )
    .all(...params) as ImpactedVideo[];
  return { videos, total: videos.length };
}

export function deleteImpact(db: Database.Database, ids: number[]): TagImpact {
  const { videos, total } = videosCarrying(db, ids);
  const facts: TagImpactFact[] = [
    {
      kind: "videos-lose-tags",
      count: total,
      videoIds: videoIds(videos),
      multipleTags: ids.length !== 1,
    },
  ];

  const children = childrenOf(db, ids);
  if (children.length > 0) {
    facts.push({
      kind: "children-moved",
      items: children,
      destination: { kind: "up" },
    });
  }

  // Rejections are the negative examples that keep re-generation from putting
  // a tag back. Deleting the tag deletes them, which is not obvious from the
  // word "delete".
  const rejected = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM video_tags
         WHERE tag_id IN (${list(ids)}) AND status = 'rejected'`,
      )
      .get(...ids) as { c: number }
  ).c;
  if (rejected > 0) {
    facts.push({ kind: "rejections-deleted", count: rejected });
  }

  const aliases = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM tag_aliases WHERE tag_id IN (${list(ids)})`,
      )
      .get(...ids) as { c: number }
  ).c;
  if (aliases > 0) {
    facts.push({ kind: "aliases-invalidated", count: aliases });
  }

  facts.push({ kind: "irreversible" });
  return { facts, videos, total };
}

export function moveImpact(
  db: Database.Database,
  ids: number[],
  parentId: number | null,
  /** Set when the parent is a name that does not exist yet, so it holds none. */
  newParentName?: string,
): TagImpact {
  const moving = withDescendants(db, ids);
  const facts: TagImpactFact[] = [{ kind: "video-tags-unchanged" }];

  const affected = new Map<number, ImpactedVideo>();
  const include = (videos: ImpactedVideo[]) => {
    for (const video of videos) affected.set(video.id, video);
  };

  if (parentId !== null || newParentName) {
    // What the new parent stands for today, setting aside the tags arriving.
    // A parent that does not exist yet stands for nothing.
    const already =
      parentId === null
        ? []
        : withDescendants(db, [parentId]).filter((id) => !moving.includes(id));
    const gained = videosGained(db, moving, already);
    const parent =
      parentId === null
        ? {
            id: null,
            name: newParentName ?? "",
            reviewState: "approved" as const,
          }
        : tagOf(db, parentId);
    include(gained.videos);
    facts.push({
      kind: "filter-gain",
      parent,
      count: gained.total,
      videoIds: videoIds(gained.videos),
    });
    if (parentId === null && newParentName) {
      facts.push({ kind: "tag-created", tag: parent });
    }
  }

  // Each tag may be leaving a different parent.
  const leaving = new Map<number, number[]>();
  for (const id of ids) {
    const row = db
      .prepare("SELECT parent_id FROM tags WHERE id = ?")
      .get(id) as { parent_id: number | null } | undefined;
    if (!row || row.parent_id === null || row.parent_id === parentId) continue;
    const group = leaving.get(row.parent_id);
    if (group) group.push(id);
    else leaving.set(row.parent_id, [id]);
  }
  for (const [oldParent, moved] of leaving) {
    const subtree = withDescendants(db, moved);
    const keeping = withDescendants(db, [oldParent]).filter(
      (id) => !subtree.includes(id),
    );
    const lost = videosGained(db, subtree, keeping);
    if (lost.total > 0) {
      facts.push({
        kind: "filter-loss",
        parent: tagOf(db, oldParent),
        count: lost.total,
        videoIds: videoIds(lost.videos),
      });
    }
    include(lost.videos);
  }

  if (parentId === null && !newParentName && leaving.size === 0) {
    facts.push({ kind: "already-top-level" });
  }

  return {
    facts,
    videos: [...affected.values()],
    total: affected.size,
  };
}

export function mergeImpact(
  db: Database.Database,
  sourceIds: number[],
  targetId: number,
): TagImpact {
  const sources = sourceIds.filter((id) => id !== targetId);
  const target = tagOf(db, targetId);
  const { videos, total } = videosCarrying(db, sources);
  const facts: TagImpactFact[] = [
    {
      kind: "videos-retagged",
      count: total,
      videoIds: videoIds(videos),
      target,
      multipleTags: sources.length !== 1,
    },
  ];

  if (total > 0) {
    const gained = videosGained(db, sources, [targetId]);
    const overlap = total - gained.total;
    if (overlap > 0) {
      const gainedIds = new Set(videoIds(gained.videos));
      facts.push({
        kind: "merge-overlap",
        count: overlap,
        videoIds: videos
          .filter((video) => !gainedIds.has(video.id))
          .map((video) => video.id),
        target,
      });
    }
  }

  const names = sources.map((id) => tagOf(db, id).name).filter(Boolean);
  if (names.length > 0) {
    facts.push({ kind: "names-become-aliases", count: names.length, target });
  }

  const children = childrenOf(db, sources);
  if (children.length > 0) {
    facts.push({
      kind: "children-moved",
      items: children,
      destination: { kind: "tag", tag: target },
    });
  }

  facts.push({ kind: "irreversible" });
  return { facts, videos, total };
}

export function renameImpact(
  db: Database.Database,
  id: number,
  next: string,
): TagImpact {
  const current = tagOf(db, id);
  const { videos, total } = videosCarrying(db, [id]);
  const facts: TagImpactFact[] = [
    {
      kind: "video-tag-renamed",
      count: total,
      videoIds: videoIds(videos),
      tag: { ...current, name: next },
    },
  ];
  // The old spelling is not kept. Anyone who searches for it, or a model that
  // produces it, will stop finding the tag.
  facts.push({ kind: "old-name-unmatched", tag: current });

  return { facts, videos, total };
}
