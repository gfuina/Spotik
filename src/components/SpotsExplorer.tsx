"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SpotsMap } from "@/components/SpotsMap";
import { SpotListCompass } from "@/components/SpotListCompass";
import type { SpotApiRow } from "@/types/spot";
import {
  EQUIPMENT_FILTERS,
  type EquipmentFilterId,
} from "@/lib/equipmentFilters";
import { bearingDeg as geoBearingDeg, bearingToRose8FullFr, haversineKm } from "@/lib/geo";

const PARIS = { lat: 48.8566, lng: 2.3522 };

const CARDINALS: { label: string; deg: number }[] = [
  { label: "N", deg: 0 },
  { label: "NE", deg: 45 },
  { label: "E", deg: 90 },
  { label: "SE", deg: 135 },
  { label: "S", deg: 180 },
  { label: "SO", deg: 225 },
  { label: "O", deg: 270 },
  { label: "NO", deg: 315 },
];

type ApiPayload = {
  spots: SpotApiRow[];
  count: number;
  error?: string;
};

const SEARCH_HERE_MIN_KM = 0.35;

function googleMapsSearchUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

type TravelMetric = {
  sourceId: number;
  routeDistanceKm: number | null;
  routeDurationSec: number | null;
};

function formatRouteDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  if (sec < 60) return "< 1 min";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

export function SpotsExplorer() {
  const [view, setView] = useState<"map" | "list">("list");
  const [searchCenter, setSearchCenter] = useState(PARIS);
  const [mapViewportCenter, setMapViewportCenter] = useState(PARIS);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  /** >0 déclenche un flyTo côté carte (géoloc uniquement) */
  const [mapFocusNonce, setMapFocusNonce] = useState(0);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(100);
  const [bearingDeg, setBearingDeg] = useState<number | null>(null);
  const [bearingHalf, setBearingHalf] = useState(45);
  /** AND : le spot doit avoir au moins un équipement par catégorie sélectionnée */
  const [equipmentFilters, setEquipmentFilters] = useState<EquipmentFilterId[]>(
    [],
  );
  const [spots, setSpots] = useState<SpotApiRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [travelById, setTravelById] = useState<
    Record<number, { routeDistanceKm: number | null; routeDurationSec: number | null }>
  >({});
  const [travelLoading, setTravelLoading] = useState(false);
  const [travelError, setTravelError] = useState<string | null>(null);
  /** Bloque le fetch API jusqu’à la 1ʳᵉ tentative de géoloc (évite un hit Paris inutile). */
  const [autoGeoPending, setAutoGeoPending] = useState(true);

  const router = useRouter();

  const onSelectSpotOnMap = useCallback(
    (id: number | null) => {
      if (id != null) router.push(`/spot/${id}`);
    },
    [router],
  );

  const locate = useCallback((isInitialAuto = false) => {
    const finishInitial = () => {
      if (isInitialAuto) setAutoGeoPending(false);
    };
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("GÉOLOC NON SUPPORTÉE");
      finishInitial();
      return;
    }
    setGeoStatus("LOCALISATION…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setGpsLocation({ lat, lng });
        setSearchCenter({ lat, lng });
        setMapViewportCenter({ lat, lng });
        setMapFocusNonce((n) => n + 1);
        setGeoStatus(null);
        finishInitial();
      },
      () => {
        setGeoStatus("REFUS / INDISPONIBLE");
        finishInitial();
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
    );
  }, []);

  const didAutoLocate = useRef(false);
  useEffect(() => {
    if (didAutoLocate.current) return;
    didAutoLocate.current = true;
    locate(true);
  }, [locate]);

  useEffect(() => {
    if (autoGeoPending) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const u = new URL("/api/spots", window.location.origin);
      u.searchParams.set("lat", String(searchCenter.lat));
      u.searchParams.set("lng", String(searchCenter.lng));
      u.searchParams.set("radiusKm", String(radiusKm));
      u.searchParams.set(
        "limit",
        equipmentFilters.length > 0 ? "200" : "80",
      );
      for (const id of equipmentFilters) {
        u.searchParams.append("equip", id);
      }
      if (bearingDeg != null) {
        u.searchParams.set("bearingDeg", String(bearingDeg));
        u.searchParams.set("bearingHalfWidthDeg", String(bearingHalf));
      }
      try {
        const res = await fetch(u.toString(), { signal: ctrl.signal });
        const data = (await res.json()) as ApiPayload;
        if (!res.ok) {
          setError((data as { error?: string }).error ?? res.statusText);
          setSpots([]);
          return;
        }
        setSpots(data.spots ?? []);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
        setSpots([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [
    autoGeoPending,
    searchCenter.lat,
    searchCenter.lng,
    radiusKm,
    bearingDeg,
    bearingHalf,
    equipmentFilters,
  ]);

  const spotsLoading = autoGeoPending || loading;

  useEffect(() => {
    const ac = new AbortController();
    if (spotsLoading || spots.length === 0) {
      setTravelById({});
      setTravelLoading(false);
      setTravelError(null);
      return () => ac.abort();
    }

    const refLat = gpsLocation?.lat ?? searchCenter.lat;
    const refLng = gpsLocation?.lng ?? searchCenter.lng;

    setTravelLoading(true);
    setTravelError(null);

    void (async () => {
      try {
        const res = await fetch("/api/spots/travel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify({
            lat: refLat,
            lng: refLng,
            spots: spots.map((s) => ({
              sourceId: s.sourceId,
              lat: s.lat,
              lng: s.lng,
            })),
          }),
        });
        const data = (await res.json()) as {
          metrics?: TravelMetric[];
          error?: string;
        };
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setTravelError(data.error ?? res.statusText);
          setTravelById({});
          return;
        }
        const next: Record<
          number,
          { routeDistanceKm: number | null; routeDurationSec: number | null }
        > = {};
        for (const m of data.metrics ?? []) {
          next[m.sourceId] = {
            routeDistanceKm: m.routeDistanceKm,
            routeDurationSec: m.routeDurationSec,
          };
        }
        setTravelById(next);
      } catch (e) {
        if (ac.signal.aborted) return;
        setTravelError(e instanceof Error ? e.message : String(e));
        setTravelById({});
      } finally {
        if (!ac.signal.aborted) setTravelLoading(false);
      }
    })();

    return () => ac.abort();
  }, [
    spots,
    spotsLoading,
    gpsLocation?.lat,
    gpsLocation?.lng,
    searchCenter.lat,
    searchCenter.lng,
  ]);

  const searchHereDeltaKm = useMemo(
    () =>
      haversineKm(
        searchCenter.lat,
        searchCenter.lng,
        mapViewportCenter.lat,
        mapViewportCenter.lng,
      ),
    [
      searchCenter.lat,
      searchCenter.lng,
      mapViewportCenter.lat,
      mapViewportCenter.lng,
    ],
  );

  const showSearchHere =
    view === "map" && searchHereDeltaKm >= SEARCH_HERE_MIN_KM;

  const searchHere = useCallback(() => {
    setSearchCenter(mapViewportCenter);
  }, [mapViewportCenter]);

  const onViewportCenterChange = useCallback((lat: number, lng: number) => {
    setMapViewportCenter({ lat, lng });
  }, []);

  const advancedFiltersDirty = useMemo(
    () =>
      bearingDeg != null ||
      radiusKm !== 100 ||
      bearingHalf !== 45 ||
      equipmentFilters.length > 0,
    [bearingDeg, radiusKm, bearingHalf, equipmentFilters.length],
  );

  const toggleEquipmentFilter = useCallback((id: EquipmentFilterId) => {
    setEquipmentFilters((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const clearEquipmentFilters = useCallback(() => {
    setEquipmentFilters([]);
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col border-x border-spotik-border px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-[max(env(safe-area-inset-top),12px)]">
      <header className="mb-4 border-b border-spotik-border pb-4">
        <p className="spotik-label mb-1">STREET WORKOUT · FRANCE</p>
        <h1 className="font-spotik text-[clamp(3.5rem,18vw,5.5rem)] leading-[0.9] tracking-wide text-white">
          SPOTIK
        </h1>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-spotik-muted">
          LISTE OU CARTE · TRI DISTANCE
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-stretch gap-0 border border-spotik-border">
        <button
          type="button"
          onClick={() => locate()}
          className="spotik-btn min-h-12 flex-1 border-r border-spotik-border sm:flex-none"
        >
          MA POSITION
        </button>
        <div className="flex min-h-12 flex-1">
          <button
            type="button"
            onClick={() => setView("list")}
            className={`flex-1 border-r border-spotik-border font-mono text-xs font-semibold uppercase tracking-widest ${
              view === "list" ? "bg-spotik-orange text-black" : "bg-black text-white hover:bg-spotik-orange/20"
            }`}
          >
            LISTE
          </button>
          <button
            type="button"
            onClick={() => setView("map")}
            className={`flex-1 font-mono text-xs font-semibold uppercase tracking-widest ${
              view === "map" ? "bg-spotik-orange text-black" : "bg-black text-white hover:bg-spotik-orange/20"
            }`}
          >
            CARTE
          </button>
        </div>
      </div>

      {geoStatus ? (
        <p className="spotik-label mb-2 border border-spotik-border bg-spotik-orange/10 px-2 py-1">
          {geoStatus}
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 border border-red-600 bg-black px-3 py-2 font-mono text-xs uppercase tracking-wide text-red-500">
          {error}
        </p>
      ) : null}
      {travelError && !spotsLoading ? (
        <p className="mb-2 border border-spotik-border bg-black px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-spotik-muted">
          Itinéraire piéton : {travelError}
        </p>
      ) : null}

      <details className="mb-3 border border-dashed border-spotik-border bg-black/30 [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer list-none px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-spotik-muted transition-colors hover:bg-white/[0.04] hover:text-spotik-orange open:border-b open:border-spotik-border open:bg-black open:text-spotik-muted">
          <span className="flex items-start justify-between gap-2">
            <span>
              <span className="text-white/90">Paramètres avancés</span>
              <span className="mt-1 block text-[9px] font-normal normal-case tracking-normal text-spotik-muted/70">
                Rayon · cap (rose des vents)
              </span>
            </span>
            {advancedFiltersDirty ? (
              <span
                className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-spotik-orange"
                title="Filtres modifiés"
                aria-hidden
              />
            ) : null}
          </span>
        </summary>
        <div className="spotik-box grid gap-4 border-0 p-4">
          <div>
            <span className="spotik-label">RAYON</span>
            <div className="mt-1 flex items-baseline gap-2 border-b border-spotik-border pb-2">
              <span className="font-mono text-2xl tabular-nums text-white">
                {radiusKm}
              </span>
              <span className="font-mono text-xs text-spotik-muted">KM</span>
            </div>
            <input
              type="range"
              min={10}
              max={300}
              step={5}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="mt-3 w-full"
            />
          </div>

          <div>
            <span className="spotik-label">CAP PRÉFÉRÉ</span>
            <div className="mt-2 flex flex-wrap gap-0 border border-spotik-border">
              <button
                type="button"
                onClick={() => setBearingDeg(null)}
                className={`min-h-10 min-w-[3.25rem] border-r border-spotik-border font-mono text-xs font-bold uppercase ${
                  bearingDeg == null
                    ? "bg-spotik-orange text-black"
                    : "bg-black text-white hover:bg-white/5"
                }`}
              >
                ALL
              </button>
              {CARDINALS.map((c, i) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setBearingDeg(c.deg)}
                  className={`min-h-10 min-w-10 border-spotik-border font-mono text-xs font-bold ${
                    i < CARDINALS.length - 1 ? "border-r" : ""
                  } ${
                    bearingDeg === c.deg
                      ? "bg-spotik-orange text-black"
                      : "bg-black text-white hover:bg-white/5"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {bearingDeg != null ? (
              <div className="mt-4 border-t border-spotik-border pt-4">
                <span className="spotik-label">OUVERTURE SECTEUR</span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-xl tabular-nums text-spotik-orange">
                    ±{bearingHalf}°
                  </span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={90}
                  step={5}
                  value={bearingHalf}
                  onChange={(e) => setBearingHalf(Number(e.target.value))}
                  className="mt-2 w-full"
                />
              </div>
            ) : null}
          </div>
        </div>
      </details>

      <div className="mb-3 border border-spotik-border bg-black/30 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="spotik-label">ÉQUIPEMENTS</span>
          {equipmentFilters.length > 0 ? (
            <button
              type="button"
              onClick={clearEquipmentFilters}
              className="font-mono text-[9px] uppercase tracking-widest text-spotik-muted underline decoration-spotik-border underline-offset-2 hover:text-spotik-orange"
            >
              Tout effacer
            </button>
          ) : null}
        </div>
        <p className="mt-1 font-mono text-[9px] leading-relaxed text-spotik-muted/80">
          Un spot doit avoir <span className="text-white/80">tous</span> les
          types cochés (titres importés, FR/EN).
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EQUIPMENT_FILTERS.map((def) => {
            const on = equipmentFilters.includes(def.id);
            return (
              <button
                key={def.id}
                type="button"
                onClick={() => toggleEquipmentFilter(def.id)}
                className={`border px-2 py-1.5 font-mono text-[9px] font-semibold uppercase leading-tight tracking-wide transition-colors ${
                  on
                    ? "border-spotik-orange bg-spotik-orange text-black"
                    : "border-spotik-border bg-black text-spotik-muted hover:border-white/30 hover:text-white"
                }`}
              >
                {def.label}
              </button>
            );
          })}
        </div>
      </div>

      {view === "list" ? (
        <div className="relative min-h-[min(50dvh,400px)] border border-spotik-border bg-black">
          <ul
            className={`flex max-h-[min(60dvh,520px)] flex-col gap-0 overflow-y-auto ${
              spotsLoading ? "pointer-events-none select-none opacity-25" : ""
            }`}
          >
            {spots.map((s) => {
              const refLat = gpsLocation?.lat ?? searchCenter.lat;
              const refLng = gpsLocation?.lng ?? searchCenter.lng;
              const listBearing = geoBearingDeg(refLat, refLng, s.lat, s.lng);
              const directionLabel = bearingToRose8FullFr(listBearing);
              const distFromRef = haversineKm(refLat, refLng, s.lat, s.lng);
              const t = travelById[s.sourceId];
              return (
              <li key={s.sourceId} className="border-b border-spotik-border last:border-b-0">
              <div className="flex min-w-0">
                <Link
                  href={`/spot/${s.sourceId}`}
                  className="flex min-w-0 flex-1 gap-0 border-l-4 border-l-transparent p-0 text-left transition-colors hover:bg-white/[0.03]"
                >
                  {(s.imageUrls?.[0] ?? s.thumbnailUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.imageUrls?.[0] ?? s.thumbnailUrl!}
                      alt=""
                      className="h-20 w-20 shrink-0 border-r border-spotik-border object-cover"
                    />
                  ) : (
                    <div className="h-20 w-20 shrink-0 border-r border-spotik-border bg-spotik-border" />
                  )}
                  <SpotListCompass bearingDeg={listBearing} label={directionLabel} />
                  <div className="min-w-0 flex-1 p-3">
                    <div className="font-spotik text-lg leading-tight tracking-wide text-white">
                      {s.title.toUpperCase()}
                    </div>
                    <div className="mt-1 line-clamp-2 font-mono text-[10px] uppercase tracking-wide text-spotik-muted">
                      {s.address}
                    </div>
                    <div className="mt-2 flex flex-col gap-1 font-mono text-[10px] leading-relaxed">
                      <div className="text-spotik-muted">
                        Ligne droite{" "}
                        <span className="tabular-nums text-spotik-orange">
                          {distFromRef.toFixed(1)} km
                        </span>
                      </div>
                      {t?.routeDistanceKm != null &&
                      t.routeDurationSec != null ? (
                        <div className="text-white">
                          À pied ~{" "}
                          <span className="tabular-nums text-spotik-orange">
                            {t.routeDistanceKm}
                          </span>{" "}
                          km ·{" "}
                          <span className="text-spotik-orange">
                            {formatRouteDuration(t.routeDurationSec)}
                          </span>
                        </div>
                      ) : travelLoading ? (
                        <div className="text-[9px] uppercase tracking-wide text-spotik-muted">
                          Itinéraire piéton…
                        </div>
                      ) : t != null ? (
                        <div className="text-[9px] text-spotik-muted">
                          Itinéraire piéton indisponible
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Link>
                <a
                  href={googleMapsSearchUrl(s.lat, s.lng)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center gap-1 border-l border-spotik-border bg-black px-1 py-2 font-mono text-[8px] font-bold uppercase leading-tight tracking-wide text-white hover:bg-spotik-orange hover:text-black"
                >
                  <span>Maps</span>
                </a>
              </div>
            </li>
              );
            })}
          {!spots.length && !spotsLoading ? (
            <li className="border-b border-spotik-border px-3 py-10 text-center font-mono text-xs uppercase tracking-widest text-spotik-muted">
              {equipmentFilters.length > 0
                ? "AUCUN SPOT AVEC CES ÉQUIPEMENTS — ÉLARGIS OU DÉCOCHE"
                : "AUCUN SPOT — RAYON OU MONGO"}
            </li>
          ) : null}
          </ul>
          {spotsLoading ? (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/90 px-4"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <div
                className="h-10 w-10 shrink-0 animate-spin rounded-full border-2 border-spotik-border border-t-spotik-orange border-r-spotik-orange"
                aria-hidden
              />
              <p className="spotik-label text-center">
                {autoGeoPending ? "LOCALISATION…" : "CHARGEMENT DES SPOTS…"}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="relative w-full">
          {showSearchHere && !spotsLoading ? (
            <button
              type="button"
              onClick={searchHere}
              className="absolute left-1/2 top-3 z-20 -translate-x-1/2 border-2 border-white bg-black px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white shadow-none hover:border-spotik-orange hover:bg-spotik-orange hover:text-black"
            >
              Rechercher ici
            </button>
          ) : null}
          <SpotsMap
            spots={spots}
            searchCenterLat={searchCenter.lat}
            searchCenterLng={searchCenter.lng}
            gpsLocation={gpsLocation}
            onSelectSpot={onSelectSpotOnMap}
            onViewportCenterChange={onViewportCenterChange}
            mapFocusNonce={mapFocusNonce}
          />
          {spotsLoading ? (
            <div
              className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/90 px-4"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <div
                className="h-10 w-10 shrink-0 animate-spin rounded-full border-2 border-spotik-border border-t-spotik-orange border-r-spotik-orange"
                aria-hidden
              />
              <p className="spotik-label text-center">
                {autoGeoPending ? "LOCALISATION…" : "CHARGEMENT DES SPOTS…"}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
