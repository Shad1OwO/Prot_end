import { NextResponse, type NextRequest } from "next/server";

const locales = ["en", "th"] as const;
const defaultLocale = "en";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const locale = locales.find((candidate) => pathname === `/${candidate}` || pathname.startsWith(`/${candidate}/`));
  if (locale) {
    const headers = new Headers(request.headers);
    headers.set("x-locale", locale);
    return NextResponse.next({ request: { headers } });
  }
  const language = request.headers.get("accept-language")?.toLowerCase() ?? "";
  const preferred = language.includes("th") ? "th" : defaultLocale;
  request.nextUrl.pathname = `/${preferred}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"],
};
