/**
 * Upload spot photos to Vercel Blob and update MongoDB.
 * cd web && npx tsx scripts/mirror-photos-to-blob.ts [--max-spots 50] [--delay-ms 400] [--force]
 */
import { put } from "@vercel/blob";
import { MongoClient } from "mongodb";
import type { SpotDocument } from "../src/types/spot";

function parseArgs(argv: string[]) {
  let maxSpots = Infinity;
  let delayMs = 400;
  let force = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--max-spots" && argv[i + 1]) maxSpots = Number(argv[++i]);
    else if (a === "--delay-ms" && argv[i + 1]) delayMs = Number(argv[++i]);
    else if (a === "--force") force = true;
  }
  return { maxSpots, delayMs, force };
}

function extFromMime(m: string | null): string {
  if (!m) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "jpg";
}

function isBlobUrl(u: string): boolean {
  return u.includes("vercel-storage.com") || u.includes("blob.vercel-storage");
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!uri || !token) {
    console.error("Need MONGODB_URI and BLOB_READ_WRITE_TOKEN");
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB ?? "workout";
  const { maxSpots, delayMs, force } = parseArgs(process.argv);

  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db(dbName).collection<SpotDocument>("spots");

  let mirrored = 0;
  const cursor = col.find({}, { sort: { sourceId: 1 } });

  for await (const doc of cursor) {
    const urls = doc.sourceImageUrls ?? [];
    if (!urls.length) continue;

    const hasBlob =
      Array.isArray(doc.imageUrls) &&
      doc.imageUrls.length > 0 &&
      doc.imageUrls.every((u) => isBlobUrl(u));
    if (hasBlob && !force) continue;

    if (mirrored >= maxSpots) break;

    const uploaded: string[] = [];
    let idx = 0;
    for (const src of urls) {
      const pathname = `spots/${doc.sourceId}/${idx}`;
      try {
        const res = await fetch(src, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; workout-map-mirror/1.0; +https://vercel.com)",
            Accept: "image/*,*/*;q=0.8",
          },
        });
        if (!res.ok) {
          console.error(`skip fetch ${doc.sourceId} ${idx} ${res.status}`);
          idx++;
          if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const ext = extFromMime(res.headers.get("content-type"));
        const fullPath = `${pathname}.${ext}`;
        const blob = await put(fullPath, buf, {
          access: "public",
          token,
          contentType:
            res.headers.get("content-type") ||
            (ext === "jpg" ? "image/jpeg" : `image/${ext}`),
        });
        uploaded.push(blob.url);
      } catch (e) {
        console.error(`error ${doc.sourceId} idx ${idx}`, e);
      }
      idx++;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }

    if (uploaded.length) {
      await col.updateOne(
        { sourceId: doc.sourceId },
        {
          $set: {
            imageUrls: uploaded,
            thumbnailUrl: uploaded[0] ?? doc.thumbnailUrl,
          },
        },
      );
      console.error(`updated ${doc.sourceId} (${uploaded.length} images)`);
    }

    mirrored++;
  }

  await client.close();
  console.error("done, mirrored spots:", mirrored);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
