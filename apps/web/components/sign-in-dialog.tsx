"use client";

import { Button, Dialog } from "@tourism/ui";
import { LogIn } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { apiOrigin, authApi } from "@/lib/api";
import { getDictionary, isLocale } from "@/lib/i18n";
import { EmailAuthForm } from "./email-auth-form";

export function SignInDialog({ open, onClose, onSignedIn }: { open: boolean; onClose: () => void; onSignedIn: () => Promise<void> }) {
  const pathname = usePathname();
  const segment = pathname.split("/")[1] ?? "en";
  const locale = isLocale(segment) ? segment : "en";
  const dictionary = getDictionary(locale);
  const [busy, setBusy] = useState(false);
  const oauthUrl = `${apiOrigin}/api/v1/auth/oauth/google/start?locale=${locale}&returnTo=${encodeURIComponent(pathname)}`;
  const complete = async () => { await onSignedIn(); onClose(); };
  const demoSignIn = async () => {
    setBusy(true);
    try { await authApi.developmentSession(); await complete(); } finally { setBusy(false); }
  };
  return <Dialog open={open} onClose={onClose} title={dictionary.auth.title} description={dictionary.auth.description}><div className="grid gap-3"><EmailAuthForm locale={locale} dictionary={dictionary} onSignedIn={complete} /><div className="flex items-center gap-3 text-xs text-[var(--muted)]"><span className="h-px flex-1 bg-[var(--border)]" /><span>{dictionary.auth.or}</span><span className="h-px flex-1 bg-[var(--border)]" /></div><a href={oauthUrl} className="auth-provider-button"><span className="provider-mark">G</span>{dictionary.auth.google}</a>{process.env.NODE_ENV !== "production" ? <Button onClick={demoSignIn} disabled={busy} className="border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text)] hover:bg-[var(--border)]"><LogIn size={18} />{dictionary.auth.demo}</Button> : null}</div></Dialog>;
}
