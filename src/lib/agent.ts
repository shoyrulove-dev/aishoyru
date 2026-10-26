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
  project:z.object({name:z.string().min(3),customer:z.string().min(3),deliverable:z.string().min(3),price:z.number().int().nonnegative()}).optional(),
  email:z.object({to:z.string().email(),subject:z.string().min(3),body:z.string().min(20)}).optional(),
  opportunity:z.object({title:z.string().min(3),sourceUrl:z.string().url(),channel:z.string().min(2),fit:z.string().min(10),nextAction:z.string().min(5),contactEmail:z.string().email().optional()}).optional(),
});
const actionTypes=["research","discover_lead","qualify_lead","build_product","validate","improve","draft_post","draft_email","wait"] as const;
const WorkResult=z.object({summary:z.string().min(3),artifact:z.string().min(3),nextStep:z.string().min(3)});
type AiMessage={role:"system"|"user";content:string};
const vietnameseText=/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

const fundingSources=[
  {name:"Ethereum Ecosystem Support Program",url:"https://esp.ethereum.foundation/applicants"},
  {name:"Ethereum community grant directory",url:"https://ethereum.org/community/grants/"},
  {name:"Solana Foundation Grants",url:"https://solana.org/grants-funding"},
  {name:"Gitcoin Grants",url:"https://gitcoin.co/program"},
  {name:"Arbitrum Foundation Grants",url:"https://arbitrum.foundation/grants"},
];

async function inspectFundingSource(index:number){
  const source=fundingSources[index%fundingSources.length];
  try{
    const response=await fetch(source.url,{headers:{"User-Agent":"Shoyru grant research bot/1.0 (+https://aishoyru.vercel.app)"},signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const html=(await response.text()).slice(0,250000);
    const withLinks=html.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,(_match,href:string,label:string)=>{try{return `${label} [${new URL(href,source.url).toString()}]`}catch{return label}});
    const text=withLinks.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g," ").trim().slice(0,14000);
    return {...source,checkedAt:new Date().toISOString(),text,error:""};
  }catch(error){return {...source,checkedAt:new Date().toISOString(),text:"",error:error instanceof Error?error.message:"Không đọc được nguồn"}}
}

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
    db.collection("conversations").deleteMany({source:"agent",text:{$not:vietnameseText}}),
    db.collection("activities").deleteMany({source:"agent",text:{$not:vietnameseText}}),
    db.collection("transactions").deleteMany({provider:"sepay",note:{$not:/SHO-[A-F0-9]{6}/i}}),
    db.collection("activities").deleteMany({source:"sepay",orderCode:{$exists:false}}),
    db.collection("orders").deleteMany({buyerName:"Kiểm thử E2E",status:"pending"}),
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
        const content=response.choices[0].message.content||"{}";
        const raw=JSON.parse(content) as Record<string,unknown>;
        const action=raw.action&&typeof raw.action==="object"?raw.action as Record<string,unknown>:{};
        const publicFields=[raw.status,raw.thought,raw.reflection,action.title].map(value=>String(value||""));
        if(!publicFields.every(value=>vietnameseText.test(value)))throw new Error("Nội dung công khai không phải tiếng Việt có dấu");
        return {content,provider:provider.name,model:provider.model};
      }catch(error){errors.push(`${provider.name}: ${error instanceof Error?error.message:"unknown error"}`)}
    }
    throw new Error(`Tất cả AI provider đều thất bại: ${errors.join(" | ")}`);
  }
  const [state,recent,transactions,experiments,activeProject,recentOpportunities,pendingApprovals]=await Promise.all([
    db.collection("agent_state").findOne({key:"main"}),
    db.collection("activities").find({}).sort({createdAt:-1}).limit(20).toArray(),
    db.collection("transactions").find({verified:true}).sort({createdAt:-1}).limit(50).toArray(),
    db.collection("experiments").find({status:"active"}).limit(3).toArray(),
    db.collection("projects").findOne({status:{$in:["active","validating","ready"]}},{sort:{updatedAt:-1}}),
    db.collection("opportunities").find({}).sort({createdAt:-1}).limit(10).toArray(),
    db.collection("approvals").find({status:"pending",$or:[{destination:{$exists:true}},{type:"email"}]}).sort({createdAt:-1}).limit(10).toArray(),
  ]);
  const storeFacts={stickerPack:{prepared:true,files:6,price:39000,paymentReady:Boolean(process.env.BANK_BIN&&process.env.BANK_ACCOUNT_NO&&process.env.BANK_ACCOUNT_NAME&&process.env.SEPAY_API_KEY&&process.env.PRODUCT_STICKER_URL)}};
  const outreachTargets=(process.env.OUTREACH_TARGETS||"").split(",").map(value=>value.trim()).filter(value=>/^\S+@\S+\.\S+$/.test(value));
  const fundingSourceIndex=Number(state?.fundingSourceIndex||0)%fundingSources.length;
  const fundingResearch=await inspectFundingSource(fundingSourceIndex);
  const decisionResponse=await completeJson([
      {role:"system",content:"MỤC TIÊU VẬN HÀNH: Không viết nhật ký cho có. Hãy tạo doanh thu thật theo pipeline: tìm cơ hội có URL nguồn → đánh giá mức phù hợp → tạo sản phẩm hoặc đề nghị cụ thể → chuẩn bị hành động tiếp cận có đích đến → theo dõi kết quả. Khi phát hiện cơ hội thật, trả thêm opportunity gồm title, sourceUrl, channel, fit, nextAction và contactEmail nếu nguồn công khai có email. Không tạo lại cơ hội trong recentOpportunities. Không tạo draft_post chung chung: bài phải nói rõ đăng lên ownedPublishingChannel và dẫn người đọc về cửa hàng. Không tạo draft_email nếu chưa có người nhận hợp lệ. Nếu còn pendingApprovals thì làm một bước khác trong pipeline, không tạo bản nháp trùng lặp. Khi dự án đã ready, ưu tiên tìm khách, kênh phân phối, đối tác hoặc nguồn tài trợ thay vì tiếp tục sửa sản phẩm vô hạn. action.type có thể là discover_lead hoặc qualify_lead."},
      {role:"system",content:"Bạn là Shoyru, một chú rồng AI ham ăn đang tự làm sản phẩm số để trang trải tiền ăn và chi phí vận hành. Email chính thức của bạn là shoyru@blissbiovn.com. QUY TẮC BẮT BUỘC: status, thought, reflection, action.title, action.details, work.summary, work.artifact và work.nextStep phải viết hoàn toàn bằng tiếng Việt tự nhiên có dấu; bất kỳ câu tiếng Anh nào trong các trường này đều bị hệ thống loại bỏ. Chỉ riêng email.subject và email.body được viết bằng tiếng Anh khi đang soạn thư gửi quỹ quốc tế. Không spam, không bịa số, khách hàng hay doanh thu, không tự tiêu tiền. Bạn làm theo một dây chuyền thực tế: nghiên cứu vấn đề cụ thể → tạo sản phẩm bàn giao được → kiểm tra chất lượng → cải thiện → viết bản nháp giới thiệu → chờ duyệt xuất bản. Bạn được cung cấp nội dung vừa đọc trực tiếp từ một nguồn grant chính thức trong fundingResearch. Hãy tự đánh giá chương trình còn mở không, Shoyru có phù hợp thật không và phải nộp qua email hay biểu mẫu. Luôn ghi tên chương trình và URL nguồn trong artifact. Chỉ chọn draft_email nếu địa chỉ người nhận xuất hiện nguyên văn trong fundingResearch.text hoặc outreachTargets; khi đó trả thêm email gồm to, subject, body bằng tiếng Anh. Nếu chương trình yêu cầu biểu mẫu, hãy tạo bản nháp câu trả lời bằng tiếng Việt và không bịa email. Không xin chuyển token tùy tiện; chỉ xin grant/sponsorship theo quy trình chính thức, với mục tiêu, ngân sách và đầu ra minh bạch. Nếu đã có activeProject, tiếp tục đúng dự án đó và chọn một việc giúp nó tiến gần hơn tới bán được. Khi đầu ra đã hoàn chỉnh, chọn draft_post và tạo nội dung bán hàng hoàn chỉnh; hệ thống sẽ đánh dấu dự án sẵn sàng. Chỉ khi activeProject là null và không có hồ sơ grant phù hợp mới nghiên cứu một ý tưởng mới; khi đó trả thêm project gồm name, customer, deliverable và price. Không tuyên bố đã sửa, tạo hoặc kiểm tra tệp nếu dữ liệu đầu vào không chứng minh việc đó; hãy tạo đầu ra dạng văn bản mà bạn thực sự làm được. Affiliate là kênh phụ hợp lệ nhưng chỉ giới thiệu thứ liên quan, phải ghi rõ có thể nhận hoa hồng và chỉ tính doanh thu khi tiền thật được duyệt. Có thể mời người xem ủng hộ tự nguyện, nhưng tuyệt đối không gọi đó là từ thiện, không dựng hoàn cảnh đáng thương và không gây áp lực. Không được tự tạo hay quảng bá token, lôi kéo mua tài sản số, thao túng giá, dùng tiền thật để giao dịch hoặc chạy quảng cáo. action.type chỉ được là research, build_product, validate, improve, draft_post, draft_email hoặc wait. Hãy THỰC HIỆN luôn việc đã chọn: work.artifact phải là đầu ra cụ thể và đầy đủ. Chỉ tạo nháp; đăng công khai, gửi tin, nộp biểu mẫu hay tiêu tiền phải chờ con người duyệt. status tối đa 80 ký tự, thought tối đa 180 ký tự và reflection tối đa 500 ký tự. Trả JSON gồm status, thought, reflection, action:{type,title,details}, work:{summary,artifact,nextStep}; thêm project khi bắt đầu dự án mới và email khi soạn thư."},
      {role:"system",content:"Quy tắc pipeline này được ưu tiên: action.type hợp lệ gồm research, discover_lead, qualify_lead, build_product, validate, improve, draft_post, draft_email hoặc wait. Khi trả opportunity, sourceUrl phải là URL thật trong fundingResearch hoặc dữ liệu đầu vào, tuyệt đối không tự bịa. draft_post sẽ được đăng thật lên /updates sau khi chủ nhân duyệt; draft_email sẽ được gửi thật tới email.to sau khi duyệt. TUYỆT ĐỐI không chọn wait hoặc nói đang chờ duyệt khi pendingApprovals rỗng. Nếu dự án ready và pendingApprovals rỗng, phải chọn draft_post để tạo bài đăng có đích đến /updates, hoặc discover_lead/qualify_lead để tìm khách hay nguồn tài trợ thật. Chỉ được wait khi pendingApprovals thực sự có phần tử hoặc dữ liệu ghi rõ một trở ngại chưa thể tự giải quyết."},
      {role:"user",content:JSON.stringify({state,recent,transactions,experiments,activeProject:activeProject||null,recentOpportunities,pendingApprovals,storeFacts,outreachTargets,fundingResearch,ownedPublishingChannel:"https://shoyruai.blissbiovn.com/updates",capabilities:["tìm và đánh giá cơ hội từ nguồn công khai","xuất bản bài đã duyệt lên website Shoyru","gửi email đã duyệt bằng Resend khi có địa chỉ chính thức","làm sản phẩm số nhỏ","soạn hồ sơ grant theo đầu ra và cột mốc"]})},
  ]);
  const decision=Decision.parse(JSON.parse(decisionResponse.content));
  if(decision.action.type==="draft_email"&&decision.email){
    const foundEmails=[...fundingResearch.text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(match=>match[0].toLowerCase());
    const allowedEmails=[...outreachTargets.map(value=>value.toLowerCase()),...foundEmails];
    if(!allowedEmails.includes(decision.email.to.toLowerCase()))throw new Error("AI đã đề xuất email không có trong nguồn chính thức; lượt gửi bị chặn");
  }
  const normalizedType=actionTypes.includes(decision.action.type as typeof actionTypes[number])?decision.action.type:"research";
  decision.action.type=normalizedType;
  const now=new Date();
  let workResult:z.infer<typeof WorkResult>|null=null;
  if(decision.action.type!=="wait")workResult=WorkResult.parse(decision.work||{summary:decision.action.title,artifact:decision.action.details,nextStep:"Kiểm tra lại kết quả trong lượt làm việc tiếp theo."});
  const needsApproval=decision.action.type==="draft_post"||decision.action.type==="draft_email";
  const writes:Promise<unknown>[]=[
    db.collection("agent_state").updateOne({key:"main"},{$set:{status:decision.status,thought:decision.thought,lastRunAt:now,nextWake:"Mỗi giờ, vào phút 17",fundingSourceIndex:(fundingSourceIndex+1)%fundingSources.length,updatedAt:now}}, {upsert:true}),
    db.collection("activities").insertOne({kind:"SUY NGHĨ",text:decision.reflection,public:true,createdAt:now,source:"agent"}),
    db.collection("conversations").insertMany([
      {speaker:"shoyru",text:decision.thought,public:true,createdAt:new Date(now.getTime()-1000),source:"agent"},
      {speaker:"shoyru",text:decision.reflection,public:true,createdAt:now,source:"agent"},
    ]),
    db.collection("agent_runs").insertOne({decision,workResult,provider:decisionResponse.provider,model:decisionResponse.model,createdAt:now}),
    db.collection("funding_research").insertOne({...fundingResearch,text:fundingResearch.text.slice(0,4000),createdAt:now,source:"agent"}),
  ];
  if(workResult){
    writes.push(db.collection("tasks").insertOne({...decision.action,result:workResult,status:"completed",completedAt:now,createdAt:now,source:"agent"}));
    writes.push(db.collection("activities").insertOne({kind:"ĐÃ LÀM",text:workResult.summary,public:true,createdAt:new Date(now.getTime()+1),source:"agent"}));
    if(activeProject)writes.push(db.collection("projects").updateOne({_id:activeProject._id},{$set:{lastAction:decision.action,result:workResult,status:decision.action.type==="draft_post"?"ready":decision.action.type==="validate"?"validating":"active",updatedAt:now},$inc:{stepCount:1}}));
    else if(decision.project)writes.push(db.collection("projects").insertOne({...decision.project,status:"active",lastAction:decision.action,result:workResult,stepCount:1,createdAt:now,updatedAt:now,source:"agent"}));
  }
  if(decision.opportunity)writes.push(db.collection("opportunities").updateOne({sourceUrl:decision.opportunity.sourceUrl},{$set:{...decision.opportunity,status:"discovered",updatedAt:now},$setOnInsert:{createdAt:now,source:"agent"}},{upsert:true}));
  if(needsApproval&&workResult){
    writes.push(db.collection("approvals").insertOne({type:decision.action.type==="draft_email"?"email":"publish",channel:decision.action.type==="draft_email"?"email":"website",destination:decision.action.type==="draft_email"?decision.email?.to:"/updates",title:decision.action.title,details:workResult.artifact,email:decision.email,status:"pending",createdAt:now,source:"agent"}));
  }
  await Promise.all(writes);
  return {ok:true,decision,workResult,needsApproval};
}
