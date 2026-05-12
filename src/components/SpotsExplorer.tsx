"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpotComments } from "@/components/SpotComments";
import { SpotsMap } from "@/components/SpotsMap";
import type { SpotApiRow } from "@/types/spot";
import { haversineKm } from "@/lib/geo";

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
  const [spots, setSpots] = useState<SpotApiRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /** Bloque le fetch API jusqu’à la 1ʳᵉ tentative de géoloc (évite un hit Paris inutile). */
  const [autoGeoPending, setAutoGeoPending] = useState(true);

  const selectedSpot = useMemo(
    () => spots.find((s) => s.sourceId === selectedId) ?? null,
    [spots, selectedId],
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
      u.searchParams.set("limit", "80");
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

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col border-x border-spotik-border px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-[max(env(safe-area-inset-top),12px)]">
      <header className="mb-4 border-b border-spotik-border pb-4">
        <p className="spotik-label mb-1">STREET WORKOUT · FRANCE</p>
        <h1 className="font-spotik text-[clamp(3.5rem,18vw,5.5rem)] leading-[0.9] tracking-wide text-white">
          SPOTIK
        </h1>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-spotik-muted">
          LISTE OU CARTE · TRI DISTANCE · FILTRE CAP (EX. SUD)
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
        {loading ? (
          <span className="flex min-w-[5rem] items-center justify-center border-l border-spotik-border px-2 font-mono text-[10px] uppercase tracking-widest text-spotik-orange">
            SYNC…
          </span>
        ) : null}
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

      <section className="spotik-box mb-3 grid gap-4 p-4">
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
      </section>

      {view === "list" ? (
        <ul className="flex max-h-[min(60dvh,520px)] flex-col gap-0 overflow-y-auto border border-spotik-border">
          {spots.map((s) => (
            <li key={s.sourceId} className="border-b border-spotik-border last:border-b-0">
              <div className="flex min-w-0">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedId(selectedId === s.sourceId ? null : s.sourceId)
                  }
                  className={`flex min-w-0 flex-1 gap-0 border-l-4 p-0 text-left transition-colors ${
                    selectedId === s.sourceId
                      ? "border-l-spotik-orange bg-spotik-orange/10"
                      : "border-l-transparent hover:bg-white/[0.03]"
                  }`}
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
                  <div className="min-w-0 flex-1 p-3">
                    <div className="font-spotik text-lg leading-tight tracking-wide text-white">
                      {s.title.toUpperCase()}
                    </div>
                    <div className="mt-1 line-clamp-2 font-mono text-[10px] uppercase tracking-wide text-spotik-muted">
                      {s.address}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-spotik-orange">
                      <span>DIST {s.distanceKm.toFixed(1)} KM</span>
                      <span>CAP {Math.round(s.bearingDeg)}°</span>
                    </div>
                  </div>
                </button>
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
          ))}
          {!spots.length && !loading && !autoGeoPending ? (
            <li className="border-b border-spotik-border px-3 py-10 text-center font-mono text-xs uppercase tracking-widest text-spotik-muted">
              AUCUN SPOT — RAYON OU MONGO
            </li>
          ) : null}
        </ul>
      ) : (
        <div className="relative">
          {showSearchHere ? (
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
            selectedId={selectedId}
            onSelectSpot={setSelectedId}
            onViewportCenterChange={onViewportCenterChange}
            mapFocusNonce={mapFocusNonce}
          />
        </div>
      )}

      {selectedSpot ? (
        <aside className="sticky bottom-0 z-10 mt-3 border-2 border-white bg-black p-4">
          <div className="flex justify-between gap-3 border-b border-spotik-border pb-3">
            <div className="min-w-0">
              <p className="spotik-label mb-1">SÉLECTION</p>
              <div className="font-spotik text-xl leading-tight tracking-wide text-white">
                {selectedSpot.title.toUpperCase()}
              </div>
              <div className="mt-2 font-mono text-xs text-spotik-orange">
                DIST {selectedSpot.distanceKm.toFixed(1)} KM · CAP{" "}
                {Math.round(selectedSpot.bearingDeg)}°
              </div>
            </div>
            <button
              type="button"
              className="h-10 shrink-0 border border-white px-3 font-mono text-[10px] font-bold uppercase tracking-widest text-white hover:bg-spotik-orange hover:text-black"
              onClick={() => setSelectedId(null)}
            >
              FERMER
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a
              href={googleMapsSearchUrl(selectedSpot.lat, selectedSpot.lng)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center border border-white px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white hover:bg-white hover:text-black"
            >
              Ouvrir sur Google Maps
            </a>
            {selectedSpot.sourceCanonicalUrl ? (
              <a
                href={selectedSpot.sourceCanonicalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center border border-spotik-orange px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-spotik-orange hover:bg-spotik-orange hover:text-black"
              >
                Source externe →
              </a>
            ) : null}
          </div>
          <SpotComments sourceId={selectedSpot.sourceId} />
        </aside>
      ) : null}
    </div>
  );
}
