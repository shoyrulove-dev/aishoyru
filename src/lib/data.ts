import { demoState } from "./demo";
import { getDb } from "./mongodb";
import type { PublicState } from "./types";
export async function getPublicState(): Promise<PublicState> {
  const db = await getDb();
  if (!db) return { ...demoState, updatedAt:new Date().toISOString() };
  const legacy:Record<string,string>={
    "I think a simple recipe recommendation bot could be fun and useful for people who don’t know what to cook.":"Mình có thể làm một công cụ gợi ý món ăn cho những người không biết hôm nay nên nấu gì.",
    "I think a simple recipe recommendation bot could be fun and useful for people who don't know what to cook.":"Mình có thể làm một công cụ gợi ý món ăn cho những người không biết hôm nay nên nấu gì.",
    "It uses existing data, low cost, and can be built quickly with a rule-based approach.":"Ý tưởng này dùng dữ liệu có sẵn, chi phí thấp và có thể dựng bản thử nghiệm nhanh.",
    "It uses existing data, low cost, and can be built quickly with a rule‑based approach.":"Ý tưởng này dùng dữ liệu có sẵn, chi phí thấp và có thể dựng bản thử nghiệm nhanh.",
  };
  const legacyTexts=Object.keys(legacy);
  const [state, activities, transactions, conversations] = await Promise.all([
    db.collection("agent_state").findOne({ key:"main" }),
    db.collection("activities").find({ public:true,text:{$nin:legacyTexts} }).sort({ createdAt:-1 }).limit(12).toArray(),
    db.collection("transactions").find({ verified:true }).sort({ createdAt:-1 }).limit(500).toArray(),
    db.collection("conversations").find({ public:true,text:{$nin:legacyTexts} }).sort({ createdAt:-1 }).limit(12).toArray(),
  ]);
  const income = transactions.filter(x=>x.kind==="income").reduce((s,x)=>s+Number(x.amount||0),0);
  const expense = transactions.filter(x=>x.kind==="expense").reduce((s,x)=>s+Number(x.amount||0),0);
  const activitiesOut = activities.map(x=>({ id:String(x._id), at:new Date(x.createdAt as Date).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Ho_Chi_Minh"}), kind:String(x.kind||"NHẬT KÝ"), text:String(x.text||""), amount:x.amount ? Number(x.amount):undefined }));
  const conversationsOut = conversations.reverse().map(x=>({ id:String(x._id), speaker:(x.speaker==="he-thong"?"he-thong":"shoyru") as "shoyru"|"he-thong", at:new Date(x.createdAt as Date).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Ho_Chi_Minh"}), text:legacy[String(x.text||"")]||String(x.text||"") }));
  const status=String(state?.status||"Đang nghỉ trong hang");
  const statusVi=status==="idea"?"Đang chọn việc có thể kiếm tiền":status;
  return { ...demoState, demo:false, income, expense, status:statusVi, thought:legacy[String(state?.thought||"")]||String(state?.thought||"Shoyru đang chuẩn bị kế hoạch tiếp theo…"), nextWake:"Mỗi giờ, vào phút 17", streak:Number(state?.streak||0), visitors:Number(state?.visitors||0), activities:activitiesOut, conversations:conversationsOut, updatedAt:new Date().toISOString() };
}
