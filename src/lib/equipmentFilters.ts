/**
 * Filtres équipement : correspondance insensible à la casse / accents
 * sur les titres importés (souvent EN, parfois FR).
 */
export const EQUIPMENT_FILTER_IDS = [
  "pullup",
  "dip",
  "rings",
  "bench",
  "wallbars",
  "pushup",
  "abs",
  "rope",
] as const;

export type EquipmentFilterId = (typeof EQUIPMENT_FILTER_IDS)[number];

export type EquipmentFilterDef = {
  id: EquipmentFilterId;
  /** Libellé UI */
  label: string;
  /** Sous-chaînes à chercher dans le titre normalisé */
  terms: string[];
};

export const EQUIPMENT_FILTERS: EquipmentFilterDef[] = [
  {
    id: "pullup",
    label: "Barres / tractions",
    terms: [
      "pull-up",
      "pull up",
      "pullup",
      "chin-up",
      "chin up",
      "traction",
      "high bar",
      "horizontal bar",
      "monkey bar",
      "barre fixe",
      "fixed bar",
    ],
  },
  {
    id: "dip",
    label: "Dips / parallèles",
    terms: [
      "dip station",
      "dip bar",
      "parallel bar",
      "parallel bars",
      "p-bar",
      "p bar",
      "dip",
      "dips",
      "barres parall",
      "parallettes",
    ],
  },
  {
    id: "rings",
    label: "Anneaux",
    terms: ["ring", "rings", "anneau", "anneaux", "gymnastic ring"],
  },
  {
    id: "bench",
    label: "Banc / box",
    terms: ["bench", "box jump", "jump box", "plyo box", "banc"],
  },
  {
    id: "wallbars",
    label: "Espalier / Swedish ladder",
    terms: [
      "wall bar",
      "wall bars",
      "swedish ladder",
      "stall bar",
      "stall bars",
      "espalier",
    ],
  },
  {
    id: "pushup",
    label: "Barres basses / pompes",
    terms: ["push-up", "push up", "pushup", "low bar", "incline"],
  },
  {
    id: "abs",
    label: "Abdos / sit-up",
    terms: ["sit-up", "sit up", "situp", "ab bench", "abdominal", "abdos"],
  },
  {
    id: "rope",
    label: "Corde / grimper",
    terms: ["rope", "climbing rope", "corde"],
  },
];

const byId = new Map<EquipmentFilterId, EquipmentFilterDef>(
  EQUIPMENT_FILTERS.map((d) => [d.id, d]),
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Correspondance : sous-chaîne pour les termes longs ;
 * termes courts (≤4) = « mot » approximatif pour éviter ring→string.
 */
function titleMatchesTerm(normalizedTitle: string, termRaw: string): boolean {
  const term = normalizeEquipmentTitle(termRaw);
  if (term.length === 0) return false;
  if (term.length <= 4) {
    const re = new RegExp(
      `(?:^|[^a-z0-9])${escapeRegExp(term)}(?:[^a-z0-9]|$)`,
      "i",
    );
    return re.test(normalizedTitle);
  }
  return normalizedTitle.includes(term);
}

export function normalizeEquipmentTitle(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** true si au moins un équipement du spot matche la catégorie */
export function spotHasEquipmentCategory(
  equipmentTitles: string[],
  def: EquipmentFilterDef,
): boolean {
  const normalizedTitles = equipmentTitles.map((t) => normalizeEquipmentTitle(t));
  return normalizedTitles.some((nt) =>
    def.terms.some((term) => titleMatchesTerm(nt, term)),
  );
}

/** AND entre catégories sélectionnées */
export function spotMatchesEquipmentFilterIds(
  equipments: { title: string }[],
  filterIds: EquipmentFilterId[],
): boolean {
  if (filterIds.length === 0) return true;
  const titles = equipments.map((e) => e.title);
  return filterIds.every((id) => {
    const def = byId.get(id);
    if (!def) return true;
    return spotHasEquipmentCategory(titles, def);
  });
}

export function parseEquipmentFilterParams(
  raw: string | null,
): EquipmentFilterId[] {
  if (raw == null || raw.trim() === "") return [];
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out: EquipmentFilterId[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (!EQUIPMENT_FILTER_IDS.includes(p as EquipmentFilterId)) continue;
    const id = p as EquipmentFilterId;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** `?equip=pullup,dip` ou plusieurs `equip=` */
export function parseEquipmentFiltersFromUrl(
  searchParams: URLSearchParams,
): EquipmentFilterId[] {
  return parseEquipmentFilterParams(searchParams.getAll("equip").join(","));
}
