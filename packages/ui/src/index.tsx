"use client";

import { X } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...values: ClassValue[]) => twMerge(clsx(values));

export function Button({ className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cn("inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none transition-shadow placeholder:text-[var(--muted)] focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20", className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-[var(--surface-muted)]", className)} />;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-5 text-center"><div className="text-[var(--muted)]">{icon}</div><h2 className="text-lg font-bold">{title}</h2><p className="max-w-md text-sm text-[var(--muted)]">{description}</p>{action}</div>;
}

export function Dialog({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl outline-none"><div className="flex items-start justify-between gap-4"><div><h2 id={titleId} className="text-xl font-bold">{title}</h2>{description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}</div><Button aria-label="Close" title="Close" className="h-10 min-h-10 w-10 p-0 hover:bg-[var(--surface-muted)]" onClick={onClose}><X size={18} /></Button></div><div className="mt-5">{children}</div></div></div>;
}

export * from "./form";
export * from "./validation";
