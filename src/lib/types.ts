export type Activity = { id:string; at:string; kind:string; text:string; amount?:number };
export type Dialogue = { id:string; speaker:"shoyru"|"he-thong"; at:string; text:string };
export type Experiment = { name:string; hypothesis:string; status:string; progress:number };
export type PublicState = {
  demo:boolean; status:string; thought:string; nextWake:string; income:number; expense:number;
  goal:number; streak:number; visitors:number; activities:Activity[]; experiment:Experiment;
  conversations:Dialogue[]; chart:{ label:string; value:number }[]; updatedAt:string;
};
