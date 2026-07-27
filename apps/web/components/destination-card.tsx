"use client";

import type { DestinationCard as DestinationCardType, Locale } from "@tourism/contracts";
import { Button } from "@tourism/ui";
import { Bookmark, Clock3, Heart, MapPin, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@/lib/i18n";
import { userApi } from "@/lib/api";
import { useAuth } from "./auth-provider";

export function DestinationCard({ destination, locale, dictionary, priority = false, compact = false }: { destination: DestinationCardType; locale: Locale; dictionary: Dictionary; priority?: boolean; compact?: boolean }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const favoriteMutation = useMutation({ mutationFn: (enabled: boolean) => userApi.favorite(destination.id, enabled), onSuccess: () => queryClient.invalidateQueries() });
  const likeMutation = useMutation({ mutationFn: (enabled: boolean) => userApi.like(destination.id, enabled), onSuccess: () => queryClient.invalidateQueries() });
  const favorite = () => auth.requireAuth(() => favoriteMutation.mutate(!destination.isFavorite));
  const like = () => auth.requireAuth(() => likeMutation.mutate(!destination.isLiked));
  return <article className={compact ? "destination-card compact" : "destination-card"}><Link href={`/${locale}/destinations/${destination.slug}`} className="destination-card-image"><Image src={destination.primaryImage.url} alt={destination.primaryImage.alt} fill sizes={compact ? "(max-width: 768px) 78vw, 300px" : "(max-width: 768px) 92vw, 380px"} priority={priority} className="object-cover" /><span className="scope-badge">{destination.scope === "thailand" ? dictionary.common.thailand : dictionary.common.worldwide}</span></Link><div className="destination-card-body"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/${locale}/destinations/${destination.slug}`}><h3>{destination.name}</h3></Link><p className="location-line"><MapPin size={14} />{[destination.city, destination.province, destination.country].filter(Boolean).join(", ")}</p></div><div className="card-actions"><Button onClick={favorite} aria-label={destination.isFavorite ? dictionary.common.saved : dictionary.common.save} title={dictionary.common.save} className={destination.isFavorite ? "card-icon-button active" : "card-icon-button"}><Bookmark size={17} fill={destination.isFavorite ? "currentColor" : "none"} /></Button><Button onClick={like} aria-label={destination.isLiked ? dictionary.common.liked : dictionary.common.like} title={dictionary.common.like} className={destination.isLiked ? "card-icon-button liked" : "card-icon-button"}><Heart size={17} fill={destination.isLiked ? "currentColor" : "none"} /></Button></div></div><p className="destination-description">{destination.shortDescription}</p><div className="card-metrics"><span><Star size={15} fill="currentColor" />{destination.rating.toFixed(1)}</span><span><Heart size={15} />{destination.likesCount.toLocaleString(locale)}</span><span><Clock3 size={15} />{destination.travelTimeMinutes ? `${destination.travelTimeMinutes} ${dictionary.common.minutes}` : dictionary.common.setOrigin}</span></div><div className="tag-row">{destination.categories.slice(0, 3).map((category) => <span key={category.id} className="tag">{category.name}</span>)}</div></div></article>;
}
