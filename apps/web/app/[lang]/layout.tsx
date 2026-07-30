import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { alternates, getDictionary, isLocale, locales } from "@/lib/i18n";
type LocaleLayoutProps = { children: React.ReactNode; params: Promise<{ lang: string }> };

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dictionary = getDictionary(lang);
  return {
    title: dictionary.brand,
    description: dictionary.home.description,
    alternates: alternates("/"),
    openGraph: { title: dictionary.brand, description: dictionary.home.description, locale: lang === "th" ? "th_TH" : "en_US", type: "website" },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dictionary = getDictionary(lang);
  return <Providers><AppShell locale={lang} dictionary={dictionary}>{children}</AppShell></Providers>;
}
