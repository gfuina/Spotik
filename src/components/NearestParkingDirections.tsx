"use client";

import { useCallback, useState } from "react";

function googleDrivingDirectionsUrl(destLat: number, destLng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${destLat},${destLng}`)}&travelmode=driving`;
}

type ApiOk = {
  parking: { lat: number; lng: number; name: string | null; distanceM: number };
};

type ApiNoParking = {
  error: "no_parking";
  message?: string;
  spot?: { lat: number; lng: number };
};

type Props = { sourceId: number };

export function NearestParkingDirections({ sourceId }: Props) {
  const [phase, setPhase] = useState<"idle" | "loading">("idle");
  const [noParkingUrl, setNoParkingUrl] = useState<string | null>(null);
  const [errLine, setErrLine] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    setPhase("loading");
    setNoParkingUrl(null);
    setErrLine(null);
    try {
      const res = await fetch(`/api/spots/${sourceId}/nearest-parking`, {
        method: "GET",
      });
      const data = (await res.json()) as ApiOk | ApiNoParking | { error?: string };

      if (res.ok && "parking" in data && data.parking) {
        setPhase("idle");
        window.open(
          googleDrivingDirectionsUrl(data.parking.lat, data.parking.lng),
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }

      if (res.status === 404 && "error" in data && data.error === "no_parking") {
        const spot = "spot" in data ? data.spot : undefined;
        setNoParkingUrl(
          spot
            ? `https://www.google.com/maps/search/parking/@${spot.lat},${spot.lng},17z`
            : "https://www.google.com/maps/search/parking/",
        );
        setPhase("idle");
        return;
      }

      setPhase("idle");
      setErrLine(
        typeof (data as { error?: string }).error === "string"
          ? (data as { error: string }).error
          : res.statusText,
      );
    } catch (e) {
      setPhase("idle");
      setErrLine(e instanceof Error ? e.message : String(e));
    }
  }, [sourceId]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={phase === "loading"}
        className="inline-flex w-full items-center justify-center border-2 border-spotik-orange bg-transparent py-3 font-mono text-xs font-bold uppercase tracking-widest text-spotik-orange hover:bg-spotik-orange hover:text-black disabled:opacity-50"
      >
        {phase === "loading"
          ? "Recherche parking…"
          : "Itinéraire → parking proche"}
      </button>
      <p className="font-mono text-[9px] leading-relaxed text-spotik-muted">
        OpenStreetMap (~1,4 km). Ouvre Google Maps en voiture vers le point
        trouvé ; le départ = ta position actuelle dans Maps.
      </p>
      {noParkingUrl ? (
        <p className="font-mono text-[10px] leading-relaxed text-spotik-muted">
          Aucun parking OSM dans le rayon.{" "}
          <a
            href={noParkingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-spotik-orange underline underline-offset-2"
          >
            Chercher « parking » sur Maps
          </a>
        </p>
      ) : null}
      {errLine ? (
        <p className="font-mono text-[10px] text-red-400">{errLine}</p>
      ) : null}
    </div>
  );
}
