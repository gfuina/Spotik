import { haversineKm } from "@/lib/geo";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

type OsmEl = {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

function elementCoords(el: OsmEl): { lat: number; lng: number } | null {
  if (el.type === "node" && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
    return { lat: el.lat!, lng: el.lon! };
  }
  const c = el.center;
  if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) {
    return { lat: c.lat!, lng: c.lon! };
  }
  return null;
}

function parkingLabel(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null;
  return (
    tags.name ??
    tags["name:fr"] ??
    tags["name:en"] ??
    tags.ref ??
    null
  );
}

/**
 * Parking OSM (`amenity=parking`) le plus proche dans un rayon (nœuds + chemins, centre des ways).
 */
export async function fetchNearestParkingOsm(
  lat: number,
  lng: number,
  options?: { radiusM?: number; signal?: AbortSignal },
): Promise<{
  lat: number;
  lng: number;
  name: string | null;
  distanceM: number;
} | null> {
  const radiusM = options?.radiusM ?? 1400;
  const q = `[out:json][timeout:12];
(
  node["amenity"="parking"](around:${radiusM},${lat},${lng});
  way["amenity"="parking"](around:${radiusM},${lat},${lng});
);
out center;`;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body: q,
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      "User-Agent": "Spotik/1.0 (nearest parking; contact: spotik)",
    },
    signal: options?.signal,
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`Overpass ${res.status}`);
  }

  const data = (await res.json()) as { elements?: OsmEl[] };
  const elements = data.elements ?? [];
  let best: {
    lat: number;
    lng: number;
    name: string | null;
    distanceM: number;
  } | null = null;

  for (const el of elements) {
    const c = elementCoords(el);
    if (!c) continue;
    const km = haversineKm(lat, lng, c.lat, c.lng);
    const distanceM = km * 1000;
    if (!best || distanceM < best.distanceM) {
      best = {
        lat: c.lat,
        lng: c.lng,
        name: parkingLabel(el.tags),
        distanceM,
      };
    }
  }

  return best;
}
