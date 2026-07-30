import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoriesPage } from "@/components/categories-page";
import { alternates, getDictionary, isLocale } from "@/lib/i18n";
type CategoriesPageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: CategoriesPageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dictionary = getDictionary(lang);
  return { title: dictionary.categories.title, description: dictionary.categories.description, alternates: alternates("/categories") };
}

export default async function Page({ params }: CategoriesPageProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <CategoriesPage locale={lang} dictionary={getDictionary(lang)} />;
}
