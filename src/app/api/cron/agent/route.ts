import { NextRequest,NextResponse } from "next/server";
import { runAgentCycle } from "@/lib/agent";
export const maxDuration=60;
export async function GET(req:NextRequest){
 const expected=process.env.CRON_SECRET;
 if(expected&&req.headers.get("authorization")!==`Bearer ${expected}`) return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await runAgentCycle())}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Agent failed"},{status:500})}
}
