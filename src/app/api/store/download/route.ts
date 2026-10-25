import { get } from "@vercel/blob";
import { NextRequest,NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function GET(req:NextRequest){
 const code=req.nextUrl.searchParams.get("code")||"";
 const token=req.nextUrl.searchParams.get("token")||"";
 if(!/^SHO-[A-F0-9]{6}$/.test(code)||!token)return NextResponse.json({error:"Liên kết tải không hợp lệ."},{status:400});
 const db=await getDb();
 if(!db)return NextResponse.json({error:"Cơ sở dữ liệu chưa sẵn sàng."},{status:503});
 const order=await db.collection("orders").findOne({code,deliveryToken:token,status:"paid",product:"sticker-shoyru-di-lam"});
 if(!order)return NextResponse.json({error:"Đơn hàng chưa được thanh toán hoặc liên kết không đúng."},{status:403});
 const result=await get("products/shoyru-stickers-v1.zip",{access:"private"});
 if(!result||result.statusCode!==200||!result.stream)return NextResponse.json({error:"Tệp giao hàng chưa sẵn sàng."},{status:404});
 return new NextResponse(result.stream,{headers:{"Content-Type":"application/zip","Content-Disposition":'attachment; filename="shoyru-stickers-v1.zip"',"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store"}});
}
