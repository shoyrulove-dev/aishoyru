import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { deliveryUrl } from "@/lib/store";

const Input=z.object({code:z.string().regex(/^SHO-[A-F0-9]{6}$/)});

export async function POST(req:NextRequest){
 const parsed=Input.safeParse(await req.json());
 if(!parsed.success)return NextResponse.json({error:"Mã đơn không hợp lệ."},{status:400});
 const db=await getDb();
 if(!db)return NextResponse.json({error:"Cơ sở dữ liệu chưa sẵn sàng."},{status:503});
 const order=await db.collection("orders").findOne({code:parsed.data.code});
 if(!order)return NextResponse.json({error:"Không tìm thấy đơn hàng."},{status:404});
 if(order.status!=="paid")return NextResponse.json({ok:true,paid:false});
 if(order.product==="moi-shoyru-mot-bua")return NextResponse.json({ok:true,paid:true,support:true});
 const url=deliveryUrl(String(order.product));
 if(!url)return NextResponse.json({error:"Tệp giao hàng chưa được cấu hình."},{status:503});
 return NextResponse.json({ok:true,paid:true,downloadUrl:url});
}
