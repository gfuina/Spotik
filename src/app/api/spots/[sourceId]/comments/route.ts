import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  SPOT_COMMENTS_COLLECTION,
  SPOTS_COLLECTION,
  getDb,
} from "@/lib/mongodb";
import type { SpotCommentRow } from "@/types/spotComment";

export const runtime = "nodejs";

type CommentDoc = {
  _id: ObjectId;
  sourceId: number;
  text: string;
  createdAt: Date;
  rating?: number;
};

let indexEnsured: Promise<void> | null = null;

function ensureCommentIndexes() {
  if (!indexEnsured) {
    indexEnsured = (async () => {
      const db = await getDb();
      const col = db.collection(SPOT_COMMENTS_COLLECTION);
      await col.createIndex({ sourceId: 1, createdAt: -1 });
    })();
  }
  return indexEnsured;
}

function parseSourceId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sourceId: string }> },
) {
  try {
    const { sourceId: raw } = await ctx.params;
    const sourceId = parseSourceId(raw);
    if (sourceId == null) {
      return NextResponse.json({ error: "Invalid sourceId" }, { status: 400 });
    }
    await ensureCommentIndexes();
    const db = await getDb();
    const col = db.collection<CommentDoc>(SPOT_COMMENTS_COLLECTION);
    const docs = await col
      .find({ sourceId })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    const comments: SpotCommentRow[] = docs.map((d) => ({
      id: d._id.toHexString(),
      text: d.text,
      createdAt: d.createdAt.toISOString(),
      rating:
        typeof d.rating === "number" &&
        Number.isInteger(d.rating) &&
        d.rating >= 1 &&
        d.rating <= 5
          ? d.rating
          : null,
    }));

    return NextResponse.json({ comments });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message.includes("Missing MONGODB_URI") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ sourceId: string }> },
) {
  try {
    const { sourceId: raw } = await ctx.params;
    const sourceId = parseSourceId(raw);
    if (sourceId == null) {
      return NextResponse.json({ error: "Invalid sourceId" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const textRaw =
      typeof body === "object" &&
      body !== null &&
      "text" in body &&
      typeof (body as { text: unknown }).text === "string"
        ? (body as { text: string }).text
        : "";
    const text = textRaw.trim();
    if (text.length < 1) {
      return NextResponse.json({ error: "Texte vide" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json(
        { error: "Texte trop long (max 2000 caractères)" },
        { status: 400 },
      );
    }

    const ratingRaw = (body as { rating?: unknown }).rating;
    const ratingNum =
      typeof ratingRaw === "number" && Number.isInteger(ratingRaw)
        ? ratingRaw
        : typeof ratingRaw === "string" && ratingRaw.trim() !== ""
          ? Number(ratingRaw)
          : NaN;
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return NextResponse.json(
        { error: "Note obligatoire : 1 à 5 étoiles" },
        { status: 400 },
      );
    }

    const db = await getDb();
    const spots = db.collection(SPOTS_COLLECTION);
    const exists = await spots.findOne(
      { sourceId },
      { projection: { _id: 1 } },
    );
    if (!exists) {
      return NextResponse.json({ error: "Spot introuvable" }, { status: 404 });
    }

    await ensureCommentIndexes();
    const col = db.collection(SPOT_COMMENTS_COLLECTION);
    const createdAt = new Date();
    const ins = await col.insertOne({
      sourceId,
      text,
      createdAt,
      rating: ratingNum,
    });
    const row: SpotCommentRow = {
      id: ins.insertedId.toHexString(),
      text,
      createdAt: createdAt.toISOString(),
      rating: ratingNum,
    };
    return NextResponse.json({ comment: row }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message.includes("Missing MONGODB_URI") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
