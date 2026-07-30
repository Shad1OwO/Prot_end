import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_Thai } from "next/font/google";
import { ThemeProvider, type Theme } from "@/components/theme-provider";
import { cookies, headers } from "next/headers";
import "./globals.css";

const notoSans = Noto_Sans({ subsets: ["latin"], variable: "--font-noto-sans", display: "swap" });
const notoThai = Noto_Sans_Thai({ subsets: ["thai"], variable: "--font-noto-thai", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "http://localhost:3000"),
  title: { default: "Sawasdee Travel", template: "%s | Sawasdee Travel" },
  description: "Curated bilingual travel discovery across Thailand and the world.",
  applicationName: "Sawasdee Travel",
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const locale = requestHeaders.get("x-locale") === "th" ? "th" : "en";
  const cookieTheme = cookieStore.get("theme")?.value;
  const initialTheme: Theme = cookieTheme === "dark" || cookieTheme === "light" ? cookieTheme : "system";
  const themeClass = initialTheme === "system" ? "" : initialTheme;
  return <html lang={locale} className={`${notoSans.variable} ${notoThai.variable} ${themeClass}`}><body><ThemeProvider initialTheme={initialTheme}><a className="skip-link" href="#main-content">Skip to content</a>{children}</ThemeProvider></body></html>;
}
