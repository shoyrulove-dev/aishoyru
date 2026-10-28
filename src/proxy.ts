import { NextResponse } from "next/server";

export function proxy() {
  const response = NextResponse.next();
  response.headers.set("X-Shoyru-Origin", "https://shoyruai.blissbiovn.com");
  return response;
}

export const config = {
  matcher: ["/", "/store/:path*", "/updates/:path*"],
};
