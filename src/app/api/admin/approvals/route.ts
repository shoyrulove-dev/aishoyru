import { NextRequest,NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
const allowed=(r:NextRequest)=>!!process.env.ADMIN_API_KEY&&r.headers.get("authorization")===`Bearer ${process.env.ADMIN_API_KEY}`;
export async function GET(r:NextRequest){if(!allowed(r))return NextResponse.json({error:"Unauthorized"},{status:401});const db=await getDb();return NextResponse.json(db?await db.collection("approvals").find({status:"pending"}).sort({createdAt:-1}).toArray():[])}
export async function PATCH(r:NextRequest){
 if(!allowed(r))return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id,status}=await r.json();
 if(!["approved","rejected"].includes(status)||!ObjectId.isValid(id))return NextResponse.json({error:"Yêu cầu không hợp lệ."},{status:400});
 const db=await getDb();if(!db)return NextResponse.json({error:"Database unavailable"},{status:503});
 const approval=await db.collection("approvals").findOne({_id:new ObjectId(id),status:"pending"});
 if(!approval)return NextResponse.json({error:"Đề xuất không còn ở trạng thái chờ duyệt."},{status:409});
 if(status==="approved"&&approval.type==="email"){
  const email=approval.email as {to?:string;subject?:string;body?:string}|undefined;
  if(!email?.to||!email.subject||!email.body)return NextResponse.json({error:"Bản nháp email chưa đủ người nhận, tiêu đề hoặc nội dung."},{status:400});
  if(!process.env.RESEND_API_KEY)return NextResponse.json({error:"Chưa cấu hình RESEND_API_KEY nên chưa thể gửi email."},{status:503});
  const claimed=await db.collection("approvals").updateOne({_id:approval._id,status:"pending"},{$set:{status:"sending",reviewedAt:new Date()}});
  if(!claimed.modifiedCount)return NextResponse.json({error:"Email đang được xử lý ở một phiên khác."},{status:409});
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:`Shoyru <${process.env.SHOYRU_EMAIL||"shoyru@blissbiovn.com"}>`,to:[email.to],subject:email.subject,text:email.body})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){await db.collection("approvals").updateOne({_id:approval._id},{$set:{status:"pending"},$unset:{reviewedAt:""}});return NextResponse.json({error:`Dịch vụ email từ chối gửi: ${String((result as {message?:string}).message||response.status)}`},{status:502})}
  await db.collection("approvals").updateOne({_id:approval._id},{$set:{status:"approved",sentAt:new Date(),emailProviderId:String((result as {id?:string}).id||"")}});
  return NextResponse.json({ok:true,sent:true});
 }
 await db.collection("approvals").updateOne({_id:approval._id},{$set:{status,reviewedAt:new Date()}});
 return NextResponse.json({ok:true,sent:false});
}
