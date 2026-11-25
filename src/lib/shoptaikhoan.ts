export function getShoptaikhoanProvider() {
  const apiKey = process.env.SHOPTAIKHOAN_API_KEY?.trim();
  if (!apiKey) return undefined;

  return {
    name: "shoptaikhoan",
    apiKey,
    baseURL: "https://token.shoptaikhoan.store/v1",
    model: "gpt-6.2-sol",
  } as const;
}
