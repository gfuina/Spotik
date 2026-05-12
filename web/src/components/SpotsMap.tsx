"use client";

import { useCallback, useMemo } from "react";
import Map, { Layer, Source } from "react-map-gl/mapbox";
import type { MapMouseEvent } from "react-map-gl/mapbox";
import type { SpotApiRow } from "@/types/spot";
import "mapbox-gl/dist/mapbox-gl.css";

const MAP_STYLE = "mapbox://styles/mapbox/dark-v11";

type Props = {
  spots: SpotApiRow[];
  userLat: number;
  userLng: number;
  selectedId: number | null;
  onSelectSpot: (id: number | null) => void;
};

export function SpotsMap({
  spots,
  userLat,
  userLng,
  selectedId,
  onSelectSpot,
}: Props) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const spotsGeojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: spots.map((s) => ({
        type: "Feature" as const,
        properties: {
          sourceId: s.sourceId,
          title: s.title,
          distanceKm: Math.round(s.distanceKm * 10) / 10,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [s.lng, s.lat],
        },
      })),
    }),
    [spots],
  );

  const userGeojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: { type: "Point" as const, coordinates: [userLng, userLat] },
        },
      ],
    }),
    [userLat, userLng],
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
        mapboxAccessToken={token}
        mapStyle={MAP_STYLE}
        initialViewState={{
          latitude: userLat,
          longitude: userLng,
          zoom: 10,
        }}
        interactiveLayerIds={["unclustered-point", "clusters"]}
        onClick={onMapClick}
        style={{ width: "100%", height: "100%" }}
      >
        <Source id="user" type="geojson" data={userGeojson}>
          <Layer
            id="user-circle"
            type="circle"
            paint={{
              "circle-radius": 11,
              "circle-color": "#ff4d00",
              "circle-stroke-width": 3,
              "circle-stroke-color": "#000000",
            }}
          />
        </Source>
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
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={
              {
                "circle-color":
                  selectedId != null
                    ? [
                        "case",
                        [
                          "==",
                          ["to-number", ["get", "sourceId"]],
                          selectedId,
                        ],
                        "#ffffff",
                        "#ff4d00",
                      ]
                    : "#ff4d00",
                "circle-radius": 8,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#000000",
              } as Record<string, unknown>
            }
          />
        </Source>
      </Map>
    </div>
  );
}
