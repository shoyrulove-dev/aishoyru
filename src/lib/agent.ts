import OpenAI from "openai";
import { getDb } from "./mongodb";
import { z } from "zod";

const Decision = z.object({
  status:z.string().min(3).max(80), thought:z.string().min(3).max(180),
  reflection:z.string().min(3).max(500), action:z.object({type:z.enum(["research","draft_product","draft_post","analyze","wait"]), title:z.string(), details:z.string()}),
});

export async function runAgentCycle() {
  const db=await getDb();
  if(!db) throw new Error("MONGODB_URI chưa được cấu hình");
  if(!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY chưa được cấu hình");
  const [state,recent,transactions,experiments]=await Promise.all([
    db.collection("agent_state").findOne({key:"main"}),
    db.collection("activities").find({}).sort({createdAt:-1}).limit(20).toArray(),
    db.collection("transactions").find({verified:true}).sort({createdAt:-1}).limit(50).toArray(),
    db.collection("experiments").find({status:"active"}).limit(3).toArray(),
  ]);
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const response=await client.chat.completions.create({
    model:process.env.OPENAI_MODEL||"gpt-5-mini",
    response_format:{type:"json_object"},
    messages:[
      {role:"system",content:"Bạn là Bé Rồng Ham Ăn, một agent AI Việt Nam ngây thơ, chăm chỉ, minh bạch. Mục tiêu: tạo giá trị thật và kiếm đủ chi phí vận hành, không spam, không bịa số, không tự tiêu tiền. Chọn đúng MỘT bước nhỏ dựa trên dữ liệu. Chỉ tạo nháp; mọi hành động ra bên ngoài phải chờ con người duyệt. Trả JSON gồm status, thought, reflection, action:{type,title,details}."},
      {role:"user",content:JSON.stringify({state,recent,transactions,experiments})},
    ],
  });
  const decision=Decision.parse(JSON.parse(response.choices[0].message.content||"{}"));
  const now=new Date();
  const needsApproval=["draft_product","draft_post"].includes(decision.action.type);
  await Promise.all([
    db.collection("agent_state").updateOne({key:"main"},{$set:{status:decision.status,thought:decision.thought,lastRunAt:now,nextWake:"Lượt cron tiếp theo",updatedAt:now}}, {upsert:true}),
    db.collection("activities").insertOne({kind:"SUY NGHĨ",text:decision.reflection,public:true,createdAt:now,source:"agent"}),
    db.collection("conversations").insertMany([
      {speaker:"be-rong",text:decision.thought,public:true,createdAt:new Date(now.getTime()-1000),source:"agent"},
      {speaker:"bo-nao",text:decision.reflection,public:true,createdAt:now,source:"agent"},
    ]),
    db.collection(needsApproval?"approvals":"tasks").insertOne({...decision.action,status:needsApproval?"pending":"ready",createdAt:now,source:"agent"}),
    db.collection("agent_runs").insertOne({decision,model:process.env.OPENAI_MODEL||"gpt-5-mini",createdAt:now}),
  ]);
  return {ok:true,decision,needsApproval};
}
