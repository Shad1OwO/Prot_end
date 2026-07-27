import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoginPage } from "@/components/login-page";
import { alternates, getDictionary, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: PageProps<"/[lang]/login">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dictionary = getDictionary(lang);
  return { title: dictionary.nav.signIn, description: dictionary.auth.loginDescription, alternates: alternates("/login"), robots: { index: false, follow: false } };
}

export default async function Page({ params }: PageProps<"/[lang]/login">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <LoginPage locale={lang} dictionary={getDictionary(lang)} />;
}
