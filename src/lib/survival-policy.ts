export const survivalAllocation = [
  { id: "service", label: "Mini-job kỹ thuật", targetPercent: 60, purpose: "Tìm và hoàn thành việc có người trả tiền thật" },
  { id: "product", label: "Sản phẩm số", targetPercent: 20, purpose: "Bán và cải thiện Bộ khởi tạo AI Shoyru" },
  { id: "microjob", label: "Việc nhỏ hợp lệ", targetPercent: 10, purpose: "Gán nhãn, đánh giá AI, kiểm thử và nhiệm vụ code nhỏ" },
  { id: "quant", label: "Quant và paper trade", targetPercent: 10, purpose: "Học bằng dữ liệu, chưa dùng tiền thật" },
] as const;

export const servicePackages = [
  {
    id: "automation",
    name: "Tự động hóa một quy trình nhỏ",
    deliverable: "Sơ đồ luồng, mã hoặc cấu hình chạy được và hướng dẫn bàn giao",
    needs: ["Việc đang làm thủ công", "Công cụ hoặc dữ liệu hiện có", "Kết quả và thời hạn mong muốn"],
    price: "Báo giá sau khi hiểu đủ 3 thông tin",
  },
  {
    id: "api-bot",
    name: "Bot hoặc tích hợp API cơ bản",
    deliverable: "Mã nguồn, cấu hình mẫu, kiểm tra lỗi chính và hướng dẫn sử dụng",
    needs: ["Nền tảng cần kết nối", "API hoặc tài khoản khách đang có", "Hành động bot phải thực hiện"],
    price: "Báo giá theo số hệ thống cần kết nối",
  },
  {
    id: "landing-page",
    name: "Landing page nhỏ",
    deliverable: "Trang responsive, nội dung chính, nút liên hệ và hướng dẫn triển khai",
    needs: ["Mục tiêu trang", "Nội dung hoặc nhận diện sẵn có", "Tên miền và thời hạn"],
    price: "Báo giá sau khi chốt phạm vi",
  },
  {
    id: "data-task",
    name: "Xử lý dữ liệu hoặc kiểm thử",
    deliverable: "Tệp kết quả, quy tắc xử lý và báo cáo lỗi ngắn",
    needs: ["Dữ liệu mẫu", "Quy tắc đúng sai", "Khối lượng và thời hạn"],
    price: "Báo giá theo mẫu và khối lượng",
  },
] as const;

export const ownerOnlyActions = [
  "OTP, CAPTCHA hoặc xác minh danh tính",
  "Chấp nhận điều khoản và tạo tài khoản tài chính",
  "Hợp đồng, hóa đơn, hoàn tiền hoặc khiếu nại",
  "Cấp vốn, nạp tiền, mở ví hoặc đặt lệnh thật",
  "Thay đổi giá, giảm giá hoặc cam kết thương mại đặc biệt",
] as const;

export const tradingCapitalRules = {
  minimumPaperDays: 30,
  minimumClosedTrades: 20,
  requiresOutOfSampleBacktest: true,
  initialCapitalUsdc: 25,
  maxPositionUsdc: 1,
  maxDailyLossUsdc: 1,
  maxTotalLossUsdc: 2.5,
  consecutiveLossStop: 3,
  liveTradingDefault: false,
} as const;

