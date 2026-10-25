import { MongoClient, Db } from "mongodb";
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "be_rong_ham_an";
let clientPromise: Promise<MongoClient> | undefined;
export async function getDb(): Promise<Db | null> {
  if (!uri) return null;
  if (!clientPromise) clientPromise = new MongoClient(uri).connect();
  return (await clientPromise).db(dbName);
}
