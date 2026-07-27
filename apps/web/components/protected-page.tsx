"use client";

import { Button, Skeleton } from "@tourism/ui";
import { LockKeyhole, LogIn } from "lucide-react";
import type { ReactNode } from "react";
import type { Dictionary } from "@/lib/i18n";
import { useAuth } from "./auth-provider";

export function ProtectedPage({ dictionary, children }: { dictionary: Dictionary; children: ReactNode }) {
  const { session, loading, openSignIn } = useAuth();
  if (loading) return <div className="page-container py-10"><Skeleton className="h-10 w-64" /><Skeleton className="mt-6 h-72 w-full" /></div>;
  if (!session) return <div className="page-container grid min-h-[65vh] place-items-center py-16"><div className="max-w-md text-center"><LockKeyhole className="mx-auto text-emerald-700" size={36} /><h1 className="mt-5 text-3xl font-bold">{dictionary.auth.title}</h1><p className="mt-3 text-[var(--muted)]">{dictionary.auth.protected}</p><Button onClick={openSignIn} className="mt-6 bg-emerald-700 text-white hover:bg-emerald-800"><LogIn size={18} />{dictionary.nav.signIn}</Button></div></div>;
  return children;
}
