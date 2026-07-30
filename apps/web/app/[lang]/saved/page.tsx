import { notFound } from "next/navigation";
import { SavedPage } from "@/components/saved-page";
import { getDictionary, isLocale } from "@/lib/i18n";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <SavedPage locale={lang} dictionary={getDictionary(lang)} />;
}
