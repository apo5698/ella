import { after, NextRequest, NextResponse } from "next/server";
import { getJobState, startTagJob, stopTagJob } from "@/lib/tagJob";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getJobState());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "start");

  if (action === "stop") {
    const res = stopTagJob();
    return NextResponse.json(res, { status: res.ok ? 200 : 409 });
  }

  const result = startTagJob(Boolean(body.force));
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }

  after(result.run);
  return NextResponse.json({ ok: true });
}
