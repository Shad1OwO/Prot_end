import { notFound } from "next/navigation";
import { AiSearchPage } from "@/components/ai-search-page";
import { getDictionary, isLocale } from "@/lib/i18n";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <AiSearchPage locale={lang} dictionary={getDictionary(lang)} />;
}
