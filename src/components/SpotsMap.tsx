"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import Map, { Layer, Source } from "react-map-gl/mapbox";
import type {
  MapMouseEvent,
  MapRef,
  ViewStateChangeEvent,
} from "react-map-gl/mapbox";
import type { Map as MapboxMap, MapboxEvent } from "mapbox-gl";
import type { SpotApiRow } from "@/types/spot";
import { haversineKm } from "@/lib/geo";
import "mapbox-gl/dist/mapbox-gl.css";

const MAP_STYLE = "mapbox://styles/mapbox/dark-v11";

const GPS_SEPARATE_KM = 0.08;

const IMG_SPOT_DEFAULT = "spotik-pin-default";
const IMG_GPS = "spotik-pin-gps";

function spotThumbUrl(s: SpotApiRow): string | null {
  const u = s.imageUrls?.[0] ?? s.thumbnailUrl;
  return u && u.length > 0 ? u : null;
}

function spotPhotoIconId(sourceId: number): string {
  return `spotik-thumb-${sourceId}`;
}

function makeCanvas(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  draw(ctx);
  return c;
}

/** Pastille orange = spot sans photo (ou en attente de chargement). */
function makeSpotDefaultIcon(): HTMLCanvasElement {
  return makeCanvas(64, 64, (ctx) => {
    const s = 64;
    const cx = s / 2;
    const cy = s / 2;
    const r = s * 0.28;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ff4d00";
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 4;
    ctx.stroke();
  });
}

/** Flèche cyan + contour noir : position GPS (ne ressemble pas à une pastille spot). */
function makeGpsIcon(): HTMLCanvasElement {
  return makeCanvas(72, 72, (ctx) => {
    ctx.translate(36, 36);
    ctx.scale(0.85, 0.85);
    ctx.fillStyle = "#22d3ee";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(17, 12);
    ctx.lineTo(0, 4);
    ctx.lineTo(-17, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, -6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function makeRoundedPhotoIcon(
  img: HTMLImageElement | ImageBitmap,
  size = 52,
): HTMLCanvasElement {
  const pad = 3;
  const total = size + pad * 2;
  const r = 10;
  return makeCanvas(total, total, (ctx) => {
    const x = pad;
    const y = pad;
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, size, size, r);
    } else {
      ctx.rect(x, y, size, size);
    }
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
    ctx.strokeStyle = "#ff4d00";
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, size, size, r);
    } else {
      ctx.rect(x, y, size, size);
    }
    ctx.stroke();
  });
}

/** Mapbox accepte les canvas à l’exécution ; les types .d.ts sont incomplets. */
function asStyleImage(c: HTMLCanvasElement) {
  return c as unknown as HTMLImageElement;
}

function ensureBuiltInImages(map: MapboxMap) {
  if (!map.hasImage(IMG_SPOT_DEFAULT)) {
    map.addImage(IMG_SPOT_DEFAULT, asStyleImage(makeSpotDefaultIcon()), {
      pixelRatio: 2,
    });
  }
  if (!map.hasImage(IMG_GPS)) {
    map.addImage(IMG_GPS, asStyleImage(makeGpsIcon()), { pixelRatio: 2 });
  }
}

function cleanupStaleThumbImages(map: MapboxMap, keepIds: Set<string>) {
  for (const id of map.listImages()) {
    if (id.startsWith("spotik-thumb-") && !keepIds.has(id)) {
      try {
        map.removeImage(id);
      } catch {
        /* ignore */
      }
    }
  }
}

type Props = {
  spots: SpotApiRow[];
  /** Centre utilisé pour l’API (marqueur orange « origine recherche ») */
  searchCenterLat: number;
  searchCenterLng: number;
  /** Position GPS si connue (2e marqueur si assez loin du centre de recherche) */
  gpsLocation: { lat: number; lng: number } | null;
  onSelectSpot: (id: number | null) => void;
  /** Centre géographique actuel de la vue carte */
  onViewportCenterChange: (lat: number, lng: number) => void;
  /** Incrémenté quand le parent veut recentrer la caméra (géoloc, « rechercher ici ») */
  mapFocusNonce: number;
};

export function SpotsMap({
  spots,
  searchCenterLat,
  searchCenterLng,
  gpsLocation,
  onSelectSpot,
  onViewportCenterChange,
  mapFocusNonce,
}: Props) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapRef = useRef<MapRef>(null);
  const spotsRef = useRef(spots);
  spotsRef.current = spots;

  const spotsGeojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: spots.map((s) => {
        const url = spotThumbUrl(s);
        return {
          type: "Feature" as const,
          properties: {
            sourceId: s.sourceId,
            title: s.title,
            distanceKm: Math.round(s.distanceKm * 10) / 10,
            iconId: url ? spotPhotoIconId(s.sourceId) : IMG_SPOT_DEFAULT,
          },
          geometry: {
            type: "Point" as const,
            coordinates: [s.lng, s.lat],
          },
        };
      }),
    }),
    [spots],
  );

  const searchGeojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "Point" as const,
            coordinates: [searchCenterLng, searchCenterLat],
          },
        },
      ],
    }),
    [searchCenterLat, searchCenterLng],
  );

  const showGpsMarker =
    gpsLocation != null &&
    haversineKm(
      searchCenterLat,
      searchCenterLng,
      gpsLocation.lat,
      gpsLocation.lng,
    ) > GPS_SEPARATE_KM;

  const gpsGeojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: showGpsMarker
        ? [
            {
              type: "Feature" as const,
              properties: {},
              geometry: {
                type: "Point" as const,
                coordinates: [gpsLocation!.lng, gpsLocation!.lat],
              },
            },
          ]
        : [],
    }),
    [gpsLocation, showGpsMarker],
  );

  const syncThumbImages = useCallback((map: MapboxMap) => {
    ensureBuiltInImages(map);
    const list = spotsRef.current;
    const keep = new Set<string>();
    for (const s of list) {
      const url = spotThumbUrl(s);
      if (!url) continue;
      const id = spotPhotoIconId(s.sourceId);
      keep.add(id);
      const placeholder = makeSpotDefaultIcon();
      if (!map.hasImage(id)) {
        map.addImage(id, asStyleImage(placeholder), { pixelRatio: 2 });
      }
      map.loadImage(url, (err, image) => {
        if (err || !image || image instanceof ImageData) return;
        if (!spotsRef.current.some((x) => spotPhotoIconId(x.sourceId) === id))
          return;
        try {
          const canvas = makeRoundedPhotoIcon(image);
          if (map.hasImage(id)) map.updateImage(id, asStyleImage(canvas));
          else map.addImage(id, asStyleImage(canvas), { pixelRatio: 2 });
        } catch {
          /* CORS / decode */
        }
      });
    }
    cleanupStaleThumbImages(map, keep);
  }, []);

  useLayoutEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map?.isStyleLoaded()) return;
    syncThumbImages(map);
  }, [spots, syncThumbImages]);

  useEffect(() => {
    if (mapFocusNonce === 0) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.flyTo({
      center: [searchCenterLng, searchCenterLat],
      duration: 550,
      essential: true,
    });
  }, [mapFocusNonce, searchCenterLat, searchCenterLng]);

  const onMapLoad = useCallback(
    (e: MapboxEvent) => {
      const map = e.target;
      ensureBuiltInImages(map);
      syncThumbImages(map);
    },
    [syncThumbImages],
  );

  const onMapClick = useCallback(
    (e: MapMouseEvent) => {
      const f = e.features?.[0];
      if (!f?.properties?.sourceId) {
        onSelectSpot(null);
        return;
      }
      onSelectSpot(Number(f.properties.sourceId));
    },
    [onSelectSpot],
  );

  const onMoveEnd = useCallback(
    (e: ViewStateChangeEvent) => {
      onViewportCenterChange(e.viewState.latitude, e.viewState.longitude);
    },
    [onViewportCenterChange],
  );

  if (!token) {
    return (
      <div className="flex h-full min-h-[50dvh] flex-col items-center justify-center border-2 border-spotik-orange bg-black p-6 text-center">
        <p className="spotik-label mb-2">MAPBOX</p>
        <p className="font-mono text-xs uppercase tracking-wide text-spotik-muted">
          Définis{" "}
          <code className="border border-spotik-border bg-spotik-orange/10 px-1 text-spotik-orange">
            NEXT_PUBLIC_MAPBOX_TOKEN
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[min(70dvh,560px)] w-full overflow-hidden border-2 border-spotik-border bg-black">
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        mapStyle={MAP_STYLE}
        initialViewState={{
          latitude: searchCenterLat,
          longitude: searchCenterLng,
          zoom: 10,
        }}
        interactiveLayerIds={["unclustered-point", "clusters"]}
        onLoad={onMapLoad}
        onClick={onMapClick}
        onMoveEnd={onMoveEnd}
        style={{ width: "100%", height: "100%" }}
      >
        <Source id="search-origin" type="geojson" data={searchGeojson}>
          <Layer
            id="search-circle"
            type="circle"
            paint={{
              "circle-radius": 11,
              "circle-color": "#ff4d00",
              "circle-stroke-width": 3,
              "circle-stroke-color": "#000000",
            }}
          />
        </Source>
        {showGpsMarker ? (
          <Source id="gps" type="geojson" data={gpsGeojson}>
            <Layer
              id="gps-symbol"
              type="symbol"
              layout={{
                "icon-image": IMG_GPS,
                "icon-size": 0.55,
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "icon-anchor": "top",
              }}
            />
          </Source>
        ) : null}
        <Source
          id="spots"
          type="geojson"
          data={spotsGeojson}
          cluster
          clusterMaxZoom={14}
          clusterRadius={52}
        >
          <Layer
            id="clusters"
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": [
                "step",
                ["get", "point_count"],
                "#ff4d00",
                15,
                "#ff6a33",
                50,
                "#ff8533",
              ],
              "circle-radius": [
                "step",
                ["get", "point_count"],
                18,
                15,
                22,
                50,
                28,
              ],
              "circle-opacity": 1,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#000000",
            }}
          />
          <Layer
            id="cluster-count"
            type="symbol"
            filter={["has", "point_count"]}
            layout={{
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
              "text-size": 11,
            }}
            paint={{ "text-color": "#000000" }}
          />
          <Layer
            id="unclustered-point"
            type="symbol"
            filter={["!", ["has", "point_count"]]}
            layout={{
              "icon-image": ["get", "iconId"],
              "icon-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                8,
                0.28,
                11,
                0.36,
                14,
                0.48,
              ],
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
            }}
          />
        </Source>
      </Map>
    </div>
  );
}
