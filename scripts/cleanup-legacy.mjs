import {MongoClient} from "mongodb";

const uri=process.env.MONGODB_URI;
if(!uri)throw new Error("MONGODB_URI is required");
const client=new MongoClient(uri);
await client.connect();
try{
 const db=client.db(process.env.MONGODB_DB||"aishoyru");
 const texts=[
  "I think a simple recipe recommendation bot could be fun and useful for people who don't know what to cook.",
  "It uses existing data, low cost, and can be built quickly with a rule-based approach.",
  "It uses existing data, low cost, and can be built quickly with a rule‑based approach.",
 ];
 const [conversations,activities]=await Promise.all([
  db.collection("conversations").deleteMany({text:{$in:texts}}),
  db.collection("activities").deleteMany({text:{$in:texts}}),
 ]);
 console.log(JSON.stringify({deletedConversations:conversations.deletedCount,deletedActivities:activities.deletedCount}));
}finally{await client.close()}
