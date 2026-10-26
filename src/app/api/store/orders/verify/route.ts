import { NextRequest,NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { deliveryUrl } from "@/lib/store";
import { checkRateLimit } from "@/lib/rate-limit";

const Input=z.object({code:z.string().regex(/^SHO-[A-F0-9]{6}$/)});

export async function POST(req:NextRequest){
 const parsed=Input.safeParse(await req.json());
 if(!parsed.success)return NextResponse.json({error:"Mã đơn không hợp lệ."},{status:400});
 const db=await getDb();
 if(!db)return NextResponse.json({error:"Cơ sở dữ liệu chưa sẵn sàng."},{status:503});
 const rate=await checkRateLimit(db,req,"verify-order",30,10*60*1000);
 if(!rate.allowed)return NextResponse.json({error:"Bạn kiểm tra quá nhanh. Vui lòng thử lại sau."},{status:429,headers:{"Retry-After":String(rate.retryAfter)}});
 const order=await db.collection("orders").findOne({code:parsed.data.code});
 if(!order)return NextResponse.json({error:"Không tìm thấy đơn hàng."},{status:404});
 if(order.status!=="paid")return NextResponse.json({ok:true,paid:false});
 if(order.product==="moi-shoyru-mot-bua")return NextResponse.json({ok:true,paid:true,support:true});
 if(process.env.BLOB_READ_WRITE_TOKEN){
  const token=String(order.deliveryToken||randomBytes(24).toString("hex"));
  if(!order.deliveryToken)await db.collection("orders").updateOne({_id:order._id},{$set:{deliveryToken:token}});
  return NextResponse.json({ok:true,paid:true,downloadUrl:`/api/store/download?code=${encodeURIComponent(String(order.code))}&token=${encodeURIComponent(token)}`});
 }
 const url=deliveryUrl(String(order.product));
 if(!url)return NextResponse.json({error:"Tệp giao hàng chưa được cấu hình."},{status:503});
 return NextResponse.json({ok:true,paid:true,downloadUrl:url});
}
