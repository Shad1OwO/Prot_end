"use client";

import type { DestinationDetail, Locale, Trip } from "@tourism/contracts";
import { Button, Dialog, FormAlert } from "@tourism/ui";
import { Bookmark, Check, Heart, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
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
  const create = useMutation({ mutationFn: async () => { const trip = await tripApi.create(locale, { name: newTripName.trim() }); return tripApi.addDestination(trip.id, destination.id, locale); }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["trips"] }); setNewTripName(""); setTripDialogOpen(false); } });
  const submitNewTrip = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (newTripName.trim().length > 0 && !create.isPending) create.mutate(); };
  return <><div className="grid grid-cols-3 gap-2"><Button onClick={() => auth.requireAuth(() => favorite.mutate(!destination.isFavorite))} className={destination.isFavorite ? "bg-emerald-700 text-white hover:bg-emerald-800" : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-muted)]"}><Bookmark size={17} fill={destination.isFavorite ? "currentColor" : "none"} />{destination.isFavorite ? dictionary.common.saved : dictionary.common.save}</Button><Button onClick={() => auth.requireAuth(() => like.mutate(!destination.isLiked))} className={destination.isLiked ? "bg-[var(--coral)] text-white hover:brightness-95" : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-muted)]"}><Heart size={17} fill={destination.isLiked ? "currentColor" : "none"} />{destination.isLiked ? dictionary.common.liked : dictionary.common.like}</Button><Button onClick={() => auth.requireAuth(() => setTripDialogOpen(true))} className="bg-emerald-700 text-white hover:bg-emerald-800"><Plus size={17} />{dictionary.common.addToTrip}</Button></div><Dialog open={tripDialogOpen} onClose={() => setTripDialogOpen(false)} title={dictionary.destination.selectTrip}><div className="grid gap-2">{trips.data?.items.map((trip) => <Button key={trip.id} onClick={() => add.mutate(trip)} disabled={add.isPending} className="justify-between border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-emerald-600 hover:bg-[var(--surface-muted)]"><span className="min-w-0 truncate">{trip.name}</span><Check size={16} /></Button>)}{trips.data?.items.length === 0 ? <p className="text-sm text-[var(--muted)]">{dictionary.destination.noTrips}</p> : null}<form className="mt-3 border-t border-[var(--border)] pt-3" onSubmit={submitNewTrip}><label className="field-label" htmlFor="new-trip-name">{dictionary.destination.createTrip}</label><div className="mt-2 flex gap-2"><input id="new-trip-name" className="text-input min-w-0" required maxLength={120} autoComplete="off" placeholder={dictionary.trips.tripName} value={newTripName} onChange={(event) => setNewTripName(event.target.value)} /><Button type="submit" disabled={newTripName.trim().length === 0 || create.isPending} aria-label={dictionary.trips.create} title={dictionary.trips.create} className="shrink-0 bg-emerald-700 text-white hover:bg-emerald-800"><Plus size={17} /></Button></div><div className="mt-2"><FormAlert message={create.error?.message ?? add.error?.message} /></div></form></div></Dialog></>;
}
