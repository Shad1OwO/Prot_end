"use client";

import { Button, Dialog } from "@tourism/ui";
import { Facebook, LogIn } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { apiOrigin, authApi } from "@/lib/api";
import { getDictionary, isLocale } from "@/lib/i18n";

export function SignInDialog({ open, onClose, onSignedIn }: { open: boolean; onClose: () => void; onSignedIn: () => Promise<void> }) {
  const pathname = usePathname();
  const segment = pathname.split("/")[1] ?? "en";
  const locale = isLocale(segment) ? segment : "en";
  const dictionary = getDictionary(locale);
  const [busy, setBusy] = useState(false);
  const oauthUrl = (provider: "google" | "facebook") => `${apiOrigin}/api/v1/auth/oauth/${provider}/start?locale=${locale}&returnTo=${encodeURIComponent(pathname)}`;
  const demoSignIn = async () => {
    setBusy(true);
    try { await authApi.developmentSession(); await onSignedIn(); onClose(); } finally { setBusy(false); }
  };
  return <Dialog open={open} onClose={onClose} title={dictionary.auth.title} description={dictionary.auth.description}><div className="grid gap-3"><a href={oauthUrl("google")} className="auth-provider-button"><span className="provider-mark">G</span>{dictionary.auth.google}</a><a href={oauthUrl("facebook")} className="auth-provider-button"><Facebook size={19} aria-hidden="true" />{dictionary.auth.facebook}</a>{process.env.NODE_ENV !== "production" ? <Button onClick={demoSignIn} disabled={busy} className="border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text)] hover:bg-[var(--border)]"><LogIn size={18} />{dictionary.auth.demo}</Button> : null}</div></Dialog>;
}
