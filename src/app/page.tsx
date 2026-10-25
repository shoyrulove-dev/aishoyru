import { Dashboard } from "@/components/dashboard";
import { getPublicState } from "@/lib/data";
import { connection } from "next/server";

export const instant = false;

export default async function Home() {
  await connection();
  const initialState = await getPublicState();
  return <Dashboard initialState={initialState} />;
}
