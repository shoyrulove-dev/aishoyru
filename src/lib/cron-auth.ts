import { timingSafeEqual } from "node:crypto";

export function hasCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  const token = Buffer.from(authorization.slice(7));
  const secret = Buffer.from(expected);
  return token.length === secret.length && timingSafeEqual(token, secret);
}
