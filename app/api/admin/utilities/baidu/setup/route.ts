import { getTranslations } from "next-intl/server";
import { errorMessage } from "@/lib/appError";
import {
  baiduSetupStatus,
  connectBaidu,
  installBaidu,
  verifyBaidu,
} from "@/lib/utilities/baiduSetup";

export const runtime = "nodejs";
export const maxDuration = 180;
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  return Response.json(await baiduSetupStatus(), { headers });
}
export async function POST(request: Request) {
  // Credential changes must originate from this application.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  const t = await getTranslations("Api");
  try {
    const raw = await request.text();
    if (raw.length > 40_000) return new Response(null, { status: 413 });
    const body = JSON.parse(raw);
    if (body.action === "install") await installBaidu();
    else if (body.action === "connect" && typeof body.cookies === "string")
      await connectBaidu(body.cookies);
    else if (body.action === "verify") await verifyBaidu();
    else return new Response(null, { status: 400 });
    return Response.json(await baiduSetupStatus(), { headers });
  } catch (error) {
    return Response.json(
      { error: errorMessage(error, t) },
      { status: 400, headers },
    );
  }
}
