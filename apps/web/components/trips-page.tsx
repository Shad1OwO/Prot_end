"use client";

import type { Locale, Trip, TripDestination } from "@tourism/contracts";
import { Button, Dialog, EmptyState, Skeleton } from "@tourism/ui";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, GripVertical, MapPin, Plus, Save, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { tripApi } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n";
import { ProtectedPage } from "./protected-page";

/* eslint-disable react-hooks/refs -- dnd-kit requires ref/listener values returned by useSortable during render. */
function SortableDestination({ item, locale, dictionary, remove }: { item: TripDestination; locale: Locale; dictionary: Dictionary; remove: () => void }) {
  const sortable = useSortable({ id: item.destination.id });
  return <div ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className="trip-destination"><button type="button" className="trip-drag-handle" {...sortable.attributes} {...sortable.listeners} aria-label={dictionary.trips.drag}><GripVertical size={20} /></button><div className="relative h-16 overflow-hidden rounded-md"><Image src={item.destination.primaryImage.url} alt="" fill sizes="68px" className="object-cover" /></div><div className="min-w-0"><Link className="font-bold hover:text-emerald-700" href={`/${locale}/destinations/${item.destination.slug}`}>{item.destination.name}</Link><p className="location-line"><MapPin size={13} />{item.destination.city ?? item.destination.country}</p></div><Button className="icon-button text-red-700" title={dictionary.trips.removeDestination} aria-label={dictionary.trips.removeDestination} onClick={remove}><X size={18} /></Button></div>;
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
  return <article className="trip-item"><div className="trip-item-header"><div><input aria-label={dictionary.trips.tripName} className="text-input font-bold" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><div className="mt-3 grid gap-2 sm:grid-cols-2"><input aria-label="Start date" className="date-input" type="date" value={draft.startDate ?? ""} onChange={(event) => setDraft({ ...draft, startDate: event.target.value || null })} /><input aria-label="End date" className="date-input" type="date" value={draft.endDate ?? ""} onChange={(event) => setDraft({ ...draft, endDate: event.target.value || null })} /></div></div><Button className="icon-button text-red-700" aria-label={dictionary.trips.deleteTrip} onClick={() => setConfirmDelete(true)}><Trash2 size={18} /></Button></div><textarea aria-label={dictionary.trips.notes} className="text-area mt-3" value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value || null })} /><div className="mt-4 flex items-center justify-between"><h3 className="font-bold">{dictionary.trips.itinerary}</h3><Button onClick={() => update.mutate()} disabled={update.isPending} className="bg-emerald-700 text-white"><Save size={16} />{dictionary.trips.saveChanges}</Button></div><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={draft.destinations.map((item) => item.destination.id)} strategy={verticalListSortingStrategy}>{draft.destinations.map((item) => <SortableDestination key={item.destination.id} item={item} locale={locale} dictionary={dictionary} remove={() => removeDestination.mutate(item.destination.id)} />)}</SortableContext></DndContext><Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title={dictionary.trips.deleteTrip}><p className="text-sm text-[var(--muted)]">{trip.name}</p><div className="form-actions mt-5"><Button onClick={() => setConfirmDelete(false)} className="border border-[var(--border)] bg-transparent text-[var(--text)]">{dictionary.common.cancel}</Button><Button onClick={() => removeTrip.mutate()} className="bg-red-700 text-white"><Trash2 size={16} />{dictionary.common.delete}</Button></div></Dialog></article>;
}

export function TripsPage({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const client = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const query = useQuery({ queryKey: ["trips", locale], queryFn: () => tripApi.list(locale) });
  const create = useMutation({ mutationFn: () => tripApi.create(locale, { name, startDate: startDate || null, endDate: endDate || null }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["trips"] }); setDialogOpen(false); setName(""); } });
  return <ProtectedPage dictionary={dictionary}><div className="page-container list-page"><header className="page-header flex items-end justify-between gap-4"><div><h1>{dictionary.trips.title}</h1><p>{dictionary.trips.emptyDescription}</p></div><Button onClick={() => setDialogOpen(true)} className="bg-emerald-700 text-white"><Plus size={18} />{dictionary.trips.newTrip}</Button></header>{query.isLoading ? <div className="space-y-4"><Skeleton className="h-72 w-full" /><Skeleton className="h-72 w-full" /></div> : query.data?.items.length ? <div className="trip-list">{query.data.items.map((trip) => <TripEditor key={trip.id} trip={trip} locale={locale} dictionary={dictionary} />)}</div> : <EmptyState icon={<CalendarDays size={38} />} title={dictionary.trips.empty} description={dictionary.trips.emptyDescription} action={<Button onClick={() => setDialogOpen(true)} className="bg-emerald-700 text-white"><Plus size={17} />{dictionary.trips.newTrip}</Button>} />}<Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={dictionary.trips.newTrip}><div className="form-stack"><label><span className="field-label">{dictionary.trips.tripName}</span><input className="text-input mt-2" value={name} onChange={(event) => setName(event.target.value)} /></label><div className="grid grid-cols-2 gap-2"><input aria-label="Start date" className="date-input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /><input aria-label="End date" className="date-input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div><Button onClick={() => create.mutate()} disabled={name.trim().length === 0 || create.isPending} className="bg-emerald-700 text-white"><Plus size={17} />{dictionary.trips.create}</Button></div></Dialog></div></ProtectedPage>;
}
