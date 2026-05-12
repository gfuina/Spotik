import { cache } from "react";
import { SPOTS_COLLECTION, getDb } from "@/lib/mongodb";
import type { SpotDetail, SpotDocument } from "@/types/spot";

export const getSpotBySourceId = cache(async function getSpotBySourceId(
  sourceId: number,
): Promise<SpotDetail | null> {
  const db = await getDb();
  const d = await db.collection<SpotDocument>(SPOTS_COLLECTION).findOne(
    { sourceId },
    {
      projection: {
        sourceId: 1,
        title: 1,
        name: 1,
        address: 1,
        location: 1,
        thumbnailUrl: 1,
        imageUrls: 1,
        equipments: 1,
        disciplines: 1,
      },
    },
  );
  if (!d?.location?.coordinates) return null;
  const [lng, lat] = d.location.coordinates;
  return {
    sourceId: d.sourceId,
    title: d.title,
    name: d.name,
    address: d.address,
    lat,
    lng,
    thumbnailUrl: d.thumbnailUrl,
    imageUrls: d.imageUrls ?? [],
    equipments: d.equipments ?? [],
    disciplines: d.disciplines ?? [],
  };
});
