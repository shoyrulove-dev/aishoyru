import { NextRequest, NextResponse } from "next/server";

const trustedSearchBots = /googlebot|bingbot|duckduckbot|yandexbot|baiduspider|applebot/i;
const bulkScrapers = /httrack|webcopier|website.?ripper|wget|curl|python-requests|python-urllib|scrapy|aiohttp|go-http-client|libwww-perl|apache-httpclient|headlesschrome|phantomjs/i;

export function proxy(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "";
  if (!trustedSearchBots.test(userAgent) && bulkScrapers.test(userAgent)) {
    return new NextResponse("Yêu cầu tự động đã bị từ chối.", {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }
  const response = NextResponse.next();
  response.headers.set("X-Shoyru-Origin", "https://shoyruai.blissbiovn.com");
  return response;
}

export const config = {
  matcher: ["/", "/store/:path*", "/updates/:path*"],
};
