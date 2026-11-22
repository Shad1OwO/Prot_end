"use client";

import type { Locale, Trip, TripDestination } from "@tourism/contracts";
import { Button, Dialog, EmptyState, FormAlert, Skeleton } from "@tourism/ui";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, GripVertical, MapPin, Plus, Save, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { tripApi } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n";
import { ProtectedPage } from "./protected-page";

/* eslint-disable react-hooks/refs -- dnd-kit requires ref/listener values returned by useSortable during render. */
function SortableDestination({ item, locale, dictionary, remove }: { item: TripDestination; locale: Locale; dictionary: Dictionary; remove: () => void }) {
  const sortable = useSortable({ id: item.destination.id });
  return <div ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className="trip-destination"><button type="button" className="trip-drag-handle" {...sortable.attributes} {...sortable.listeners} aria-label={dictionary.trips.drag}><GripVertical size={20} /></button><div className="relative h-16 overflow-hidden rounded-md"><Image src={item.destination.primaryImage.url} alt="" fill sizes="68px" className="object-cover" /></div><div className="min-w-0"><Link className="font-bold hover:text-emerald-700" href={`/${locale}/destinations/${item.destination.slug}`}>{item.destination.name}</Link><p className="location-line"><MapPin size={13} />{item.destination.city ?? item.destination.country}</p></div><Button className="icon-button danger-icon-button" title={dictionary.trips.removeDestination} aria-label={dictionary.trips.removeDestination} onClick={remove}><X size={18} /></Button></div>;
}

function TripEditor({ trip, locale, dictionary }: { trip: Trip; locale: Locale; dictionary: Dictionary }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(trip);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const invalidate = () => client.invalidateQueries({ queryKey: ["trips"] });
  const update = useMutation({ mutationFn: () => tripApi.update(trip.id, locale, { name: draft.name, startDate: draft.startDate, endDate: draft.endDate, notes: draft.notes }), onSuccess: invalidate });
  const reorder = useMutation({ mutationFn: (items: TripDestination[]) => tripApi.reorder(trip.id, items.map((item) => item.destination.id), locale), onSuccess: invalidate });
  const removeDestination = useMutation({ mutationFn: (id: string) => tripApi.removeDestination(trip.id, id, locale), onSuccess: invalidate });
  const removeTrip = useMutation({ mutationFn: () => tripApi.remove(trip.id), onSuccess: invalidate });
  const dragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = draft.destinations.findIndex((item) => item.destination.id === event.active.id);
    const newIndex = draft.destinations.findIndex((item) => item.destination.id === event.over?.id);
    const items = arrayMove(draft.destinations, oldIndex, newIndex).map((item, position) => ({ ...item, position }));
    setDraft({ ...draft, destinations: items });
    reorder.mutate(items);
  };
  return <article className="trip-item"><div className="trip-item-header"><div><input aria-label={dictionary.trips.tripName} className="text-input trip-name-input" maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><div className="date-range mt-3"><input aria-label={dictionary.explore.startDate} className="date-input" type="date" value={draft.startDate ?? ""} onChange={(event) => setDraft({ ...draft, startDate: event.target.value || null })} /><input aria-label={dictionary.explore.endDate} className="date-input" type="date" min={draft.startDate ?? undefined} value={draft.endDate ?? ""} onChange={(event) => setDraft({ ...draft, endDate: event.target.value || null })} /></div></div><Button className="icon-button danger-icon-button" title={dictionary.trips.deleteTrip} aria-label={dictionary.trips.deleteTrip} onClick={() => setConfirmDelete(true)}><Trash2 size={18} /></Button></div><textarea aria-label={dictionary.trips.notes} placeholder={dictionary.trips.notes} className="text-area mt-3" value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value || null })} /><FormAlert message={update.error?.message} /><div className="trip-itinerary-bar"><h3 className="font-bold">{dictionary.trips.itinerary}</h3><Button onClick={() => update.mutate()} disabled={update.isPending || draft.name.trim().length === 0} className="bg-emerald-700 text-white hover:bg-emerald-800"><Save size={16} />{dictionary.trips.saveChanges}</Button></div><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={draft.destinations.map((item) => item.destination.id)} strategy={verticalListSortingStrategy}>{draft.destinations.map((item) => <SortableDestination key={item.destination.id} item={item} locale={locale} dictionary={dictionary} remove={() => removeDestination.mutate(item.destination.id)} />)}</SortableContext></DndContext><Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title={dictionary.trips.deleteTrip}><p className="text-sm text-[var(--muted)]">{trip.name}</p><div className="form-actions mt-5"><Button onClick={() => setConfirmDelete(false)} className="border border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-[var(--surface-muted)]">{dictionary.common.cancel}</Button><Button onClick={() => removeTrip.mutate()} disabled={removeTrip.isPending} className="bg-red-700 text-white hover:bg-red-800"><Trash2 size={16} />{dictionary.common.delete}</Button></div></Dialog></article>;
}

export function TripsPage({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const client = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const query = useQuery({ queryKey: ["trips", locale], queryFn: () => tripApi.list(locale) });
  const create = useMutation({ mutationFn: () => tripApi.create(locale, { name: name.trim(), startDate: startDate || null, endDate: endDate || null }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["trips"] }); closeDialog(); } });
  const openDialog = () => { create.reset(); setDialogOpen(true); };
  function closeDialog() { setDialogOpen(false); setName(""); setStartDate(""); setEndDate(""); }
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (name.trim().length > 0 && !create.isPending) create.mutate(); };
  return <ProtectedPage dictionary={dictionary}><div className="page-container list-page"><header className="page-header trips-header"><div><h1>{dictionary.trips.title}</h1><p>{dictionary.trips.emptyDescription}</p></div><Button onClick={openDialog} className="bg-emerald-700 text-white hover:bg-emerald-800"><Plus size={18} />{dictionary.trips.newTrip}</Button></header>{query.isLoading ? <div className="space-y-4"><Skeleton className="h-72 w-full" /><Skeleton className="h-72 w-full" /></div> : query.data?.items.length ? <div className="trip-list">{query.data.items.map((trip) => <TripEditor key={trip.id} trip={trip} locale={locale} dictionary={dictionary} />)}</div> : <EmptyState icon={<CalendarDays size={38} />} title={dictionary.trips.empty} description={dictionary.trips.emptyDescription} action={<Button onClick={openDialog} className="bg-emerald-700 text-white hover:bg-emerald-800"><Plus size={17} />{dictionary.trips.newTrip}</Button>} />}<Dialog open={dialogOpen} onClose={closeDialog} title={dictionary.trips.newTrip}><form className="form-stack" onSubmit={submit}><label className="field"><span className="field-label">{dictionary.trips.tripName}</span><input className="text-input" data-autofocus required maxLength={120} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} /></label><div className="date-range"><label className="field"><span className="field-label">{dictionary.explore.startDate}</span><input className="date-input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label className="field"><span className="field-label">{dictionary.explore.endDate}</span><input className="date-input" type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div><FormAlert message={create.error?.message} /><Button type="submit" disabled={name.trim().length === 0 || create.isPending} className="bg-emerald-700 text-white hover:bg-emerald-800"><Plus size={17} />{dictionary.trips.create}</Button></form></Dialog></div></ProtectedPage>;
}
