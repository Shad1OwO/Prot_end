"use client";

import type { DestinationQuery, Locale } from "@tourism/contracts";
import { Button } from "@tourism/ui";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Filter, LocateFixed, Map as MapIcon, RotateCcw, Rows3, Search, SlidersHorizontal, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { catalogApi } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n";
import { DestinationCard } from "./destination-card";
import { DestinationGridSkeleton, NoResults, QueryError } from "./query-state";

const DestinationMap = dynamic(() => import("./destination-map").then((module) => module.DestinationMap), { ssr: false, loading: () => <div className="grid h-full place-items-center text-sm text-[var(--muted)]">Loading map...</div> });
const travelerOptions = ["nature-lover", "culture-seeker", "foodie", "adventurer", "family", "couple", "solo", "photographer"];

interface ExploreFilters {
  scope: "thailand" | "worldwide";
  query: string;
  category: string;
  travelerType: string;
  startDate: string;
  endDate: string;
  country: string;
  province: string;
  city: string;
  maxDistanceKm: string;
  sort: "featured" | "rating" | "popular" | "distance";
  originLat?: number;
  originLng?: number;
}

function readFilters(search: URLSearchParams): ExploreFilters {
  const scope = search.get("scope") === "worldwide" ? "worldwide" : "thailand";
  const sortValue = search.get("sort");
  const sort = sortValue === "rating" || sortValue === "popular" || sortValue === "distance" ? sortValue : "featured";
  return {
    scope,
    query: search.get("query") ?? "",
    category: search.get("category") ?? "",
    travelerType: search.get("travelerType") ?? "",
    startDate: search.get("startDate") ?? "",
    endDate: search.get("endDate") ?? "",
    country: search.get("country") ?? "",
    province: search.get("province") ?? "",
    city: search.get("city") ?? "",
    maxDistanceKm: search.get("maxDistanceKm") ?? "",
    sort,
  };
}

export function ExplorePage({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = useMemo(() => readFilters(searchParams), [searchParams]);
  const [filters, setFilters] = useState<ExploreFilters>(initial);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [locationError, setLocationError] = useState<string | null>(null);
  const categories = useQuery({ queryKey: ["categories", locale], queryFn: () => catalogApi.categories(locale) });
  const appliedQuery = useMemo<Partial<DestinationQuery>>(() => ({
    locale,
    scope: filters.scope,
    sort: filters.sort,
    limit: 8,
    ...(filters.query ? { query: filters.query } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.travelerType ? { travelerType: filters.travelerType } : {}),
    ...(filters.startDate ? { startDate: filters.startDate } : {}),
    ...(filters.endDate ? { endDate: filters.endDate } : {}),
    ...(filters.country ? { country: filters.country } : {}),
    ...(filters.province ? { province: filters.province } : {}),
    ...(filters.city ? { city: filters.city } : {}),
    ...(filters.maxDistanceKm ? { maxDistanceKm: Number(filters.maxDistanceKm) } : {}),
    ...(filters.originLat !== undefined ? { originLat: filters.originLat } : {}),
    ...(filters.originLng !== undefined ? { originLng: filters.originLng } : {}),
  }), [filters, locale]);
  const results = useInfiniteQuery({
    queryKey: ["destinations", appliedQuery],
    queryFn: ({ pageParam }) => catalogApi.destinations({ ...appliedQuery, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: "",
    getNextPageParam: (page) => page.page.nextCursor ?? undefined,
  });
  const destinations = results.data?.pages.flatMap((page) => page.items) ?? [];

  const update = <K extends keyof ExploreFilters>(key: K, value: ExploreFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== "" && value !== undefined) params.set(key, String(value));
    params.delete("originLat");
    params.delete("originLng");
    router.replace(`/${locale}/explore?${params}`, { scroll: false });
    setMobileFiltersOpen(false);
  }, [filters, locale, router]);
  const reset = () => {
    const value: ExploreFilters = { scope: "thailand", query: "", category: "", travelerType: "", startDate: "", endDate: "", country: "", province: "", city: "", maxDistanceKm: "", sort: "featured" };
    setFilters(value);
    router.replace(`/${locale}/explore`, { scroll: false });
  };
  const useLocation = () => {
    setLocationError(null);
    if (!navigator.geolocation) { setLocationError("Geolocation is not supported by this browser."); return; }
    navigator.geolocation.getCurrentPosition((position) => {
      setFilters((current) => ({ ...current, originLat: position.coords.latitude, originLng: position.coords.longitude, sort: current.sort === "featured" ? "distance" : current.sort }));
    }, () => setLocationError(locale === "th" ? "ไม่สามารถเข้าถึงตำแหน่งได้" : "Location access was unavailable."), { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 });
  };

  const filterForm = <div className="filter-panel-inner"><div className="flex items-center justify-between"><strong className="flex items-center gap-2"><SlidersHorizontal size={18} />{dictionary.explore.filters}</strong><Button className="icon-button lg:hidden" onClick={() => setMobileFiltersOpen(false)} aria-label={dictionary.common.close}><X size={19} /></Button></div><div className="filter-group"><label htmlFor="scope">{dictionary.common.thailand} / {dictionary.common.worldwide}</label><select id="scope" className="select-input" value={filters.scope} onChange={(event) => update("scope", event.target.value as ExploreFilters["scope"])}><option value="thailand">{dictionary.common.thailand}</option><option value="worldwide">{dictionary.common.worldwide}</option></select></div><div className="filter-group"><label htmlFor="category">{dictionary.explore.category}</label><select id="category" className="select-input" value={filters.category} onChange={(event) => update("category", event.target.value)}><option value="">{dictionary.common.viewAll}</option>{categories.data?.map((category) => <option value={category.slug} key={category.id}>{category.name}</option>)}</select></div><div className="filter-group"><label htmlFor="traveler">{dictionary.explore.traveler}</label><select id="traveler" className="select-input" value={filters.travelerType} onChange={(event) => update("travelerType", event.target.value)}><option value="">{dictionary.common.viewAll}</option>{travelerOptions.map((traveler) => <option key={traveler} value={traveler}>{traveler.replaceAll("-", " ")}</option>)}</select></div><div className="grid grid-cols-2 gap-2"><div className="filter-group"><label htmlFor="start-date">{dictionary.explore.startDate}</label><input id="start-date" className="date-input" type="date" value={filters.startDate} onChange={(event) => update("startDate", event.target.value)} /></div><div className="filter-group"><label htmlFor="end-date">{dictionary.explore.endDate}</label><input id="end-date" className="date-input" type="date" value={filters.endDate} onChange={(event) => update("endDate", event.target.value)} /></div></div><div className="filter-group"><label htmlFor="country">{dictionary.explore.country}</label><input id="country" className="text-input" value={filters.country} maxLength={2} onChange={(event) => update("country", event.target.value.toUpperCase())} placeholder="TH" /></div><div className="grid grid-cols-2 gap-2"><div className="filter-group"><label htmlFor="province">{dictionary.explore.province}</label><input id="province" className="text-input" value={filters.province} onChange={(event) => update("province", event.target.value)} /></div><div className="filter-group"><label htmlFor="city">{dictionary.explore.city}</label><input id="city" className="text-input" value={filters.city} onChange={(event) => update("city", event.target.value)} /></div></div><div className="filter-group"><label htmlFor="distance">{dictionary.explore.distance}</label><select id="distance" className="select-input" value={filters.maxDistanceKm} onChange={(event) => update("maxDistanceKm", event.target.value)}><option value="">—</option><option value="25">25 km</option><option value="50">50 km</option><option value="100">100 km</option><option value="250">250 km</option><option value="500">500 km</option></select><Button onClick={useLocation} className="border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text)]"><LocateFixed size={17} />{dictionary.common.useLocation}</Button>{filters.originLat !== undefined ? <small className="text-emerald-700">{filters.originLat.toFixed(3)}, {filters.originLng?.toFixed(3)}</small> : null}{locationError ? <small className="text-red-700">{locationError}</small> : null}</div><div className="filter-group"><label htmlFor="sort">{dictionary.explore.sort}</label><select id="sort" className="select-input" value={filters.sort} onChange={(event) => update("sort", event.target.value as ExploreFilters["sort"])}><option value="featured">Featured</option><option value="rating">Rating</option><option value="popular">Popular</option><option value="distance">Distance</option></select></div><div className="grid grid-cols-2 gap-2"><Button onClick={reset} className="border border-[var(--border)] bg-transparent text-[var(--text)]"><RotateCcw size={16} />{dictionary.explore.reset}</Button><Button onClick={applyFilters} className="bg-emerald-700 text-white hover:bg-emerald-800"><Filter size={16} />{dictionary.explore.filters}</Button></div></div>;

  return <div className="list-page"><div className="page-container"><header className="page-header"><h1>{dictionary.explore.title}</h1><p>{dictionary.explore.description}</p></header><div className="mb-4 flex flex-wrap items-center gap-2"><label className="search-field-wrap min-h-11 min-w-[240px] flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)]"><Search size={18} /><input value={filters.query} onChange={(event) => update("query", event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyFilters(); }} placeholder={dictionary.home.searchPlaceholder} /></label><Button className="border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] lg:hidden" onClick={() => setMobileFiltersOpen(true)}><SlidersHorizontal size={18} />{dictionary.explore.filters}</Button><div className="flex lg:hidden"><Button className={mobileView === "list" ? "filter-chip active" : "filter-chip"} onClick={() => setMobileView("list")}><Rows3 size={16} />{dictionary.explore.list}</Button><Button className={mobileView === "map" ? "filter-chip active" : "filter-chip"} onClick={() => setMobileView("map")}><MapIcon size={16} />{dictionary.explore.map}</Button></div></div><div className="explore-layout"><aside className="filter-panel hidden lg:block">{filterForm}</aside><section className="explore-results has-map"><div className={mobileView === "map" ? "hidden lg:block" : "block"}>{results.isLoading ? <DestinationGridSkeleton count={6} /> : results.isError ? <QueryError dictionary={dictionary} retry={() => void results.refetch()} /> : destinations.length === 0 ? <NoResults dictionary={dictionary} /> : <><div className="results-grid">{destinations.map((destination, index) => <DestinationCard key={destination.id} destination={destination} locale={locale} dictionary={dictionary} priority={index === 0} />)}</div>{results.hasNextPage ? <div className="mt-5 flex justify-center"><Button onClick={() => void results.fetchNextPage()} disabled={results.isFetchingNextPage} className="bg-emerald-700 text-white hover:bg-emerald-800">{results.isFetchingNextPage ? dictionary.common.loading : dictionary.explore.loadMore}</Button></div> : null}</>}</div><div className={mobileView === "list" ? "map-panel hidden lg:block" : "map-panel block"}><DestinationMap destinations={destinations} locale={locale} /></div></section></div></div>{mobileFiltersOpen ? <div className="mobile-menu-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileFiltersOpen(false); }}><aside className="mobile-menu overflow-y-auto">{filterForm}</aside></div> : null}</div>;
}
