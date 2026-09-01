// Exercises aliases and the parent/child tree against a scratch database, so
// the rules that keep an alias off a video are checked rather than assumed.
//
// DB_PATH is set before lib/db is loaded: it opens its file on import.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scratch = path.join(os.tmpdir(), `ella-hierarchy-${process.pid}.db`);
process.env.DB_PATH = scratch;

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
  if (!ok) {
    console.log(`        expected ${e}`);
    console.log(`        actual   ${a}`);
  }
}

function rejects(label: string, fn: () => void) {
  try {
    fn();
    failures++;
    console.log(`FAIL  ${label}`);
    console.log("        expected it to be refused");
  } catch {
    console.log(`pass  ${label}`);
  }
}

async function main() {
  const { default: db } = await import("../lib/db");
  const {
    aliasesOf,
    ensureTag,
    expandQuery,
    loadTagPaths,
    loadTagTree,
    mergeTags,
    resolveTagName,
    withDescendants,
    wouldCycle,
  } = await import("../lib/tagHierarchy");
  const { upsertVideoTags } = await import("../lib/tags");

  const tagId = (name: string) =>
    (
      db.prepare("SELECT id FROM tags WHERE name = ?").get(name) as {
        id: number;
      }
    ).id;

  // 测试分类乙 holds 测试条目乙 and 测试条目甲; 测试条目乙别名 is another way of writing 测试条目乙.
  db.prepare("INSERT INTO tags (name) VALUES ('测试分类乙')").run();
  db.prepare("INSERT INTO tags (name, parent_id) VALUES ('测试条目乙', ?)").run(
    tagId("测试分类乙"),
  );
  db.prepare("INSERT INTO tags (name, parent_id) VALUES ('测试条目甲', ?)").run(
    tagId("测试分类乙"),
  );
  db.prepare("INSERT INTO tags (name) VALUES ('测试分类甲')").run();
  db.prepare(
    "INSERT INTO tag_aliases (alias, tag_id) VALUES ('测试条目乙别名', ?)",
  ).run(tagId("测试条目乙"));

  const now = Math.floor(Date.now() / 1000);
  const addVideo = db.prepare(
    `INSERT INTO videos (path, filename, title, ext, size_bytes, mtime, created_at)
     VALUES (?, ?, ?, '.mp4', 1, ?, ?)`,
  );
  addVideo.run(
    "/test-fixtures/sample-a.mp4",
    "sample-a.mp4",
    "测试视频甲",
    now,
    now,
  );
  addVideo.run(
    "/test-fixtures/sample-b.mp4",
    "sample-b.mp4",
    "测试视频乙",
    now,
    now,
  );
  const videoA = videoIdOf("/test-fixtures/sample-a.mp4");
  const videoB = videoIdOf("/test-fixtures/sample-b.mp4");

  function videoIdOf(p: string) {
    return (
      db.prepare("SELECT id FROM videos WHERE path = ?").get(p) as {
        id: number;
      }
    ).id;
  }

  // --- resolution ----------------------------------------------------------
  check(
    "an alias resolves to the tag it stands for",
    resolveTagName(db, "测试条目乙别名"),
    {
      name: "测试条目乙",
      id: tagId("测试条目乙"),
      alias: "测试条目乙别名",
    },
  );

  check("a tag resolves to itself", resolveTagName(db, "测试条目乙"), {
    name: "测试条目乙",
    id: tagId("测试条目乙"),
    alias: null,
  });

  check(
    "an unknown name resolves to itself with no id",
    resolveTagName(db, "新词"),
    {
      name: "新词",
      id: null,
      alias: null,
    },
  );

  const before = (
    db.prepare("SELECT COUNT(*) c FROM tags").get() as { c: number }
  ).c;
  check(
    "adding an alias does not create a second tag",
    ensureTag(db, "测试条目乙别名"),
    {
      id: tagId("测试条目乙"),
      name: "测试条目乙",
    },
  );
  check(
    "and the table did not grow",
    (db.prepare("SELECT COUNT(*) c FROM tags").get() as { c: number }).c,
    before,
  );

  // --- one namespace -------------------------------------------------------
  rejects("an alias cannot shadow an existing tag", () => {
    db.prepare(
      "INSERT INTO tag_aliases (alias, tag_id) VALUES ('测试分类甲', ?)",
    ).run(tagId("测试条目乙"));
  });
  rejects("a tag cannot be created under an existing alias", () => {
    db.prepare("INSERT INTO tags (name) VALUES ('测试条目乙别名')").run();
  });
  rejects("nor renamed onto one", () => {
    db.prepare(
      "UPDATE tags SET name = '测试条目乙别名' WHERE name = '测试分类甲'",
    ).run();
  });

  // --- the tree ------------------------------------------------------------
  check(
    "a parent stands for its whole subtree",
    withDescendants(db, [tagId("测试分类乙")]).sort(),
    [tagId("测试分类乙"), tagId("测试条目乙"), tagId("测试条目甲")].sort(),
  );
  check(
    "a leaf stands for itself",
    withDescendants(db, [tagId("测试分类甲")]),
    [tagId("测试分类甲")],
  );
  check(
    "a tag cannot be its own parent",
    wouldCycle(db, tagId("测试分类乙"), tagId("测试分类乙")),
    true,
  );
  check(
    "nor sit under its own child",
    wouldCycle(db, tagId("测试分类乙"), tagId("测试条目乙")),
    true,
  );
  check(
    "an unrelated tag is a valid parent",
    wouldCycle(db, tagId("测试分类甲"), tagId("测试分类乙")),
    false,
  );

  check(
    "a path reads from the root down",
    loadTagPaths(db).get(tagId("测试条目乙")),
    ["测试分类乙", "测试条目乙"],
  );

  // --- what a video ends up with -------------------------------------------
  // The model wrote the alias. The video must still come out tagged 测试条目乙.
  upsertVideoTags(db, videoA, ["测试条目乙别名", "测试分类甲"], "vision");
  check(
    "a generated alias is stored as the tag it stands for",
    (
      db
        .prepare(
          `SELECT t.name FROM tags t JOIN video_tags vt ON vt.tag_id = t.id
           WHERE vt.video_id = ? ORDER BY t.name`,
        )
        .all(videoA) as { name: string }[]
    ).map((r) => r.name),
    ["测试分类甲", "测试条目乙"],
  );

  upsertVideoTags(db, videoB, ["测试条目甲"], "vision");

  // --- search --------------------------------------------------------------
  const expanded = expandQuery(db, "测试条目乙别名");
  check(
    "searching an alias also looks for the tag's own spelling in titles",
    [...expanded.names].sort(),
    ["测试条目乙", "测试条目乙别名"],
  );
  check("and matches the tag itself", expanded.tagIds, [tagId("测试条目乙")]);
  check(
    "searching the tag reaches the same titles",
    [...expandQuery(db, "测试条目乙").names].sort(),
    ["测试条目乙", "测试条目乙别名"],
  );
  check(
    "searching a parent reaches its children",
    expandQuery(db, "测试分类乙").tagIds.sort(),
    [tagId("测试分类乙"), tagId("测试条目乙"), tagId("测试条目甲")].sort(),
  );
  check("a plain word names no tag", expandQuery(db, "测试查询词"), {
    names: ["测试查询词"],
    tagIds: [],
  });

  check(
    "aliases come back with their tag",
    aliasesOf(db, tagId("测试条目乙")),
    ["测试条目乙别名"],
  );

  // --- the management tree -------------------------------------------------
  const tree = loadTagTree(db);
  // 测试分类甲 sorts before 测试分类乙. Their children are not at this level: they hang
  // off their parent.
  check(
    "the tree is rooted and sorted",
    tree.map((node) => node.name),
    ["测试分类甲", "测试分类乙"],
  );
  const stockings = tree[1];
  check(
    "children are sorted under their parent",
    stockings.children.map((node) => node.name),
    ["测试条目甲", "测试条目乙"],
  );
  check("a parent with no videos of its own counts none", stockings.count, 0);
  // One video carries 测试条目乙 and one carries 测试条目甲, so the parent stands for two.
  check("but reports its whole subtree", stockings.totalCount, 2);
  check("aliases are attached to their tag", stockings.children[1].aliases, [
    "测试条目乙别名",
  ]);

  // A video tagged with both a parent and a child must count once.
  upsertVideoTags(db, videoA, ["测试分类乙", "测试条目乙"], "manual");
  check(
    "a video tagged twice within one family counts once",
    loadTagTree(db)[1].totalCount,
    2,
  );

  // --- merging -------------------------------------------------------------
  // The library grew 测试条目乙旧名 on its own, with its own videos. Folding it into
  // 测试条目乙 is the operation that makes it an alias.
  db.prepare("INSERT INTO tags (name) VALUES ('测试条目乙旧名')").run();
  db.prepare(
    "INSERT INTO tags (name, parent_id) VALUES ('测试条目乙子项', ?)",
  ).run(tagId("测试条目乙旧名"));
  addVideo.run(
    "/test-fixtures/sample-c.mp4",
    "sample-c.mp4",
    "测试视频丙",
    now,
    now,
  );
  const videoC = videoIdOf("/test-fixtures/sample-c.mp4");
  // videoA already carries 测试条目乙 as a generated tag. Giving it 测试条目乙旧名 as one the
  // user added sets up the collision the merge has to settle.
  db.prepare(
    "INSERT INTO video_tags (video_id, tag_id, source, status) VALUES (?, ?, 'manual', 'active')",
  ).run(videoA, tagId("测试条目乙旧名"));
  db.prepare(
    "INSERT INTO video_tags (video_id, tag_id, source, status) VALUES (?, ?, 'vision', 'active')",
  ).run(videoC, tagId("测试条目乙旧名"));

  const merge = mergeTags(db, [tagId("测试条目乙旧名")], tagId("测试条目乙"));
  check("merging reports what it folded in", merge, {
    merged: 1,
    aliases: ["测试条目乙旧名"],
  });
  check(
    "the merged tag is gone",
    db.prepare("SELECT id FROM tags WHERE name = '测试条目乙旧名'").get() ??
      null,
    null,
  );
  check(
    "and its name now resolves to the target",
    resolveTagName(db, "测试条目乙旧名"),
    {
      name: "测试条目乙",
      id: tagId("测试条目乙"),
      alias: "测试条目乙旧名",
    },
  );
  check(
    "a video that only had the merged tag now has the target",
    (
      db
        .prepare(
          `SELECT t.name FROM tags t JOIN video_tags vt ON vt.tag_id = t.id
           WHERE vt.video_id = ?`,
        )
        .all(videoC) as { name: string }[]
    ).map((r) => r.name),
    ["测试条目乙"],
  );
  check(
    "a video that had both keeps the stronger source",
    db
      .prepare(
        "SELECT source, status FROM video_tags WHERE video_id = ? AND tag_id = ?",
      )
      .get(videoA, tagId("测试条目乙")),
    { source: "manual", status: "active" },
  );
  check(
    "the merged tag's children move to the target",
    (
      db
        .prepare("SELECT name FROM tags WHERE parent_id = ?")
        .all(tagId("测试条目乙")) as {
        name: string;
      }[]
    ).map((r) => r.name),
    ["测试条目乙子项"],
  );

  // Merging a parent into its own child would otherwise leave the child
  // pointing at itself.
  db.prepare("INSERT INTO tags (name) VALUES ('测试分类丙')").run();
  db.prepare("UPDATE tags SET parent_id = ? WHERE name = '测试分类甲'").run(
    tagId("测试分类丙"),
  );
  mergeTags(db, [tagId("测试分类丙")], tagId("测试分类甲"));
  check(
    "merging a parent into its child leaves no self-reference",
    db.prepare("SELECT parent_id FROM tags WHERE name = '测试分类甲'").get(),
    { parent_id: null },
  );

  // --- impact analysis -----------------------------------------------------
  // State at this point: 测试分类乙 holds 测试条目乙 (which holds 测试条目乙子项) and 测试条目甲.
  // videoA carries 测试分类乙 and 测试条目乙; videoB carries 测试条目甲; videoC carries 测试条目乙.
  const { deleteImpact, excludeImpact, moveImpact, mergeImpact, renameImpact } =
    await import("../lib/tagImpact");
  const { formatTagImpactFact, tagImpactMessageText } =
    await import("../lib/tagImpactMessages");
  const impactMessages = (impact: ReturnType<typeof deleteImpact>) =>
    impact.facts.map(tagImpactMessageText);

  check(
    "deleting reports the videos that lose the tag",
    deleteImpact(db, [tagId("测试条目乙")]).total,
    2,
  );
  check(
    "and warns about the children and aliases that go with it",
    impactMessages(deleteImpact(db, [tagId("测试条目乙")])).slice(1, 3),
    [
      "1 个子标签将移至上一层，不会被删除。",
      "2 个别名将失效，按别名搜索不再匹配。",
    ],
  );

  // Moving takes nothing off a video; what changes is the reach of the tags.
  const moved = moveImpact(db, [tagId("测试条目乙")], null);
  const movedMessages = impactMessages(moved);
  check(
    "moving leaves every video's tags alone",
    movedMessages[0],
    "视频的标签不变。",
  );
  check(
    "and reports what the old parent stops returning",
    movedMessages[1],
    "筛选测试分类乙将不再返回 1 个视频。",
  );
  // videoA carries 测试分类乙 in its own right, so 测试分类乙 keeps it either way. Only
  // videoC, which is reachable through 测试条目乙 alone, is lost.

  check(
    "a parent that does not exist yet is reported as new",
    impactMessages(
      moveImpact(db, [tagId("测试条目乙")], null, "测试分类丙"),
    ).slice(1),
    [
      "筛选测试分类丙将额外返回 2 个视频。",
      "将新建测试分类丙",
      "筛选测试分类乙将不再返回 1 个视频。",
    ],
  );

  // videoA holds both 测试条目乙 and 测试分类乙, so merging one into the other leaves it
  // with one tag where it had two.
  const mergePreview = mergeImpact(
    db,
    [tagId("测试条目乙")],
    tagId("测试分类乙"),
  );
  check(
    "merging counts the videos that already hold the target",
    impactMessages(mergePreview).slice(0, 2),
    [
      "2 个视频将改用测试分类乙",
      "其中 1 个视频已同时拥有测试分类乙，合并后标签数减少。",
    ],
  );
  check(
    "the overlap opens only the videos counted by that fact",
    mergePreview.facts.find((fact) => fact.kind === "merge-overlap")?.videoIds,
    [videoA],
  );

  check(
    "renaming warns that the old spelling stops matching",
    impactMessages(renameImpact(db, tagId("测试条目乙"), "测试条目乙旧名"))[1],
    "搜索测试条目乙将不再匹配该标签。如需保留，可将其添加为别名。",
  );

  const exclusion = excludeImpact(db, [tagId("测试分类乙")]);
  check(
    "excluding a parent leaves its children in place",
    exclusion.facts.some((fact) => fact.kind === "children-unaffected"),
    true,
  );
  const loss = exclusion.facts.find((fact) => fact.kind === "videos-lose-tags");
  check(
    "videos losing a tag is a destructive consequence",
    loss ? formatTagImpactFact(loss).tone : null,
    "destructive",
  );

  console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(() => {
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(scratch + suffix, { force: true });
    }
    process.exit(failures === 0 ? 0 : 1);
  });
