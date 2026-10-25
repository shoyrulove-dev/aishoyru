export type Activity = { id:string; at:string; kind:string; text:string; amount?:number };
export type Experiment = { name:string; hypothesis:string; status:string; progress:number };
export type PublicState = {
  demo:boolean; status:string; thought:string; nextWake:string; income:number; expense:number;
  goal:number; streak:number; visitors:number; activities:Activity[]; experiment:Experiment;
  chart:{ label:string; value:number }[]; updatedAt:string;
};
