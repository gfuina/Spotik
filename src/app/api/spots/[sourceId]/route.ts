import { NextResponse } from "next/server";
import { getSpotBySourceId } from "@/lib/getSpotBySourceId";

export const runtime = "nodejs";

function parseSourceId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sourceId: string }> },
) {
  try {
    const { sourceId: raw } = await ctx.params;
    const sourceId = parseSourceId(raw);
    if (sourceId == null) {
      return NextResponse.json({ error: "Invalid sourceId" }, { status: 400 });
    }
    const spot = await getSpotBySourceId(sourceId);
    if (!spot) {
      return NextResponse.json({ error: "Spot introuvable" }, { status: 404 });
    }
    return NextResponse.json({ spot });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message.includes("Missing MONGODB_URI") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
