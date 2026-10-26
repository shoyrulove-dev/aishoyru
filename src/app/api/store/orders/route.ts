import { randomBytes } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { createQrUrl,findProduct,productReady } from "@/lib/store";
import { checkRateLimit } from "@/lib/rate-limit";

const Order=z.object({product:z.string(),name:z.string().trim().min(2).max(100),contact:z.string().trim().min(3).max(120),sessionId:z.string().regex(/^[a-zA-Z0-9-]{12,64}$/).optional()});

export async function POST(req:NextRequest){
 const parsed=Order.safeParse(await req.json());
 if(!parsed.success)return NextResponse.json({error:"Vui lòng nhập đủ tên và thông tin nhận hàng."},{status:400});
 const product=findProduct(parsed.data.product);
 if(!product)return NextResponse.json({error:"Sản phẩm không tồn tại."},{status:404});
 if(!productReady(product.slug))return NextResponse.json({error:"Món này đang chờ cấu hình thanh toán hoặc tệp giao hàng."},{status:503});
 const db=await getDb();
 if(!db)return NextResponse.json({error:"Cơ sở dữ liệu chưa sẵn sàng."},{status:503});
 const rate=await checkRateLimit(db,req,"create-order",10,10*60*1000);
 if(!rate.allowed)return NextResponse.json({error:"Bạn đã tạo quá nhiều đơn. Vui lòng thử lại sau."},{status:429,headers:{"Retry-After":String(rate.retryAfter)}});
 const code=`SHO-${randomBytes(3).toString("hex").toUpperCase()}`;
 const deliveryToken=randomBytes(24).toString("hex");
 await db.collection("orders").insertOne({code,product:product.slug,productName:product.name,amount:product.price,buyerName:parsed.data.name,contact:parsed.data.contact,deliveryToken,status:"pending",createdAt:new Date()});
 return NextResponse.json({ok:true,code,amount:product.price,qrUrl:createQrUrl(product.price,code)});
}
