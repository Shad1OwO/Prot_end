import { Skeleton } from "@tourism/ui";

export default function Loading() {
  return <div className="page-container py-10" aria-label="Loading page"><Skeleton className="h-10 w-72" /><Skeleton className="mt-4 h-5 w-[min(100%,520px)]" /><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"><Skeleton className="aspect-[4/3] w-full rounded-none" /><div className="space-y-3 p-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-14 w-full" /></div></div>)}</div></div>;
}
