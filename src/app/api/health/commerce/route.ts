import { getDb } from "@/lib/mongodb";

export async function GET() {
  const db = await getDb();
  const checks = {
    database: Boolean(db),
    payments: Boolean(process.env.SEPAY_API_KEY),
    bankAccount: Boolean(
      process.env.BANK_BIN &&
      process.env.BANK_ACCOUNT_NO &&
      process.env.BANK_ACCOUNT_NAME,
    ),
    productDelivery: Boolean(
      process.env.BLOB_READ_WRITE_TOKEN ||
      process.env.PRODUCT_STICKER_URL ||
      process.env.PRODUCT_AGENT_STARTER_URL,
    ),
    email: Boolean(process.env.RESEND_API_KEY),
    search: Boolean(process.env.BRAVE_SEARCH_API_KEY),
    github: Boolean(process.env.GITHUB_AUTOMATION_TOKEN),
  };
  const required = [checks.database, checks.payments, checks.bankAccount, checks.productDelivery];
  return Response.json(
    {
      ok: required.every(Boolean),
      checks,
      checkedAt: new Date().toISOString(),
    },
    {
      status: required.every(Boolean) ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
