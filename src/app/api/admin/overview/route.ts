import {NextRequest,NextResponse} from "next/server";
import {getDb} from "@/lib/mongodb";

const allowed=(request:NextRequest)=>Boolean(process.env.ADMIN_API_KEY)&&request.headers.get("authorization")===`Bearer ${process.env.ADMIN_API_KEY}`;

export async function GET(request:NextRequest){
 if(!allowed(request))return NextResponse.json({error:"Unauthorized"},{status:401});
 const db=await getDb();
 if(!db)return NextResponse.json({error:"Database unavailable"},{status:503});
 const [approvals,projects,opportunities,runs,orders,published,income]=await Promise.all([
  db.collection("approvals").find({status:"pending",$or:[{destination:{$exists:true}},{type:"email"}]}).sort({createdAt:-1}).limit(30).toArray(),
  db.collection("projects").find({}).sort({updatedAt:-1}).limit(12).toArray(),
  db.collection("opportunities").find({}).sort({createdAt:-1}).limit(20).toArray(),
  db.collection("agent_runs").find({}).sort({createdAt:-1}).limit(12).project({provider:1,model:1,createdAt:1,"decision.action":1,"decision.status":1}).toArray(),
  db.collection("orders").find({}).sort({createdAt:-1}).limit(20).project({orderCode:1,productSlug:1,amount:1,status:1,createdAt:1}).toArray(),
  db.collection("published_posts").find({}).sort({publishedAt:-1}).limit(10).toArray(),
  db.collection("transactions").aggregate([{$match:{verified:true,type:"income"}},{$group:{_id:null,total:{$sum:"$amount"}}}]).toArray(),
 ]);
 return NextResponse.json({
  approvals,projects,opportunities,runs,orders,published,
  metrics:{revenue:Number(income[0]?.total||0),pending:approvals.length,leads:opportunities.length,orders:orders.filter(order=>order.status==="paid").length},
  channels:[
   {id:"website",name:"Website Shoyru",status:"connected",detail:"Đăng bài công khai tại /updates"},
   {id:"email",name:"Email tiếp cận",status:process.env.RESEND_API_KEY?"connected":"missing",detail:process.env.RESEND_API_KEY?"shoyru@blissbiovn.com qua Resend":"Thiếu RESEND_API_KEY"},
   {id:"payments",name:"Thanh toán",status:process.env.SEPAY_API_KEY?"connected":"missing",detail:process.env.SEPAY_API_KEY?"SePay đang xác minh giao dịch":"Thiếu SEPAY_API_KEY"},
   {id:"bluesky",name:"Bluesky",status:process.env.BLUESKY_HANDLE&&process.env.BLUESKY_APP_PASSWORD?"connected":"missing",detail:"Cần handle và app password"},
   {id:"telegram",name:"Telegram Channel",status:process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHANNEL_ID?"connected":"missing",detail:"Cần bot token và channel ID"},
  ],
 });
}
