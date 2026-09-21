import { getLatestRelease } from "@/lib/releases";

export async function GET() {
  return Response.json(await getLatestRelease(true), {
    headers: { "Cache-Control": "no-store" },
  });
}
