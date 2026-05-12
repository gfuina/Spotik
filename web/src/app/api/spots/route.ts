import { NextResponse } from "next/server";
import { SPOTS_COLLECTION, getDb } from "@/lib/mongodb";
import {
  bearingDeg,
  bearingInSector,
  haversineKm,
} from "@/lib/geo";
import type { SpotApiRow, SpotDocument } from "@/types/spot";

export const runtime = "nodejs";

const EARTH_RADIUS_KM = 6378.1;

function parseNum(v: string | null, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = parseNum(searchParams.get("lat"), NaN);
    const lng = parseNum(searchParams.get("lng"), NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { error: "lat and lng query params are required (numbers)" },
        { status: 400 },
      );
    }

    const radiusKm = Math.min(parseNum(searchParams.get("radiusKm"), 100), 500);
    const limit = Math.min(Math.max(parseNum(searchParams.get("limit"), 50), 1), 200);
    const bearingDegParam = searchParams.get("bearingDeg");
    const bearingCenter =
      bearingDegParam != null && bearingDegParam !== ""
        ? parseNum(bearingDegParam, NaN)
        : null;
    const bearingHalfWidth = parseNum(
      searchParams.get("bearingHalfWidthDeg"),
      45,
    );

    const radiusRad = radiusKm / EARTH_RADIUS_KM;

    const db = await getDb();
    const col = db.collection<SpotDocument>(SPOTS_COLLECTION);

    const docs = await col
      .find({
        location: {
          $geoWithin: {
            $centerSphere: [[lng, lat], radiusRad],
          },
        },
      })
      .project({
        sourceId: 1,
        title: 1,
        name: 1,
        address: 1,
        location: 1,
        thumbnailUrl: 1,
        imageUrls: 1,
        equipments: 1,
        disciplines: 1,
        sourceCanonicalUrl: 1,
      })
      .toArray();

    let rows: SpotApiRow[] = docs.map((d) => {
      const [dlng, dlat] = d.location.coordinates;
      const dist = haversineKm(lat, lng, dlat, dlng);
      const bear = bearingDeg(lat, lng, dlat, dlng);
      return {
        sourceId: d.sourceId,
        title: d.title,
        name: d.name,
        address: d.address,
        lat: dlat,
        lng: dlng,
        distanceKm: dist,
        bearingDeg: bear,
        thumbnailUrl: d.thumbnailUrl,
        imageUrls: d.imageUrls ?? [],
        equipments: d.equipments ?? [],
        disciplines: d.disciplines ?? [],
        sourceCanonicalUrl: d.sourceCanonicalUrl,
      };
    });

    if (
      bearingCenter != null &&
      Number.isFinite(bearingCenter) &&
      bearingHalfWidth > 0
    ) {
      rows = rows.filter((r) =>
        bearingInSector(r.bearingDeg, bearingCenter, bearingHalfWidth),
      );
    }

    rows.sort((a, b) => a.distanceKm - b.distanceKm);
    rows = rows.slice(0, limit);

    return NextResponse.json({
      center: { lat, lng },
      radiusKm,
      bearingDeg: bearingCenter,
      bearingHalfWidthDeg:
        bearingCenter != null ? bearingHalfWidth : undefined,
      count: rows.length,
      spots: rows,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message.includes("Missing MONGODB_URI") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
