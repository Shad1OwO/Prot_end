"use client";

import type { DestinationDetail, Locale, Trip } from "@tourism/contracts";
import { Button, Dialog } from "@tourism/ui";
import { Bookmark, Check, Heart, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Dictionary } from "@/lib/i18n";
import { tripApi, userApi } from "@/lib/api";
import { useAuth } from "./auth-provider";

export function DestinationActions({ destination, locale, dictionary }: { destination: DestinationDetail; locale: Locale; dictionary: Dictionary }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [tripDialogOpen, setTripDialogOpen] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const trips = useQuery({ queryKey: ["trips", locale], queryFn: () => tripApi.list(locale), enabled: Boolean(auth.session) && tripDialogOpen });
  const favorite = useMutation({ mutationFn: (enabled: boolean) => userApi.favorite(destination.id, enabled), onSuccess: () => queryClient.invalidateQueries() });
  const like = useMutation({ mutationFn: (enabled: boolean) => userApi.like(destination.id, enabled), onSuccess: () => queryClient.invalidateQueries() });
  const add = useMutation({ mutationFn: (trip: Trip) => tripApi.addDestination(trip.id, destination.id, locale), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["trips"] }); setTripDialogOpen(false); } });
  const create = useMutation({ mutationFn: async () => { const trip = await tripApi.create(locale, { name: newTripName }); return tripApi.addDestination(trip.id, destination.id, locale); }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["trips"] }); setNewTripName(""); setTripDialogOpen(false); } });
  return <><div className="grid grid-cols-3 gap-2"><Button onClick={() => auth.requireAuth(() => favorite.mutate(!destination.isFavorite))} className={destination.isFavorite ? "bg-emerald-700 text-white" : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"}><Bookmark size={17} fill={destination.isFavorite ? "currentColor" : "none"} />{destination.isFavorite ? dictionary.common.saved : dictionary.common.save}</Button><Button onClick={() => auth.requireAuth(() => like.mutate(!destination.isLiked))} className={destination.isLiked ? "bg-[var(--coral)] text-white" : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"}><Heart size={17} fill={destination.isLiked ? "currentColor" : "none"} />{destination.isLiked ? dictionary.common.liked : dictionary.common.like}</Button><Button onClick={() => auth.requireAuth(() => setTripDialogOpen(true))} className="bg-emerald-700 text-white hover:bg-emerald-800"><Plus size={17} />{dictionary.common.addToTrip}</Button></div><Dialog open={tripDialogOpen} onClose={() => setTripDialogOpen(false)} title={dictionary.destination.selectTrip}><div className="grid gap-2">{trips.data?.items.map((trip) => <Button key={trip.id} onClick={() => add.mutate(trip)} disabled={add.isPending} className="justify-between border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"><span>{trip.name}</span><Check size={16} /></Button>)}{trips.data?.items.length === 0 ? <p className="text-sm text-[var(--muted)]">{dictionary.destination.noTrips}</p> : null}<div className="mt-3 border-t border-[var(--border)] pt-3"><label className="field-label" htmlFor="new-trip-name">{dictionary.destination.createTrip}</label><div className="mt-2 flex gap-2"><input id="new-trip-name" className="text-input" value={newTripName} onChange={(event) => setNewTripName(event.target.value)} /><Button onClick={() => create.mutate()} disabled={newTripName.trim().length === 0 || create.isPending} className="bg-emerald-700 text-white"><Plus size={17} /></Button></div></div></div></Dialog></>;
}
