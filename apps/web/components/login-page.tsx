"use client";

import type { Locale } from "@tourism/contracts";
import { Button } from "@tourism/ui";
import { LogIn } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiOrigin, authApi } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n";
import { useAuth } from "./auth-provider";
import { EmailAuthForm } from "./email-auth-form";

export function LoginPage({ locale, dictionary, initialMode = "login" }: { locale: Locale; dictionary: Dictionary; initialMode?: "login" | "register" }) {
  const router = useRouter();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const oauthUrl = `${apiOrigin}/api/v1/auth/oauth/google/start?locale=${locale}&returnTo=/${locale}/profile`;
  const signedIn = async () => { await auth.refresh(); router.push(`/${locale}/profile`); };
  const demo = async () => {
    setBusy(true);
    try { await authApi.developmentSession(); await signedIn(); } finally { setBusy(false); }
  };
  return <section className="relative min-h-[calc(100dvh-4rem)] overflow-hidden bg-[#17372d] text-white"><Image src="https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1800&q=88" alt="Tropical landscape in Thailand" fill priority sizes="100vw" className="object-cover opacity-45" /><div className="absolute inset-0 bg-gradient-to-r from-[#102b22]/95 via-[#102b22]/75 to-transparent" /><div className="page-container relative z-10 flex min-h-[calc(100dvh-4rem)] items-center py-12"><div className="w-full max-w-md"><span className="brand-symbol">ส</span><h1 className="mt-6 text-4xl font-extrabold sm:text-5xl">{initialMode === "register" ? dictionary.auth.registerTitle : dictionary.auth.loginTitle}</h1><p className="mt-4 text-lg leading-8 text-emerald-50">{dictionary.auth.loginDescription}</p><div className="mt-8 rounded-lg bg-white p-5 text-slate-900 shadow-xl"><EmailAuthForm locale={locale} dictionary={dictionary} initialMode={initialMode} onSignedIn={signedIn} /><div className="my-4 flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-slate-200" /><span>{dictionary.auth.or}</span><span className="h-px flex-1 bg-slate-200" /></div><div className="grid gap-3"><a href={oauthUrl} className="auth-provider-button"><span className="provider-mark">G</span>{dictionary.auth.google}</a>{process.env.NODE_ENV !== "production" ? <Button onClick={demo} disabled={busy} className="bg-emerald-600 text-white hover:bg-emerald-500"><LogIn size={18} />{dictionary.auth.demo}</Button> : null}</div></div></div></div></section>;
}
