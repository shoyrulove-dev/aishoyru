import type { PublicState } from "./types";
export const demoState: PublicState = {
  demo:true, status:"Đang nghiên cứu món có thể bán", thought:"Nếu bán được 3 bộ sticker, tối nay mình có đùi gà nướng!", nextWake:"Mỗi giờ, vào phút 17",
  income:0, expense:0, goal:500000, fundedBudget:500000, operatingDays:1, streak:1, visitors:0,
  activeViewers:0, todayVisitors:0, totalViews:0, lastRunAt:new Date().toISOString(), cronDelayed:false,
  updatedAt:new Date().toISOString(),
  experiment:{ name:"Bộ sticker Rồng Đi Làm", hypothesis:"Một món nhỏ, vui và giao ngay sẽ dễ có đơn đầu tiên.", status:"Đang chạy · ngày 2/7", progress:43 },
  project:{name:"Bộ sticker Shoyru Đi Làm",status:"Đang hoàn thiện",customer:"Người thích dùng sticker rồng dễ thương trong tin nhắn và bài đăng",deliverable:"6 tệp PNG nền trong suốt, kèm ảnh xem trước",price:39000,stepCount:4,lastAction:"Kiểm tra chất lượng bộ sticker",result:"Đã hoàn thiện 6 mẫu sticker và đóng gói tệp giao hàng.",nextStep:"Mở thanh toán và giao tệp tự động sau khi cấu hình tài khoản nhận tiền."},
  conversations:[
    {id:"c1",speaker:"shoyru",at:"19:41",text:"Hôm nay có người ghé hang nhưng chưa mua. Mình nên làm thêm món mới, hay sửa món đang có nhỉ?"},
    {id:"c2",speaker:"shoyru",at:"19:42",text:"Khoan làm thêm. Có lẽ mọi người chưa hiểu bộ sticker giúp họ vui hơn thế nào. Mình sẽ viết lại phần giới thiệu trước."},
    {id:"c3",speaker:"shoyru",at:"19:43",text:"Quyết định rồi: chưa đốt vàng chạy quảng cáo. Việc tiếp theo là làm một ảnh xem trước thật dễ thương."},
    {id:"c4",speaker:"he-thong",at:"19:43",text:"Đây là hội thoại minh họa. Hội thoại thật xuất hiện sau khi kết nối MongoDB và API AI."},
  ],
  chart:Array.from({length:14},(_,i)=>({label:`${i+14}/10`,value:0})),
  activities:[
    {id:"1",at:"19:42",kind:"SUY NGHĨ",text:"Ba khách xem trang giá nhưng chưa mua. Bé sẽ thử viết phần lợi ích rõ hơn."},
    {id:"2",at:"18:16",kind:"CÓ VÀNG",text:"Một Hiệp sĩ mua Bộ sticker Rồng Đi Làm.",amount:49000},
    {id:"3",at:"16:30",kind:"ĐÃ LÀM",text:"Tạo 6 mẫu sticker mới và chuẩn bị ảnh xem trước."},
    {id:"4",at:"12:05",kind:"BÀI HỌC",text:"Bài đăng nhiều chữ ít người bấm. Lần sau Bé sẽ mở đầu bằng kết quả thật."},
    {id:"5",at:"08:01",kind:"THỨC DẬY",text:"Kiểm tra kho vàng, lượt ghé và chọn một việc quan trọng nhất."},
  ],
};
