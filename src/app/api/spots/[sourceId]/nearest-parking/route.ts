import { NextResponse } from "next/server";
import { getSpotBySourceId } from "@/lib/getSpotBySourceId";
import { fetchNearestParkingOsm } from "@/lib/overpassNearestParking";

export const runtime = "nodejs";

function parseSourceId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export async function GET(
  req: Request,
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

    const { searchParams } = new URL(req.url);
    const radiusRaw = searchParams.get("radiusM");
    const radiusM =
      radiusRaw != null && radiusRaw !== ""
        ? Math.min(Math.max(Number(radiusRaw), 200), 5000)
        : 1400;
    if (!Number.isFinite(radiusM)) {
      return NextResponse.json({ error: "radiusM invalide" }, { status: 400 });
    }

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12_000);
    let nearest: Awaited<ReturnType<typeof fetchNearestParkingOsm>>;
    try {
      nearest = await fetchNearestParkingOsm(spot.lat, spot.lng, {
        radiusM,
        signal: ac.signal,
      });
    } finally {
      clearTimeout(t);
    }

    if (!nearest) {
      return NextResponse.json(
        {
          error: "no_parking",
          message: "Aucun parking OpenStreetMap dans le rayon",
          spot: { lat: spot.lat, lng: spot.lng },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      parking: {
        lat: nearest.lat,
        lng: nearest.lng,
        name: nearest.name,
        distanceM: Math.round(nearest.distanceM),
      },
      spot: { lat: spot.lat, lng: spot.lng },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message.includes("Missing MONGODB_URI") ? 503 : 502;
    return NextResponse.json(
      { error: message.includes("abort") ? "timeout" : message },
      { status },
    );
  }
}
