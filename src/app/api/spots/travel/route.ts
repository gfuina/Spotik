import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PROFILE = "mapbox/walking";
/** Mapbox Matrix : max 25 coordonnées (1 origine + 24 destinations par requête). */
const MAX_DESTINATIONS_PER_BATCH = 24;
const MAX_SPOTS = 80;

type SpotCoord = { sourceId: number; lat: number; lng: number };

type TravelMetric = {
  sourceId: number;
  routeDistanceKm: number | null;
  routeDurationSec: number | null;
};

function mapboxToken(): string | null {
  return (
    process.env.MAPBOX_SECRET_TOKEN ??
    process.env.MAPBOX_ACCESS_TOKEN ??
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
    null
  );
}

function parseBody(body: unknown): {
  lat: number;
  lng: number;
  spots: SpotCoord[];
} | null {
  if (typeof body !== "object" || body === null) return null;
  const o = body as Record<string, unknown>;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const raw = o.spots;
  if (!Array.isArray(raw)) return null;
  const spots: SpotCoord[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const s = item as Record<string, unknown>;
    const sourceId = Number(s.sourceId);
    const slat = Number(s.lat);
    const slng = Number(s.lng);
    if (
      !Number.isInteger(sourceId) ||
      sourceId < 0 ||
      !Number.isFinite(slat) ||
      !Number.isFinite(slng)
    ) {
      return null;
    }
    spots.push({ sourceId, lat: slat, lng: slng });
  }
  if (spots.length > MAX_SPOTS) return null;
  return { lat, lng, spots };
}

async function directionsSingleLeg(
  token: string,
  originLng: number,
  originLat: number,
  s: SpotCoord,
): Promise<TravelMetric> {
  const coordPath = `${originLng},${originLat};${s.lng},${s.lat}`;
  const u = new URL(
    `https://api.mapbox.com/directions/v5/${PROFILE}/${coordPath}`,
  );
  u.searchParams.set("overview", "false");
  u.searchParams.set("access_token", token);
  const res = await fetch(u.toString(), { method: "GET", next: { revalidate: 0 } });
  const data = (await res.json()) as {
    routes?: { duration: number; distance: number }[];
    message?: string;
  };
  if (!res.ok || !data.routes?.[0]) {
    return {
      sourceId: s.sourceId,
      routeDistanceKm: null,
      routeDurationSec: null,
    };
  }
  const r = data.routes[0];
  return {
    sourceId: s.sourceId,
    routeDistanceKm: Math.round((r.distance / 1000) * 10) / 10,
    routeDurationSec: Math.round(r.duration),
  };
}

async function matrixBatch(
  token: string,
  originLng: number,
  originLat: number,
  batch: SpotCoord[],
): Promise<TravelMetric[]> {
  if (batch.length === 1) {
    return [await directionsSingleLeg(token, originLng, originLat, batch[0]!)];
  }

  const parts = [`${originLng},${originLat}`];
  for (const s of batch) {
    parts.push(`${s.lng},${s.lat}`);
  }
  const coordPath = parts.join(";");
  const destIndices = batch.map((_, i) => String(i + 1)).join(";");
  const u = new URL(
    `https://api.mapbox.com/directions-matrix/v1/${PROFILE}/${coordPath}`,
  );
  u.searchParams.set("sources", "0");
  u.searchParams.set("destinations", destIndices);
  u.searchParams.set("annotations", "distance,duration");
  u.searchParams.set("access_token", token);

  const res = await fetch(u.toString(), { method: "GET", next: { revalidate: 0 } });
  const data = (await res.json()) as {
    code?: string;
    message?: string;
    durations?: (number | null)[][];
    distances?: (number | null)[][];
  };

  if (!res.ok) {
    throw new Error(data.message ?? `Mapbox ${res.status}`);
  }
  if (data.code !== "Ok" && data.code != null) {
    throw new Error(data.message ?? data.code);
  }

  const durations = data.durations?.[0];
  const distances = data.distances?.[0];
  if (!durations || !distances || durations.length !== batch.length) {
    throw new Error("Réponse Matrix inattendue");
  }

  return batch.map((s, j) => {
    const dur = durations[j];
    const distM = distances[j];
    if (dur == null || distM == null) {
      return {
        sourceId: s.sourceId,
        routeDistanceKm: null,
        routeDurationSec: null,
      };
    }
    return {
      sourceId: s.sourceId,
      routeDistanceKm: Math.round((distM / 1000) * 10) / 10,
      routeDurationSec: Math.round(dur),
    };
  });
}

export async function POST(req: Request) {
  try {
    const token = mapboxToken();
    if (!token) {
      return NextResponse.json(
        { error: "Token Mapbox manquant (NEXT_PUBLIC_MAPBOX_TOKEN ou MAPBOX_SECRET_TOKEN)" },
        { status: 503 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
    }

    const parsed = parseBody(body);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "Body attendu : { lat, lng, spots: [{ sourceId, lat, lng }, ...] } (max 80 spots)",
        },
        { status: 400 },
      );
    }

    const { lat, lng, spots } = parsed;
    if (spots.length === 0) {
      return NextResponse.json({ metrics: [] });
    }
    const metrics: TravelMetric[] = [];

    for (let i = 0; i < spots.length; i += MAX_DESTINATIONS_PER_BATCH) {
      const batch = spots.slice(i, i + MAX_DESTINATIONS_PER_BATCH);
      try {
        const batchMetrics = await matrixBatch(token, lng, lat, batch);
        metrics.push(...batchMetrics);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        for (const s of batch) {
          metrics.push({
            sourceId: s.sourceId,
            routeDistanceKm: null,
            routeDurationSec: null,
          });
        }
        console.error("[travel/matrix] batch error", msg);
      }
    }

    return NextResponse.json({ metrics });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
