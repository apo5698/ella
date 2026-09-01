import { NextResponse } from "next/server";
import db from "@/lib/db";
import { loadTagTree } from "@/lib/tagHierarchy";

/** The whole hierarchy, for the tag management page. */
export async function GET() {
  return NextResponse.json({ tree: loadTagTree(db) });
}
