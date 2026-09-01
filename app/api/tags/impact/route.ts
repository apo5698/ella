import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { normalizeTagName, resolveTagName } from "@/lib/tagHierarchy";
import {
  categorizeImpact,
  deleteImpact,
  excludeImpact,
  mergeImpact,
  moveImpact,
  renameImpact,
  restoreImpact,
  stateImpact,
  type TagImpact,
} from "@/lib/tagImpact";

/**
 * What an operation would do, asked before it is done. Read only: nothing here
 * writes, so it is safe to call while the user is still typing.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids)
    ? body.ids.map(Number).filter(Number.isFinite)
    : [];

  let impact: TagImpact;
  switch (body.action) {
    case "state": {
      const id = Number(body.id);
      const state = body.state;
      if (
        !Number.isFinite(id) ||
        !["excluded", "approved", "category"].includes(state)
      ) {
        return NextResponse.json({ error: "缺少标签状态。" }, { status: 400 });
      }
      impact = stateImpact(db, id, state);
      break;
    }
    case "categorize": {
      const id = Number(body.id);
      if (!Number.isFinite(id)) {
        return NextResponse.json({ error: "缺少标签。" }, { status: 400 });
      }
      impact = categorizeImpact(db, id);
      break;
    }
    case "delete":
      if (ids.length === 0)
        return NextResponse.json({ error: "缺少标签。" }, { status: 400 });
      impact = deleteImpact(db, ids);
      break;
    case "exclude":
      if (ids.length === 0)
        return NextResponse.json({ error: "缺少标签。" }, { status: 400 });
      impact = excludeImpact(db, ids);
      break;
    case "restore":
      if (ids.length === 0)
        return NextResponse.json({ error: "缺少标签。" }, { status: 400 });
      impact = restoreImpact(db, ids);
      break;
    case "move": {
      if (ids.length === 0)
        return NextResponse.json({ error: "缺少标签。" }, { status: 400 });
      // A parent may be named rather than identified: the batch dialog lets a
      // new tag be introduced as the parent, and it has no id until applied.
      if (typeof body.parentName === "string" && body.parentName.trim()) {
        const named = resolveTagName(db, body.parentName);
        impact =
          named.id === null
            ? moveImpact(db, ids, null, named.name)
            : moveImpact(db, ids, named.id);
        break;
      }
      const parentId =
        body.parentId === null || body.parentId === undefined
          ? null
          : Number(body.parentId);
      impact = moveImpact(db, ids, parentId);
      break;
    }
    case "merge": {
      const sourceIds = Array.isArray(body.sourceIds)
        ? body.sourceIds.map(Number).filter(Number.isFinite)
        : [];
      const targetId = Number(body.targetId);
      if (sourceIds.length === 0 || !Number.isFinite(targetId)) {
        return NextResponse.json({ error: "缺少标签。" }, { status: 400 });
      }
      impact = mergeImpact(db, sourceIds, targetId);
      break;
    }
    case "rename": {
      const id = Number(body.id);
      const name = normalizeTagName(String(body.name ?? ""));
      if (!Number.isFinite(id) || !name) {
        return NextResponse.json({ error: "缺少名称。" }, { status: 400 });
      }
      impact = renameImpact(db, id, name);
      break;
    }
    default:
      return NextResponse.json({ error: "未知操作。" }, { status: 400 });
  }

  return NextResponse.json(impact);
}
