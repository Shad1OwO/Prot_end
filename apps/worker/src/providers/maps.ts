import type { Coordinate, DestinationCard } from "@tourism/contracts";

export interface RouteEstimate { destinationId: string; durationMinutes: number | null; distanceKm: number | null; }

export class GoogleMapsRoutingProvider {
  readonly configured: boolean;
  constructor(readonly apiKey?: string) { this.configured = Boolean(apiKey); }

  async estimate(origin: Coordinate, destinations: DestinationCard[]): Promise<RouteEstimate[]> {
    if (!this.apiKey || destinations.length === 0) return destinations.map((item) => ({ destinationId: item.id, durationMinutes: null, distanceKm: null }));
    const response = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey, "x-goog-fieldmask": "originIndex,destinationIndex,duration,distanceMeters,status" },
      body: JSON.stringify({ origins: [{ waypoint: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } } }], destinations: destinations.map((item) => ({ waypoint: { location: { latLng: item.coordinates } } })), travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Google Routes returned ${response.status}`);
    const rows = await response.json() as Array<{ destinationIndex: number; duration?: string; distanceMeters?: number; status?: Record<string, unknown> }>;
    return destinations.map((item, index) => {
      const row = rows.find((candidate) => candidate.destinationIndex === index);
      return { destinationId: item.id, durationMinutes: row?.duration ? Math.ceil(Number.parseFloat(row.duration) / 60) : null, distanceKm: row?.distanceMeters ? row.distanceMeters / 1_000 : null };
    });
  }
}
