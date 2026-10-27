export type Activity = { id:string; at:string; kind:string; text:string; amount?:number };
export type Dialogue = { id:string; speaker:"shoyru"|"he-thong"; at:string; text:string };
export type Experiment = { name:string; hypothesis:string; status:string; progress:number };
export type ProjectSnapshot = {
  name:string; status:string; customer:string; deliverable:string; price:number;
  stepCount:number; lastAction?:string; result?:string; nextStep?:string;
};
export type PublicState = {
  demo:boolean; status:string; thought:string; nextWake:string; income:number; expense:number;
  goal:number; streak:number; visitors:number; activeViewers:number; todayVisitors:number; totalViews:number;
  lastRunAt:string | null; cronDelayed:boolean; activities:Activity[]; experiment:Experiment;
  conversations:Dialogue[]; chart:{ label:string; value:number }[]; project:ProjectSnapshot; updatedAt:string;
};
