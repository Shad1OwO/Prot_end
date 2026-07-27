"use client";

import { Button } from "@tourism/ui";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="page-container grid min-h-[70vh] place-items-center py-16"><div className="max-w-lg text-center"><AlertTriangle className="mx-auto text-[var(--coral)]" size={42} /><h1 className="mt-5 text-3xl font-extrabold">Something went wrong</h1><p className="mt-3 text-[var(--muted)]">The request could not be completed. Try again.</p><Button onClick={reset} className="mt-6 bg-emerald-700 text-white hover:bg-emerald-800"><RefreshCw size={17} />Try again</Button></div></div>;
}
