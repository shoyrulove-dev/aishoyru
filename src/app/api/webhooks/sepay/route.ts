import { NextRequest,NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { z } from "zod";
const Payload=z.object({id:z.union([z.string(),z.number()]),transferAmount:z.number().positive(),transferType:z.string(),content:z.string().optional(),transactionDate:z.string().optional(),gateway:z.string().optional()}).passthrough();
export async function POST(req:NextRequest){
 if(process.env.SEPAY_API_KEY&&req.headers.get("authorization")!==`Apikey ${process.env.SEPAY_API_KEY}`) return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=Payload.safeParse(await req.json()); if(!parsed.success)return NextResponse.json({error:"Invalid payload"},{status:400});
 const db=await getDb(); if(!db)return NextResponse.json({error:"Database unavailable"},{status:503});
 const p=parsed.data,kind=p.transferType.toLowerCase().includes("in")?"income":"expense",createdAt=p.transactionDate?new Date(p.transactionDate):new Date();
 const result=await db.collection("transactions").updateOne({provider:"sepay",externalId:String(p.id)},{$setOnInsert:{provider:"sepay",externalId:String(p.id),kind,amount:p.transferAmount,note:p.content||"",channel:p.gateway||"bank",verified:true,createdAt,receivedAt:new Date()}},{upsert:true});
 if(result.upsertedCount&&kind==="income") await db.collection("activities").insertOne({kind:"CÓ VÀNG",text:`Kho vàng vừa nhận một giao dịch đã xác minh.`,amount:p.transferAmount,public:true,createdAt:new Date(),source:"sepay"});
 return NextResponse.json({success:true,duplicate:!result.upsertedCount});
}
