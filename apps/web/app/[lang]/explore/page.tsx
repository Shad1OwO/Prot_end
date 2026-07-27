import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExplorePage } from "@/components/explore-page";
import { alternates, getDictionary, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: PageProps<"/[lang]/explore">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dictionary = getDictionary(lang);
  return { title: dictionary.explore.title, description: dictionary.explore.description, alternates: alternates("/explore") };
}

export default async function Page({ params }: PageProps<"/[lang]/explore">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <ExplorePage locale={lang} dictionary={getDictionary(lang)} />;
}
