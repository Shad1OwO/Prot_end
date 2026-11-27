"use client";

import type { DestinationCard, Locale } from "@tourism/contracts";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";

function fitTo(map: LeafletMap, destinations: DestinationCard[]) {
  if (destinations.length === 0) return;
  if (destinations.length === 1) {
    const only = destinations[0];
    if (only) map.setView([only.coordinates.latitude, only.coordinates.longitude], 9);
    return;
  }
  map.fitBounds(destinations.map((item) => [item.coordinates.latitude, item.coordinates.longitude]), { padding: [32, 32], maxZoom: 10 });
}

// On phones the explore map starts hidden (List view), so Leaflet first measures it as 0×0 and fits to nothing.
// Re-measure whenever the container resizes, and fit again the moment it goes from hidden to visible.
function FitDestinations({ destinations }: { destinations: DestinationCard[] }) {
  const map = useMap();
  const latest = useRef(destinations);
  useEffect(() => {
    latest.current = destinations;
    fitTo(map, destinations);
  }, [destinations, map]);
  useEffect(() => {
    let wasHidden = map.getSize().x === 0 || map.getSize().y === 0;
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      const hidden = map.getSize().x === 0 || map.getSize().y === 0;
      if (wasHidden && !hidden) fitTo(map, latest.current);
      wasHidden = hidden;
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export function DestinationMap({ destinations, locale }: { destinations: DestinationCard[]; locale: Locale }) {
  const center: [number, number] = destinations[0]
    ? [destinations[0].coordinates.latitude, destinations[0].coordinates.longitude]
    : locale === "th" ? [13.7563, 100.5018] : [20, 10];
  return <MapContainer center={center} zoom={destinations.length ? 6 : 2} scrollWheelZoom className="h-full w-full" aria-label="Destination map"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><FitDestinations destinations={destinations} />{destinations.map((destination) => <CircleMarker key={destination.id} center={[destination.coordinates.latitude, destination.coordinates.longitude]} radius={9} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#df664c", fillOpacity: 1 }}><Tooltip direction="top" offset={[0, -10]} opacity={1}><strong>{destination.name}</strong><br />{destination.rating.toFixed(1)}</Tooltip></CircleMarker>)}</MapContainer>;
}
