import { NextRequest,NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
const allowed=(r:NextRequest)=>!!process.env.ADMIN_API_KEY&&r.headers.get("authorization")===`Bearer ${process.env.ADMIN_API_KEY}`;
export async function GET(r:NextRequest){if(!allowed(r))return NextResponse.json({error:"Unauthorized"},{status:401});const db=await getDb();return NextResponse.json(db?await db.collection("approvals").find({status:"pending"}).sort({createdAt:-1}).toArray():[])}
export async function PATCH(r:NextRequest){if(!allowed(r))return NextResponse.json({error:"Unauthorized"},{status:401});const {id,status}=await r.json();if(!["approved","rejected"].includes(status))return NextResponse.json({error:"Invalid status"},{status:400});const db=await getDb();if(!db)return NextResponse.json({error:"Database unavailable"},{status:503});await db.collection("approvals").updateOne({_id:new ObjectId(id)},{$set:{status,reviewedAt:new Date()}});return NextResponse.json({ok:true})}
