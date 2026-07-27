import { notFound } from "next/navigation";
import { HomePage } from "@/components/home-page";
import { getDictionary, isLocale } from "@/lib/i18n";

export default async function Page({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <HomePage locale={lang} dictionary={getDictionary(lang)} />;
}
