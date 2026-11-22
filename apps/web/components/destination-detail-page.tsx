"use client";

import type { Locale } from "@tourism/contracts";
import { Skeleton } from "@tourism/ui";
import { Bus, Car, Clock3, MapPin, Plane, Star, TrainFront, Waves } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { catalogApi } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n";
import { DestinationActions } from "./destination-actions";
import { QueryError } from "./query-state";

const DestinationMap = dynamic(() => import("./destination-map").then((module) => module.DestinationMap), { ssr: false });
const transportIcons = { car: Car, rail: TrainFront, transit: Bus, airplane: Plane } as const;
const monthNames = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  th: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."],
};

export function DestinationDetailPage({ slug, locale, dictionary }: { slug: string; locale: Locale; dictionary: Dictionary }) {
  const query = useQuery({ queryKey: ["destination", slug, locale], queryFn: () => catalogApi.destination(slug, locale) });
  if (query.isLoading) return <div><Skeleton className="h-[60vh] w-full rounded-none" /><div className="page-container grid gap-4 py-8"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-40 w-full" /></div></div>;
  if (query.isError || !query.data) return <div className="page-container py-12"><QueryError dictionary={dictionary} retry={() => void query.refetch()} /></div>;
  const destination = query.data;
  const credit = destination.primaryImage.attribution;
  const textSource = (locale === "th" ? destination.metadata.wikipediaUrlTh : undefined) ?? destination.metadata.wikipediaUrlEn;
  const external = { rel: "noopener noreferrer", target: "_blank" } as const;
  const jsonLd = { "@context": "https://schema.org", "@type": "TouristAttraction", name: destination.name, description: destination.description, image: destination.images.map((image) => image.url), address: { "@type": "PostalAddress", streetAddress: destination.address, addressLocality: destination.city, addressRegion: destination.province, addressCountry: destination.country }, geo: { "@type": "GeoCoordinates", latitude: destination.coordinates.latitude, longitude: destination.coordinates.longitude }, ...(destination.rating > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: destination.rating, ratingCount: Math.max(destination.likesCount, 1) } } : {}) };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replaceAll("<", "\\u003c") }} /><section className="detail-hero"><Image src={destination.primaryImage.url} alt={destination.primaryImage.alt} fill priority sizes="100vw" className="object-cover" /><div className="detail-hero-overlay" />{credit ? <p className="photo-credit">{dictionary.destination.photo}: <a href={credit.sourceUrl} {...external}>{credit.author}</a> · {credit.licenseUrl ? <a href={credit.licenseUrl} {...external}>{credit.license}</a> : credit.license}</p> : null}<div className="page-container detail-hero-content"><div className="tag-row">{destination.categories.map((category) => <span className="tag bg-white/90 text-slate-800" key={category.id}>{category.name}</span>)}</div><h1>{destination.name}</h1><div className="detail-meta"><span><MapPin size={18} />{[destination.city, destination.province, destination.country].filter(Boolean).join(", ")}</span>{destination.rating > 0 ? <span><Star size={18} fill="currentColor" className="text-amber-400" />{destination.rating.toFixed(1)}</span> : null}<span><Waves size={18} />{destination.likesCount.toLocaleString(locale)}</span></div></div></section><div className="page-container detail-layout"><div className="detail-main"><section className="detail-section"><h2>{dictionary.destination.about}</h2><p>{destination.description}</p>{textSource ? <a className="mt-3 inline-flex text-sm font-bold text-emerald-700" href={textSource} {...external}>{dictionary.destination.textSource}</a> : null}</section><section className="detail-section"><h2>{dictionary.destination.gettingThere}</h2><div className="transport-list">{destination.transports.map((transport) => { const Icon = transportIcons[transport.mode]; return <div className="transport-item" key={transport.mode}><span className="flex items-center gap-3"><span className="category-icon"><Icon size={19} /></span><strong>{transport.label}</strong></span><span className="text-sm text-[var(--muted)]">{transport.durationMinutes ? `${transport.durationMinutes} ${dictionary.common.minutes}` : transport.available ? "Available" : "—"}</span></div>; })}</div></section><section className="detail-section"><h2>{dictionary.destination.location}</h2><p className="flex items-start gap-2"><MapPin className="mt-1 shrink-0" size={18} />{destination.address}</p><div className="map-panel mt-4 h-[360px] min-h-0"><DestinationMap destinations={[destination]} locale={locale} /></div></section></div><aside className="detail-sidebar"><h2>{dictionary.destination.planVisit}</h2><DestinationActions destination={destination} locale={locale} dictionary={dictionary} /><div className="detail-section"><h2>{dictionary.destination.bestTime}</h2><div className="month-list">{destination.bestMonths.map((month) => <span className="month-pill" key={month}>{monthNames[locale][month - 1]}</span>)}</div></div>{destination.openingHours ? <div className="detail-section"><h2>{dictionary.destination.openingHours}</h2><p className="flex items-center gap-2 text-sm text-[var(--muted)]"><Clock3 size={17} />{destination.openingHours}</p></div> : null}{destination.websiteUrl ? <a className="mt-4 inline-flex font-bold text-emerald-700" href={destination.websiteUrl} rel="noopener noreferrer" target="_blank">{dictionary.destination.website}</a> : null}</aside></div></>;
}
