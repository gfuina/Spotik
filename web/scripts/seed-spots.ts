/**
 * Seed MongoDB from spots_france.json (upsert by sourceId).
 * Usage: cd web && npx tsx scripts/seed-spots.ts [--file ../spots_france.json]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MongoClient, type Document } from "mongodb";
import type { SpotDiscipline, SpotDocument, SpotEquipment } from "../src/types/spot";

function parseArgs(argv: string[]) {
  let file = path.resolve(process.cwd(), "..", "spots_france.json");
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file" && i + 1 < argv.length) {
      file = path.resolve(argv[++i]);
    }
  }
  return { file };
}

function absUrl(u: string): string {
  const s = String(u);
  return s.startsWith("//") ? `https:${s}` : s;
}

function mapSpot(raw: Record<string, unknown>): SpotDocument {
  const id = Number(raw.id);
  const detail = (raw.detail ?? {}) as Record<string, unknown>;
  const lat = Number(raw.lat);
  const lng = Number(raw.lon);
  const og = (detail.og ?? {}) as Record<string, string>;

  const equipments: SpotEquipment[] = Array.isArray(detail.equipments)
    ? (detail.equipments as { title?: string; url?: string }[]).map((e) => ({
        title: String(e.title ?? ""),
        sourceUrl: e.url,
      }))
    : [];

  const disciplines: SpotDiscipline[] = Array.isArray(detail.disciplines)
    ? (detail.disciplines as { title?: string; url?: string }[]).map((d) => ({
        title: String(d.title ?? ""),
        sourceUrl: d.url,
      }))
    : [];

  const thumb =
    (raw.list_thumbnail_url as string | null) ??
    (og.image ? absUrl(String(og.image)) : null);

  const fromGallery = Array.isArray(detail.photo_urls)
    ? (detail.photo_urls as unknown[]).map((x) => absUrl(String(x)))
    : [];
  const ogImage = og.image ? absUrl(String(og.image)) : null;
  const sourceImageUrls = [...fromGallery];
  if (ogImage && !sourceImageUrls.includes(ogImage)) {
    sourceImageUrls.unshift(ogImage);
  }

  return {
    sourceId: id,
    title: String(raw.title ?? ""),
    name: raw.name != null ? String(raw.name) : null,
    address: raw.address != null ? String(raw.address) : null,
    location: { type: "Point", coordinates: [lng, lat] },
    thumbnailUrl: thumb,
    imageUrls: [],
    sourceImageUrls,
    equipments,
    disciplines,
    sourceCanonicalUrl: detail.canonical_url
      ? String(detail.canonical_url)
      : null,
    listSpotUrl: raw.list_spot_url != null ? String(raw.list_spot_url) : null,
    importedAt: new Date(),
  };
}

function buildUpsertPipeline(doc: SpotDocument): Document[] {
  const thumb = doc.thumbnailUrl ?? "";
  return [
    {
      $set: {
        sourceId: doc.sourceId,
        title: doc.title,
        name: doc.name,
        address: doc.address,
        location: doc.location,
        equipments: doc.equipments,
        disciplines: doc.disciplines,
        sourceCanonicalUrl: doc.sourceCanonicalUrl,
        listSpotUrl: doc.listSpotUrl,
        importedAt: doc.importedAt,
        sourceImageUrls: doc.sourceImageUrls,
      },
    },
    {
      $set: {
        imageUrls: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ["$imageUrls", []] } }, 0] },
            "$imageUrls",
            [],
          ],
        },
      },
    },
    {
      $set: {
        thumbnailUrl: {
          $cond: [
            {
              $regexMatch: {
                input: { $ifNull: ["$thumbnailUrl", ""] },
                regex: "vercel-storage\\.com",
              },
            },
            "$thumbnailUrl",
            thumb || null,
          ],
        },
      },
    },
  ];
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Set MONGODB_URI");
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB ?? "workout";
  const { file } = parseArgs(process.argv);
  const text = await readFile(file, "utf-8");
  const data = JSON.parse(text) as { spots?: Record<string, unknown>[] };
  const rows = data.spots ?? [];
  if (!rows.length) {
    console.error("No spots in file:", file);
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db(dbName).collection<SpotDocument>("spots");

  const ops = rows.map((raw) => {
    const doc = mapSpot(raw);
    return {
      updateOne: {
        filter: { sourceId: doc.sourceId },
        update: buildUpsertPipeline(doc),
        upsert: true,
      },
    };
  });

  for (let i = 0; i < ops.length; i += 500) {
    const chunk = ops.slice(i, i + 500);
    await col.bulkWrite(chunk, { ordered: false });
    console.error(
      `Upserted ${Math.min(i + chunk.length, ops.length)}/${ops.length}`,
    );
  }

  await col.createIndex({ sourceId: 1 }, { unique: true });
  await col.createIndex({ location: "2dsphere" });

  console.error("Indexes: sourceId unique, location 2dsphere");
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
