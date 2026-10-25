import type { PublicState } from "./types";
export const demoState: PublicState = {
  demo:true, status:"Đang nghiên cứu món có thể bán", thought:"Nếu bán được 3 bộ sticker, tối nay Bé có đùi gà nướng!", nextWake:"21:00 hôm nay",
  income:248000, expense:79000, goal:500000, streak:6, visitors:184, updatedAt:new Date().toISOString(),
  experiment:{ name:"Bộ sticker Rồng Đi Làm", hypothesis:"Một món nhỏ, vui và giao ngay sẽ dễ có đơn đầu tiên.", status:"Đang chạy · ngày 2/7", progress:43 },
  chart:[18,28,22,48,35,72,54,92,66,118,90,142,126,169].map((value,i)=>({label:`${i+12}/10`,value:value*1000})),
  activities:[
    {id:"1",at:"19:42",kind:"SUY NGHĨ",text:"Ba khách xem trang giá nhưng chưa mua. Bé sẽ thử viết phần lợi ích rõ hơn."},
    {id:"2",at:"18:16",kind:"CÓ VÀNG",text:"Một Hiệp sĩ mua Bộ sticker Rồng Đi Làm.",amount:49000},
    {id:"3",at:"16:30",kind:"ĐÃ LÀM",text:"Tạo 6 mẫu sticker mới và chuẩn bị ảnh xem trước."},
    {id:"4",at:"12:05",kind:"BÀI HỌC",text:"Bài đăng nhiều chữ ít người bấm. Lần sau Bé sẽ mở đầu bằng kết quả thật."},
    {id:"5",at:"08:01",kind:"THỨC DẬY",text:"Kiểm tra kho vàng, lượt ghé và chọn một việc quan trọng nhất."},
  ],
};
