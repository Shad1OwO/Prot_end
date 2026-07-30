"use client";

import type { Locale } from "@tourism/contracts";
import { EmptyState } from "@tourism/ui";
import { useQuery } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";
import { userApi } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n";
import { DestinationCard } from "./destination-card";
import { ProtectedPage } from "./protected-page";
import { DestinationGridSkeleton, QueryError } from "./query-state";

export function SavedPage({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const query = useQuery({ queryKey: ["favorites", locale], queryFn: () => userApi.favorites(locale) });
  return <ProtectedPage dictionary={dictionary}><div className="page-container list-page"><header className="page-header"><h1>{dictionary.saved.title}</h1></header>{query.isLoading ? <DestinationGridSkeleton /> : query.isError ? <QueryError dictionary={dictionary} retry={() => void query.refetch()} /> : query.data?.items.length ? <div className="results-grid">{query.data.items.map((destination) => <DestinationCard key={destination.id} destination={destination} locale={locale} dictionary={dictionary} />)}</div> : <EmptyState icon={<Bookmark size={36} />} title={dictionary.saved.empty} description={dictionary.saved.emptyDescription} />}</div></ProtectedPage>;
}
