import { notFound } from "next/navigation";
import { TripsPage } from "@/components/trips-page";
import { getDictionary, isLocale } from "@/lib/i18n";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <TripsPage locale={lang} dictionary={getDictionary(lang)} />;
}
