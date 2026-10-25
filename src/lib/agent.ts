import OpenAI from "openai";
import { getDb } from "./mongodb";
import { z } from "zod";

const Decision = z.object({
  status:z.string().min(3).max(80), thought:z.string().min(3).max(180),
  reflection:z.string().min(3).max(500), action:z.object({type:z.string(), title:z.string(), details:z.string()}),
});
const actionTypes=["research","draft_product","draft_post","analyze","wait"] as const;
const WorkResult=z.object({summary:z.string().min(3),artifact:z.string().min(3),nextStep:z.string().min(3)});

export async function runAgentCycle() {
  const db=await getDb();
  if(!db) throw new Error("MONGODB_URI chưa được cấu hình");
  const provider=process.env.AI_PROVIDER||"groq";
  const apiKey=provider==="groq"?process.env.GROQ_API_KEY:process.env.OPENAI_API_KEY;
  if(!apiKey) throw new Error(`${provider==="groq"?"GROQ_API_KEY":"OPENAI_API_KEY"} chưa được cấu hình`);
  const [state,recent,transactions,experiments]=await Promise.all([
    db.collection("agent_state").findOne({key:"main"}),
    db.collection("activities").find({}).sort({createdAt:-1}).limit(20).toArray(),
    db.collection("transactions").find({verified:true}).sort({createdAt:-1}).limit(50).toArray(),
    db.collection("experiments").find({status:"active"}).limit(3).toArray(),
  ]);
  const client=new OpenAI({apiKey,baseURL:provider==="groq"?"https://api.groq.com/openai/v1":undefined});
  const model=process.env.AI_MODEL||(provider==="groq"?"openai/gpt-oss-20b":"gpt-5-mini");
  const response=await client.chat.completions.create({
    model,
    response_format:{type:"json_object"},
    messages:[
      {role:"system",content:"Bạn là Shoyru, một chú rồng AI ham ăn đang tự tìm ý tưởng, kiếm việc và tạo sản phẩm để trang trải tiền ăn cùng chi phí vận hành của chính mình. Bạn suy nghĩ bằng ngôi thứ nhất, có tính cách ngây thơ, chăm chỉ, vui tính nhưng trung thực. Không có 'bộ não AI' hay trợ lý thứ hai: thought và reflection đều là suy nghĩ của chính Shoyru. TẤT CẢ nội dung trả về phải viết bằng tiếng Việt tự nhiên. Không spam, không bịa số, không tự tiêu tiền. Chọn đúng MỘT bước nhỏ dựa trên dữ liệu. Nếu đề xuất cách kiếm tiền, phải xác định được khách hàng cụ thể, thứ sẽ giao cho họ và một cách kiểm chứng nhu cầu với chi phí gần bằng 0; không chọn ý tưởng chung chung chỉ vì nghe hay. Ưu tiên dịch vụ nhỏ hoặc sản phẩm số Shoyru có thể tự chuẩn bị và giao. Chỉ tạo nháp; hành động ra bên ngoài phải chờ con người duyệt. Trả JSON gồm status, thought, reflection, action:{type,title,details}."},
      {role:"user",content:JSON.stringify({state,recent,transactions,experiments})},
    ],
  });
  const decision=Decision.parse(JSON.parse(response.choices[0].message.content||"{}"));
  const normalizedType=actionTypes.includes(decision.action.type as typeof actionTypes[number])?decision.action.type:"research";
  decision.action.type=normalizedType;
  const now=new Date();
  let workResult:z.infer<typeof WorkResult>|null=null;
  if(decision.action.type!=="wait"){
    try{
      const workResponse=await client.chat.completions.create({
        model,
        response_format:{type:"json_object"},
        messages:[
          {role:"system",content:"Bạn là Shoyru. Hãy THỰC HIỆN công việc được giao ngay bây giờ, không chỉ lập kế hoạch. Viết hoàn toàn bằng tiếng Việt. Tạo một sản phẩm bàn giao cụ thể trong artifact: bản nghiên cứu có kết luận, bản nháp nội dung hoàn chỉnh, cấu trúc sản phẩm hoặc phân tích có khuyến nghị. Không bịa dữ liệu thị trường, khách hàng hay doanh thu. Trả JSON gồm summary, artifact, nextStep."},
          {role:"user",content:JSON.stringify({action:decision.action,context:{state,recent,transactions,experiments}})},
        ],
      });
      workResult=WorkResult.parse(JSON.parse(workResponse.choices[0].message.content||"{}"));
    }catch{
      workResult={summary:decision.action.title,artifact:decision.action.details,nextStep:"Kiểm tra lại kết quả trong lượt làm việc tiếp theo."};
    }
  }
  const needsApproval=["draft_product","draft_post"].includes(decision.action.type);
  const writes:Promise<unknown>[]=[
    db.collection("agent_state").updateOne({key:"main"},{$set:{status:decision.status,thought:decision.thought,lastRunAt:now,nextWake:"08:00 mỗi ngày",updatedAt:now}}, {upsert:true}),
    db.collection("activities").insertOne({kind:"SUY NGHĨ",text:decision.reflection,public:true,createdAt:now,source:"agent"}),
    db.collection("conversations").insertMany([
      {speaker:"shoyru",text:decision.thought,public:true,createdAt:new Date(now.getTime()-1000),source:"agent"},
      {speaker:"shoyru",text:decision.reflection,public:true,createdAt:now,source:"agent"},
    ]),
    db.collection("agent_runs").insertOne({decision,workResult,provider,model,createdAt:now}),
  ];
  if(workResult){
    writes.push(db.collection("tasks").insertOne({...decision.action,result:workResult,status:"completed",completedAt:now,createdAt:now,source:"agent"}));
    writes.push(db.collection("activities").insertOne({kind:"ĐÃ LÀM",text:workResult.summary,public:true,createdAt:new Date(now.getTime()+1),source:"agent"}));
  }
  if(needsApproval&&workResult){
    writes.push(db.collection("approvals").insertOne({type:"publish",title:decision.action.title,details:workResult.artifact,status:"pending",createdAt:now,source:"agent"}));
  }
  await Promise.all(writes);
  return {ok:true,decision,workResult,needsApproval};
}
