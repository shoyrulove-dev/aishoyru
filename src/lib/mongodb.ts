import { MongoClient, type Db } from "mongodb";
import { mongoRequestScope } from "./mongo-request-scope.mjs";

let clientPromise: Promise<MongoClient> | undefined;

export async function getDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || "be_rong_ham_an";
  if (!uri || !/^mongodb(?:\+srv)?:\/\//i.test(uri)) return null;

  const scope = mongoRequestScope.getStore();
  if (scope) {
    scope.client ??= new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
    scope.connection ??= scope.client.connect();
    return (await scope.connection).db(dbName);
  }

  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect().catch(async (error) => {
      clientPromise = undefined;
      await client.close().catch(() => {});
      throw error;
    });
  }
  return (await clientPromise).db(dbName);
}
