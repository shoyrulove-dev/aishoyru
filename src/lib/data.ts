import { demoState } from "./demo";
import { getDb } from "./mongodb";
import type { PublicState } from "./types";
export async function getPublicState(): Promise<PublicState> {
  const db = await getDb();
  if (!db) return { ...demoState, updatedAt:new Date().toISOString() };
  const [state, activities, transactions, conversations] = await Promise.all([
    db.collection("agent_state").findOne({ key:"main" }),
    db.collection("activities").find({ public:true }).sort({ createdAt:-1 }).limit(12).toArray(),
    db.collection("transactions").find({ verified:true }).sort({ createdAt:-1 }).limit(500).toArray(),
    db.collection("conversations").find({ public:true }).sort({ createdAt:-1 }).limit(12).toArray(),
  ]);
  const income = transactions.filter(x=>x.kind==="income").reduce((s,x)=>s+Number(x.amount||0),0);
  const expense = transactions.filter(x=>x.kind==="expense").reduce((s,x)=>s+Number(x.amount||0),0);
  const activitiesOut = activities.map(x=>({ id:String(x._id), at:new Date(x.createdAt as Date).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Ho_Chi_Minh"}), kind:String(x.kind||"NHẬT KÝ"), text:String(x.text||""), amount:x.amount ? Number(x.amount):undefined }));
  const conversationsOut = conversations.reverse().map(x=>({ id:String(x._id), speaker:(x.speaker||"be-rong") as "be-rong"|"bo-nao"|"he-thong", at:new Date(x.createdAt as Date).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Ho_Chi_Minh"}), text:String(x.text||"") }));
  return { ...demoState, demo:false, income, expense, status:String(state?.status||"Đang ngủ trong hang"), thought:String(state?.thought||"Bé đang nghĩ kế hoạch tiếp theo…"), nextWake:String(state?.nextWake||"Lượt cron tiếp theo"), streak:Number(state?.streak||0), visitors:Number(state?.visitors||0), activities:activitiesOut, conversations:conversationsOut, updatedAt:new Date().toISOString() };
}
