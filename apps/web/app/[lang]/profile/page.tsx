import { notFound } from "next/navigation";
import { ProfilePage } from "@/components/account-pages";
import { getDictionary, isLocale } from "@/lib/i18n";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <ProfilePage locale={lang} dictionary={getDictionary(lang)} />;
}
