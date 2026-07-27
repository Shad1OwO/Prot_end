import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_Thai } from "next/font/google";
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html suppressHydrationWarning className={`${notoSans.variable} ${notoThai.variable}`}><body>{children}</body></html>;
}
