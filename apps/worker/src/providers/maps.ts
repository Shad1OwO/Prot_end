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
    if (!response.ok) {
      // Google explains a refused key (API not enabled, key restricted, billing) in error.message.
      const reason = await response.json().then((body: { error?: { message?: string } }) => body.error?.message).catch(() => undefined);
      throw new Error(`Google Routes returned ${response.status}${reason ? `: ${reason}` : ""}`);
    }
    const rows = await response.json() as Array<{ destinationIndex: number; duration?: string; distanceMeters?: number; status?: Record<string, unknown> }>;
    return destinations.map((item, index) => {
      const row = rows.find((candidate) => candidate.destinationIndex === index);
      return { destinationId: item.id, durationMinutes: row?.duration ? Math.ceil(Number.parseFloat(row.duration) / 60) : null, distanceKm: row?.distanceMeters ? row.distanceMeters / 1_000 : null };
    });
  }
}

/**
 * Narrows candidates to those within `maxDistanceKm` by road. The catalog query has already applied the
 * straight-line limit, so this only refines it: without a limit there is nothing to refine and Google is not
 * called, and a failed call keeps the straight-line candidates instead of failing the recommendation.
 */
export async function filterByDrivingDistance(
  maps: Pick<GoogleMapsRoutingProvider, "configured" | "estimate">,
  origin: Coordinate | undefined,
  candidates: DestinationCard[],
  maxDistanceKm: number | undefined,
): Promise<{ candidates: DestinationCard[]; error?: string }> {
  if (!origin || !maxDistanceKm || !maps.configured) return { candidates };
  try {
    const routes = await maps.estimate(origin, candidates.slice(0, 12));
    const allowed = new Set(routes.filter((route) => route.distanceKm !== null && route.distanceKm <= maxDistanceKm).map((route) => route.destinationId));
    return { candidates: candidates.filter((item) => allowed.has(item.id)) };
  } catch (error) {
    return { candidates, error: error instanceof Error ? error.message : String(error) };
  }
}
