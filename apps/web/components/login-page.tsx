"use client";

import type { Locale } from "@tourism/contracts";
import { Button } from "@tourism/ui";
import { Facebook, LogIn } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiOrigin, authApi } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n";
import { useAuth } from "./auth-provider";

export function LoginPage({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const router = useRouter();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const oauthUrl = (provider: "google" | "facebook") => `${apiOrigin}/api/v1/auth/oauth/${provider}/start?locale=${locale}&returnTo=/${locale}/profile`;
  const demo = async () => {
    setBusy(true);
    try { await authApi.developmentSession(); await auth.refresh(); router.push(`/${locale}/profile`); } finally { setBusy(false); }
  };
  return <section className="relative min-h-[calc(100dvh-4rem)] overflow-hidden bg-[#17372d] text-white"><Image src="https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1800&q=88" alt="Tropical landscape in Thailand" fill priority sizes="100vw" className="object-cover opacity-45" /><div className="absolute inset-0 bg-gradient-to-r from-[#102b22]/95 via-[#102b22]/75 to-transparent" /><div className="page-container relative z-10 flex min-h-[calc(100dvh-4rem)] items-center py-12"><div className="w-full max-w-md"><span className="brand-symbol">ส</span><h1 className="mt-6 text-4xl font-extrabold sm:text-5xl">{dictionary.auth.loginTitle}</h1><p className="mt-4 text-lg leading-8 text-emerald-50">{dictionary.auth.loginDescription}</p><div className="mt-8 grid gap-3"><a href={oauthUrl("google")} className="auth-provider-button bg-white text-slate-900"><span className="provider-mark">G</span>{dictionary.auth.google}</a><a href={oauthUrl("facebook")} className="auth-provider-button bg-white text-slate-900"><Facebook size={19} />{dictionary.auth.facebook}</a>{process.env.NODE_ENV !== "production" ? <Button onClick={demo} disabled={busy} className="bg-emerald-600 text-white hover:bg-emerald-500"><LogIn size={18} />{dictionary.auth.demo}</Button> : null}</div></div></div></section>;
}
