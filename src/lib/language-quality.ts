const vague = /(tối ưu|tạo giá trị|cơ hội phù hợp|khách hàng tiềm năng|triển khai giải pháp|plan_business|discover_lead|pipeline|phễu)/i;
const clipped = /(\.\.\.|…|\b(sản|có|để|và|hoặc|một|những|các)\s*[.!?]?$)/i;

export function evaluatePublicLanguage(values: string[], recent: string[] = []) {
  const reasons: string[] = [];
  let score = 100;
  for (const value of values) {
    const text = value.replace(/\s+/g, " ").trim();
    if (text.length < 8) { score -= 15; reasons.push("Câu quá ngắn"); }
    if (vague.test(text)) { score -= 22; reasons.push("Có từ máy móc hoặc mơ hồ"); }
    if (clipped.test(text)) { score -= 25; reasons.push("Câu có dấu hiệu bị cắt dở"); }
    if (!/[.!?]$/.test(text) && text.split(" ").length > 5) { score -= 8; reasons.push("Câu chưa trọn ý"); }
  }
  const normalized = values.join(" ").toLocaleLowerCase("vi-VN").replace(/[^a-zà-ỹ0-9 ]/gi, " ").replace(/\s+/g, " ").trim();
  if (recent.some((item) => item.toLocaleLowerCase("vi-VN").includes(normalized.slice(0, 55)))) {
    score -= 25;
    reasons.push("Nội dung gần giống nhật ký cũ");
  }
  return { score: Math.max(0, score), passed: score >= 70, reasons: [...new Set(reasons)] };
}
