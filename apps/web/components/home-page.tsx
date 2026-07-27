"use client";

import type { DestinationCard as DestinationCardType, Locale } from "@tourism/contracts";
import { useQuery } from "@tanstack/react-query";
import { Building2, Landmark, Mountain, Search, Trees, Utensils, Waves } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { catalogApi } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n";
import { DestinationCard } from "./destination-card";
import { QueryError, RailSkeleton } from "./query-state";

const categoryIcons = { Waves, Landmark, Trees, Utensils, Mountain, Building2 } as const;

function DestinationSection({ title, items, locale, dictionary, scope }: { title: string; items: DestinationCardType[]; locale: Locale; dictionary: Dictionary; scope: "thailand" | "worldwide" }) {
  if (items.length === 0) return null;
  return <section className="content-band"><div className="page-container"><div className="section-heading"><h2>{title}</h2><Link href={`/${locale}/explore?scope=${scope}`}>{dictionary.common.viewAll}</Link></div><div className="destination-rail">{items.map((destination, index) => <DestinationCard key={destination.id} destination={destination} locale={locale} dictionary={dictionary} priority={index === 0} compact />)}</div></div></section>;
}

export function HomePage({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const router = useRouter();
  const [scope, setScope] = useState<"thailand" | "worldwide">("thailand");
  const [query, setQuery] = useState("");
  const homeQuery = useQuery({ queryKey: ["home", locale, scope], queryFn: () => catalogApi.home(locale, scope) });
  const categoriesQuery = useQuery({ queryKey: ["categories", locale], queryFn: () => catalogApi.categories(locale) });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({ scope });
    if (query.trim()) params.set("query", query.trim());
    router.push(`/${locale}/explore?${params}`);
  };
  return <>
    <section className="hero-band"><div className="hero-media"><Image src="https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=2000&q=90" alt="Mountain pagodas in northern Thailand" fill priority sizes="100vw" className="object-cover" /></div><div className="page-container"><div className="hero-content"><p className="hero-eyebrow">{dictionary.home.eyebrow}</p><h1 className="hero-title">{dictionary.home.title}</h1><p className="hero-description">{dictionary.home.description}</p><form className="hero-search" onSubmit={submit}><div className="scope-control" aria-label="Catalog scope"><button type="button" className={scope === "thailand" ? "scope-option active" : "scope-option"} onClick={() => setScope("thailand")}>{dictionary.common.thailand}</button><button type="button" className={scope === "worldwide" ? "scope-option active" : "scope-option"} onClick={() => setScope("worldwide")}>{dictionary.common.worldwide}</button></div><label className="search-field-wrap"><Search size={19} aria-hidden="true" /><span className="sr-only">{dictionary.common.search}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={dictionary.home.searchPlaceholder} /></label><button className="search-submit" type="submit">{dictionary.common.search}</button></form></div></div></section>
    <section className="content-band alt"><div className="page-container"><div className="section-heading"><h2>{dictionary.home.categories}</h2><Link href={`/${locale}/categories`}>{dictionary.common.viewAll}</Link></div>{categoriesQuery.isLoading ? <RailSkeleton /> : categoriesQuery.isError ? <QueryError dictionary={dictionary} retry={() => void categoriesQuery.refetch()} /> : <div className="category-grid">{categoriesQuery.data?.slice(0, 6).map((category) => { const Icon = categoryIcons[category.icon as keyof typeof categoryIcons] ?? Map; return <Link key={category.id} className="category-tile" href={`/${locale}/explore?scope=${scope}&category=${category.slug}`}><span className="category-icon"><Icon size={20} /></span><span><strong className="block">{category.name}</strong><small>{category.destinationCount.toLocaleString(locale)}</small></span></Link>; })}</div>}</div></section>
    {homeQuery.isLoading ? <section className="content-band"><div className="page-container"><RailSkeleton /></div></section> : homeQuery.isError ? <section className="content-band"><div className="page-container"><QueryError dictionary={dictionary} retry={() => void homeQuery.refetch()} /></div></section> : homeQuery.data ? <><DestinationSection title={dictionary.home.featured} items={homeQuery.data.featured} locale={locale} dictionary={dictionary} scope={scope} /><div className="bg-[var(--surface)]"><DestinationSection title={dictionary.home.trending} items={homeQuery.data.trending} locale={locale} dictionary={dictionary} scope={scope} /></div><DestinationSection title={dictionary.home.popular} items={homeQuery.data.popular} locale={locale} dictionary={dictionary} scope={scope} /><div className="bg-[var(--surface)]"><DestinationSection title={dictionary.home.seasonal} items={homeQuery.data.seasonal} locale={locale} dictionary={dictionary} scope={scope} /></div><DestinationSection title={dictionary.home.personalized} items={homeQuery.data.personalized} locale={locale} dictionary={dictionary} scope={scope} /></> : null}
  </>;
}
