import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SpotComments } from "@/components/SpotComments";
import { getSpotBySourceId } from "@/lib/getSpotBySourceId";
import type { SpotDetail } from "@/types/spot";

function googleMapsSearchUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function galleryUrls(s: SpotDetail): string[] {
  const raw = [
    ...(s.thumbnailUrl ? [s.thumbnailUrl] : []),
    ...(s.imageUrls ?? []),
  ];
  const seen = new Set<string>();
  return raw.filter((u) => {
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}): Promise<Metadata> {
  const { sourceId: raw } = await params;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return { title: "Spot — Spotik" };
  const spot = await getSpotBySourceId(n);
  if (!spot) return { title: "Spot — Spotik" };
  return {
    title: `${spot.title} — Spotik`,
    description: spot.address ?? spot.title,
  };
}

export default async function SpotPage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const { sourceId: raw } = await params;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) notFound();
  const spot = await getSpotBySourceId(n);
  if (!spot) notFound();

  const photos = galleryUrls(spot);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col border-x border-spotik-border px-3 pb-[max(env(safe-area-inset-bottom),16px)] pt-[max(env(safe-area-inset-top),12px)]">
      <nav className="mb-4 border-b border-spotik-border pb-3">
        <Link
          href="/"
          className="inline-block font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-spotik-muted transition-colors hover:text-spotik-orange"
        >
          ← Retour carte
        </Link>
      </nav>

      <header className="mb-4">
        <p className="spotik-label mb-1">SPOT #{spot.sourceId}</p>
        <h1 className="font-spotik text-[clamp(2rem,10vw,3rem)] leading-tight tracking-wide text-white">
          {spot.title.toUpperCase()}
        </h1>
        {spot.name && spot.name !== spot.title ? (
          <p className="mt-2 font-mono text-xs text-spotik-muted">{spot.name}</p>
        ) : null}
        {spot.address ? (
          <p className="mt-3 font-mono text-xs leading-relaxed text-white/90">
            {spot.address}
          </p>
        ) : null}
        <p className="mt-2 font-mono text-[10px] tabular-nums text-spotik-orange">
          {spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}
        </p>
      </header>

      {photos.length > 0 ? (
        <section className="mb-4">
          <p className="spotik-label mb-2">PHOTOS</p>
          <ul className="grid grid-cols-2 gap-px border border-spotik-border bg-spotik-border">
            {photos.map((url, i) => (
              <li key={`${url}-${i}`} className="aspect-square bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                  loading={i < 4 ? "eager" : "lazy"}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="mb-4 border border-spotik-border bg-spotik-border/20 px-3 py-8 text-center font-mono text-[10px] uppercase tracking-widest text-spotik-muted">
          Aucune photo
        </div>
      )}

      {(spot.equipments?.length ?? 0) > 0 ? (
        <section className="mb-4">
          <p className="spotik-label mb-2">ÉQUIPEMENTS</p>
          <ul className="flex flex-wrap gap-1">
            {spot.equipments.map((e, i) => (
              <li
                key={`${e.title}-${i}`}
                className="border border-spotik-border px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-white"
              >
                {e.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(spot.disciplines?.length ?? 0) > 0 ? (
        <section className="mb-4">
          <p className="spotik-label mb-2">DISCIPLINES</p>
          <ul className="flex flex-wrap gap-1">
            {spot.disciplines.map((d, i) => (
              <li
                key={`${d.title}-${i}`}
                className="border border-spotik-border px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-spotik-muted"
              >
                {d.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mb-4">
        <a
          href={googleMapsSearchUrl(spot.lat, spot.lng)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center border-2 border-white py-3 font-mono text-xs font-bold uppercase tracking-widest text-white hover:bg-white hover:text-black"
        >
          Ouvrir sur Google Maps
        </a>
      </div>

      <section className="border-t border-spotik-border pt-4">
        <SpotComments sourceId={spot.sourceId} />
      </section>
    </div>
  );
}
