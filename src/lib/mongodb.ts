import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

export function getMongoClient(): Promise<MongoClient> {
  if (!uri) {
    throw new Error("Missing MONGODB_URI");
  }
  if (!clientPromise) {
    client = new MongoClient(uri);
    clientPromise = client.connect();
  }
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const c = await getMongoClient();
  const name = process.env.MONGODB_DB ?? "workout";
  return c.db(name);
}

export const SPOTS_COLLECTION = "spots";
export const SPOT_COMMENTS_COLLECTION = "spot_comments";
