import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator } from "next-intl";
import en from "../messages/en.json";
import zh from "../messages/zh-CN.json";
import { formatTagImpactFact } from "../lib/tagImpactMessages";
import type { TagImpactFact } from "../lib/tagImpact";

const tag = {
  id: 1,
  name: "Example {tag} <value>",
  reviewState: "approved" as const,
};
const facts: TagImpactFact[] = [
  { kind: "children-moved", items: [tag], destination: { kind: "up" } },
  { kind: "children-moved", items: [tag], destination: { kind: "tag", tag } },
  { kind: "children-unaffected", items: [tag] },
  { kind: "restorable" },
  { kind: "restore-covers-earlier" },
  { kind: "tag-made-assignable" },
  { kind: "video-tags-unchanged" },
  { kind: "tag-created", tag },
  { kind: "already-top-level" },
  { kind: "old-name-unmatched", tag },
  { kind: "irreversible" },
];
for (const count of [0, 1, 2]) {
  const videoIds = Array.from({ length: count }, (_, index) => index + 1);
  facts.push(
    { kind: "classification-conflict", count, videoIds },
    { kind: "rejections-deleted", count },
    { kind: "manual-links-excluded", count },
    { kind: "automatic-links-approved", count, videoIds },
    { kind: "aliases-invalidated", count },
    { kind: "filter-gain", count, videoIds, parent: tag },
    { kind: "filter-loss", count, videoIds, parent: tag },
    { kind: "merge-overlap", count, videoIds, target: tag },
    { kind: "names-become-aliases", count, target: tag },
    { kind: "aliases-transferred", count, target: tag },
    { kind: "video-tag-renamed", count, videoIds, tag },
  );
  for (const multipleTags of [false, true]) {
    facts.push(
      { kind: "videos-lose-tags", count, videoIds, multipleTags },
      { kind: "regeneration-blocked", multipleTags },
      {
        kind: "rejections-restored",
        count,
        videoCount: count,
        videoIds,
        multipleTags,
      },
      { kind: "videos-retagged", count, videoIds, multipleTags, target: tag },
    );
  }
}

for (const [locale, messages] of [
  ["en", en],
  ["zh-CN", zh],
] as const) {
  test(`impact messages retain interactive references in ${locale}`, () => {
    const t = createTranslator({
      locale,
      messages,
      namespace: "Impact",
      onError(error) {
        throw error;
      },
    });
    for (const fact of facts) {
      const result = formatTagImpactFact(fact, t);
      assert.ok(result.segments.length > 0, fact.kind);
      for (const segment of result.segments) {
        if (segment.kind === "tag") assert.deepEqual(segment.tag, tag);
        else {
          assert.ok(!/[\uFFF0\uFFF1]/.test(segment.text), fact.kind);
          if (segment.kind === "video-count" && "videoIds" in fact)
            assert.deepEqual(segment.videoIds, fact.videoIds);
          if (segment.kind === "children")
            assert.deepEqual(segment.items, [tag]);
        }
      }
      if (
        fact.kind === "irreversible" ||
        (fact.kind === "videos-lose-tags" && fact.count > 0)
      )
        assert.equal(result.tone, "destructive");
      if (fact.kind === "videos-retagged" && fact.count > 0)
        assert.equal(result.segments.filter((s) => s.kind === "tag").length, 1);
    }
  });
}
