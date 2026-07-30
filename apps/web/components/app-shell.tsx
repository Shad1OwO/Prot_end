"use client";

import { Button } from "@tourism/ui";
import { Bookmark, Compass, Home, LogIn, Map, Menu, Moon, Settings, Sparkles, Sun, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./theme-provider";
import { useState, type ReactNode } from "react";
import type { Locale } from "@tourism/contracts";
import type { Dictionary } from "@/lib/i18n";
import { localizePath } from "@/lib/i18n";
import { useAuth } from "./auth-provider";


export function AppShell({ locale, dictionary, children }: { locale: Locale; dictionary: Dictionary; children: ReactNode }) {
  const pathname = usePathname();
  const { session, openSignIn } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = [
    { key: "home", href: `/${locale}`, icon: Home },
    { key: "explore", href: `/${locale}/explore`, icon: Compass },
    { key: "categories", href: `/${locale}/categories`, icon: Map },
    { key: "ai", href: `/${locale}/ai-search`, icon: Sparkles },
    { key: "trips", href: `/${locale}/trips`, icon: Bookmark },
  ] as const;
  return <div className="min-h-dvh bg-[var(--background)] text-[var(--text)]"><header className="app-header"><div className="page-container flex h-16 items-center gap-4"><Link href={`/${locale}`} className="brand-lockup" aria-label={dictionary.brand}><span className="brand-symbol">ส</span><span>{dictionary.brand}</span></Link><nav className="desktop-nav" aria-label="Primary navigation">{navItems.map(({ key, href }) => <Link key={key} href={href} className={pathname === href || (href !== `/${locale}` && pathname.startsWith(href)) ? "nav-link active" : "nav-link"}>{dictionary.nav[key]}</Link>)}</nav><div className="ml-auto flex items-center gap-1"><Link className="icon-button" href={localizePath(pathname, locale === "en" ? "th" : "en")} title={locale === "en" ? "ภาษาไทย" : "English"} aria-label={locale === "en" ? "Switch to Thai" : "Switch to English"}>{locale === "en" ? "TH" : "EN"}</Link><Button className="icon-button" aria-label="Toggle color theme" title="Theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{resolvedTheme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</Button>{session ? <Link href={`/${locale}/profile`} className="profile-button"><User size={18} /><span>{session.user.displayName}</span></Link> : <Button onClick={openSignIn} className="hidden bg-emerald-700 text-white hover:bg-emerald-800 sm:inline-flex"><LogIn size={17} />{dictionary.nav.signIn}</Button>}<Button className="icon-button lg:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu size={21} /></Button></div></div></header>{menuOpen ? <div className="mobile-menu-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }}><aside className="mobile-menu" aria-label="Mobile menu"><div className="flex items-center justify-between"><span className="brand-lockup"><span className="brand-symbol">ส</span>{dictionary.brand}</span><Button className="icon-button" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X size={20} /></Button></div><nav className="mt-6 grid gap-1">{navItems.map(({ key, href, icon: Icon }) => <Link key={key} href={href} onClick={() => setMenuOpen(false)} className="mobile-menu-link"><Icon size={19} />{dictionary.nav[key]}</Link>)}<Link href={`/${locale}/saved`} onClick={() => setMenuOpen(false)} className="mobile-menu-link"><Bookmark size={19} />{dictionary.nav.saved}</Link><Link href={`/${locale}/settings`} onClick={() => setMenuOpen(false)} className="mobile-menu-link"><Settings size={19} />{dictionary.nav.settings}</Link></nav></aside></div> : null}<main id="main-content" tabIndex={-1}>{children}</main><nav className="mobile-bottom-nav" aria-label="Mobile navigation">{navItems.slice(0, 5).map(({ key, href, icon: Icon }) => <Link key={key} href={href} className={pathname === href || (href !== `/${locale}` && pathname.startsWith(href)) ? "bottom-nav-link active" : "bottom-nav-link"}><Icon size={20} /><span>{dictionary.nav[key]}</span></Link>)}</nav></div>;
}
