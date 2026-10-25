import { NextResponse } from "next/server";
import { getPublicState } from "@/lib/data";
export async function GET(){ return NextResponse.json(await getPublicState(),{headers:{"Cache-Control":"no-store"}}); }
