import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoginPage } from "@/components/login-page";
import { alternates, getDictionary, isLocale } from "@/lib/i18n";

type RegisterPageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: RegisterPageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dictionary = getDictionary(lang);
  return { title: dictionary.auth.register, description: dictionary.auth.loginDescription, alternates: alternates("/register"), robots: { index: false, follow: false } };
}

export default async function Page({ params }: RegisterPageProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <LoginPage locale={lang} dictionary={getDictionary(lang)} initialMode="register" />;
}
