import OpenAI from "openai";
import { getDb } from "./mongodb";
import { z } from "zod";

const clip=(value:string,max:number)=>value.length<=max?value:value.slice(0,max+1).replace(/\s+\S*$/,"").replace(/[,:;\-]+$/,"")+"…";
const Decision = z.object({
  status:z.string().trim().min(3).transform(value=>clip(value,80)),
  thought:z.string().trim().min(3).transform(value=>clip(value,180)),
  reflection:z.string().trim().min(3).transform(value=>clip(value,500)),
  action:z.object({type:z.string(),title:z.string(),details:z.string()}),
  work:z.object({summary:z.string().min(3),artifact:z.string().min(3),nextStep:z.string().min(3)}).optional(),
});
const actionTypes=["research","build_product","validate","improve","draft_post","wait"] as const;
const WorkResult=z.object({summary:z.string().min(3),artifact:z.string().min(3),nextStep:z.string().min(3)});
type AiMessage={role:"system"|"user";content:string};

export async function runAgentCycle() {
  const db=await getDb();
  if(!db) throw new Error("MONGODB_URI chưa được cấu hình");
  const legacyEnglish=[
    "I think a simple recipe recommendation bot could be fun and useful for people who don't know what to cook.",
    "It uses existing data, low cost, and can be built quickly with a rule-based approach.",
    "It uses existing data, low cost, and can be built quickly with a rule‑based approach.",
  ];
  await Promise.all([
    db.collection("conversations").deleteMany({text:{$in:legacyEnglish}}),
    db.collection("activities").deleteMany({text:{$in:legacyEnglish}}),
  ]);
  const providers=[
    {name:"groq",apiKey:process.env.GROQ_API_KEY,baseURL:"https://api.groq.com/openai/v1",model:process.env.GROQ_MODEL||process.env.AI_MODEL||"openai/gpt-oss-20b"},
    {name:"openrouter",apiKey:process.env.OPENROUTER_API_KEY,baseURL:"https://openrouter.ai/api/v1",model:process.env.OPENROUTER_MODEL||"openrouter/free"},
    {name:"kilo",apiKey:process.env.KILO_API_KEY,baseURL:"https://ai-gateway.kilo.ai/api/v1",model:process.env.KILO_MODEL||"kilo-auto/free"},
    {name:"openai",apiKey:process.env.OPENAI_API_KEY,baseURL:"https://api.openai.com/v1",model:process.env.OPENAI_MODEL||"gpt-5-mini"},
  ].filter(p=>p.apiKey);
  if(!providers.length) throw new Error("Chưa cấu hình API key cho Groq, OpenRouter, Kilo hoặc OpenAI");
  async function completeJson(messages:AiMessage[]){
    const errors:string[]=[];
    for(const provider of providers){
      try{
        const client=new OpenAI({apiKey:provider.apiKey,baseURL:provider.baseURL,timeout:20000,maxRetries:0});
        const response=await client.chat.completions.create({model:provider.model,response_format:{type:"json_object"},messages});
        return {content:response.choices[0].message.content||"{}",provider:provider.name,model:provider.model};
      }catch(error){errors.push(`${provider.name}: ${error instanceof Error?error.message:"unknown error"}`)}
    }
    throw new Error(`Tất cả AI provider đều thất bại: ${errors.join(" | ")}`);
  }
  const [state,recent,transactions,experiments,activeProject]=await Promise.all([
    db.collection("agent_state").findOne({key:"main"}),
    db.collection("activities").find({}).sort({createdAt:-1}).limit(20).toArray(),
    db.collection("transactions").find({verified:true}).sort({createdAt:-1}).limit(50).toArray(),
    db.collection("experiments").find({status:"active"}).limit(3).toArray(),
    db.collection("projects").findOne({status:{$in:["active","validating","ready"]}},{sort:{updatedAt:-1}}),
  ]);
  const projectContext=activeProject||{name:"Bộ sticker Shoyru Đi Làm",status:"active",customer:"Người dùng mạng xã hội và chat thích sticker rồng dễ thương",deliverable:"Bộ 6 sticker PNG; ảnh xem trước đã có, cần kiểm tra chất lượng, tách tệp và hoàn thiện nội dung bán hàng",price:39000};
  const decisionResponse=await completeJson([
      {role:"system",content:"Bạn là Shoyru, một chú rồng AI ham ăn đang tự làm sản phẩm số để trang trải tiền ăn và chi phí vận hành. TẤT CẢ nội dung phải bằng tiếng Việt tự nhiên. Không spam, không bịa số, khách hàng hay doanh thu, không tự tiêu tiền. Bạn làm theo một dây chuyền thực tế: nghiên cứu vấn đề cụ thể → tạo sản phẩm bàn giao được → kiểm tra chất lượng → cải thiện → viết bản nháp giới thiệu → chờ duyệt xuất bản. Nếu đã có activeProject, BẮT BUỘC tiếp tục dự án đó và chọn đúng một việc giúp dự án tiến gần hơn tới bán được; không nghĩ dự án mới. Chỉ khi không có dự án hoạt động mới được nghiên cứu một ý tưởng, và ý tưởng phải có khách hàng cụ thể, đầu ra cụ thể, giá dự kiến và cách kiểm chứng gần 0 đồng. action.type chỉ được là research, build_product, validate, improve, draft_post hoặc wait. Hãy THỰC HIỆN luôn việc đã chọn: work.artifact phải là đầu ra cụ thể và đầy đủ, không được chỉ là kế hoạch hay tuyên bố đã làm việc ngoài đời. Chỉ tạo nháp; đăng công khai, gửi tin hay tiêu tiền phải chờ con người duyệt. status tối đa 80 ký tự, thought tối đa 180 ký tự và reflection tối đa 500 ký tự. Trả JSON gồm status, thought, reflection, action:{type,title,details}, work:{summary,artifact,nextStep}."},
      {role:"user",content:JSON.stringify({state,recent,transactions,experiments,activeProject:projectContext})},
  ]);
  const decision=Decision.parse(JSON.parse(decisionResponse.content));
  const normalizedType=actionTypes.includes(decision.action.type as typeof actionTypes[number])?decision.action.type:"research";
  decision.action.type=normalizedType;
  const now=new Date();
  let workResult:z.infer<typeof WorkResult>|null=null;
  if(decision.action.type!=="wait")workResult=WorkResult.parse(decision.work||{summary:decision.action.title,artifact:decision.action.details,nextStep:"Kiểm tra lại kết quả trong lượt làm việc tiếp theo."});
  const needsApproval=decision.action.type==="draft_post";
  const writes:Promise<unknown>[]=[
    db.collection("agent_state").updateOne({key:"main"},{$set:{status:decision.status,thought:decision.thought,lastRunAt:now,nextWake:"Mỗi giờ, vào phút 17",updatedAt:now}}, {upsert:true}),
    db.collection("activities").insertOne({kind:"SUY NGHĨ",text:decision.reflection,public:true,createdAt:now,source:"agent"}),
    db.collection("conversations").insertMany([
      {speaker:"shoyru",text:decision.thought,public:true,createdAt:new Date(now.getTime()-1000),source:"agent"},
      {speaker:"shoyru",text:decision.reflection,public:true,createdAt:now,source:"agent"},
    ]),
    db.collection("agent_runs").insertOne({decision,workResult,provider:decisionResponse.provider,model:decisionResponse.model,createdAt:now}),
  ];
  if(workResult){
    writes.push(db.collection("tasks").insertOne({...decision.action,result:workResult,status:"completed",completedAt:now,createdAt:now,source:"agent"}));
    writes.push(db.collection("activities").insertOne({kind:"ĐÃ LÀM",text:workResult.summary,public:true,createdAt:new Date(now.getTime()+1),source:"agent"}));
    if(activeProject)writes.push(db.collection("projects").updateOne({_id:activeProject._id},{$set:{lastAction:decision.action,result:workResult,status:decision.action.type==="validate"?"validating":"active",updatedAt:now},$inc:{stepCount:1}}));
    else writes.push(db.collection("projects").insertOne({...projectContext,lastAction:decision.action,result:workResult,stepCount:1,createdAt:now,updatedAt:now,source:"agent"}));
  }
  if(needsApproval&&workResult){
    writes.push(db.collection("approvals").insertOne({type:"publish",title:decision.action.title,details:workResult.artifact,status:"pending",createdAt:now,source:"agent"}));
  }
  await Promise.all(writes);
  return {ok:true,decision,workResult,needsApproval};
}
