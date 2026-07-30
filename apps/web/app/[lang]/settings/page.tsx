import { notFound } from "next/navigation";
import { SettingsPage } from "@/components/account-pages";
import { getDictionary, isLocale } from "@/lib/i18n";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <SettingsPage locale={lang} dictionary={getDictionary(lang)} />;
}
