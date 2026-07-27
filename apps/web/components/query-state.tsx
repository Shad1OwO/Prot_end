"use client";

import { Button, EmptyState, Skeleton } from "@tourism/ui";
import { AlertCircle, MapPinOff, RefreshCw } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

export function DestinationGridSkeleton({ count = 6 }: { count?: number }) {
  return <div className="results-grid" aria-label="Loading destinations">{Array.from({ length: count }, (_, index) => <div key={index} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"><Skeleton className="aspect-[4/3] w-full rounded-none" /><div className="space-y-3 p-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-10 w-full" /><Skeleton className="h-4 w-4/5" /></div></div>)}</div>;
}

export function RailSkeleton() {
  return <div className="destination-rail" aria-label="Loading destinations">{Array.from({ length: 4 }, (_, index) => <div key={index} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"><Skeleton className="aspect-[4/3] w-full rounded-none" /><div className="space-y-3 p-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-10 w-full" /><Skeleton className="h-4 w-4/5" /></div></div>)}</div>;
}

export function QueryError({ dictionary, retry }: { dictionary: Dictionary; retry: () => void }) {
  return <EmptyState icon={<AlertCircle size={34} />} title={dictionary.errors.generic} description={dictionary.errors.genericDescription} action={<Button onClick={retry} className="bg-emerald-700 text-white hover:bg-emerald-800"><RefreshCw size={17} />{dictionary.common.retry}</Button>} />;
}

export function NoResults({ dictionary }: { dictionary: Dictionary }) {
  return <EmptyState icon={<MapPinOff size={34} />} title={dictionary.common.noResults} description={dictionary.explore.description} />;
}
