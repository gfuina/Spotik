export type SpotEquipment = { title: string; sourceUrl?: string };
export type SpotDiscipline = { title: string; sourceUrl?: string };

export type GeoPoint = {
  type: "Point";
  coordinates: [number, number];
};

export type SpotDocument = {
  sourceId: number;
  title: string;
  name: string | null;
  address: string | null;
  location: GeoPoint;
  thumbnailUrl: string | null;
  /** URLs hébergées (Vercel Blob) après mirror */
  imageUrls: string[];
  /** URLs d’origine (calisthenics-parks) pour le script mirror */
  sourceImageUrls?: string[];
  equipments: SpotEquipment[];
  disciplines: SpotDiscipline[];
  sourceCanonicalUrl: string | null;
  listSpotUrl: string | null;
  importedAt: Date;
};

export type SpotApiRow = {
  sourceId: number;
  title: string;
  name: string | null;
  address: string | null;
  lat: number;
  lng: number;
  distanceKm: number;
  bearingDeg: number;
  thumbnailUrl: string | null;
  imageUrls: string[];
  equipments: SpotEquipment[];
  disciplines: SpotDiscipline[];
  sourceCanonicalUrl: string | null;
};

/** Fiche spot (page détail) — pas de distance / cap (dépend du point de vue). */
export type SpotDetail = {
  sourceId: number;
  title: string;
  name: string | null;
  address: string | null;
  lat: number;
  lng: number;
  thumbnailUrl: string | null;
  imageUrls: string[];
  equipments: SpotEquipment[];
  disciplines: SpotDiscipline[];
};
