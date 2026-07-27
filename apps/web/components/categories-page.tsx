"use client";

import type { Locale } from "@tourism/contracts";
import { useQuery } from "@tanstack/react-query";
import { Building2, Landmark, Map, Mountain, Trees, Utensils, Waves } from "lucide-react";
import Link from "next/link";
import { catalogApi } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n";
import { QueryError, RailSkeleton } from "./query-state";

const icons = { Waves, Landmark, Trees, Utensils, Mountain, Building2 } as const;

export function CategoriesPage({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const query = useQuery({ queryKey: ["categories", locale], queryFn: () => catalogApi.categories(locale) });
  return <div className="list-page"><div className="page-container"><header className="page-header"><h1>{dictionary.categories.title}</h1><p>{dictionary.categories.description}</p></header>{query.isLoading ? <RailSkeleton /> : query.isError ? <QueryError dictionary={dictionary} retry={() => void query.refetch()} /> : <div className="category-grid">{query.data?.map((category) => { const Icon = icons[category.icon as keyof typeof icons] ?? Map; return <Link key={category.id} className="category-tile min-h-40" href={`/${locale}/explore?category=${category.slug}`}><span className="category-icon"><Icon size={22} /></span><span><strong className="block text-lg">{category.name}</strong><small>{category.destinationCount.toLocaleString(locale)} destinations</small></span></Link>; })}</div>}</div></div>;
}
