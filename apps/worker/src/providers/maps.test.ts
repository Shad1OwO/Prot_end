import { describe, expect, test } from "bun:test";
import type { DestinationCard } from "@tourism/contracts";
import { filterByDrivingDistance, type RouteEstimate } from "./maps";

const origin = { latitude: 13.7563, longitude: 100.5018 };
const candidates = ["near", "far", "unknown"].map((id) => ({ id, coordinates: origin }) as unknown as DestinationCard);

function fakeMaps(estimate: () => Promise<RouteEstimate[]>) {
  let calls = 0;
  return { configured: true, calls: () => calls, estimate: async () => { calls += 1; return estimate(); } };
}

describe("driving distance filter", () => {
  test("keeps destinations within the limit by road", async () => {
    const maps = fakeMaps(async () => [
      { destinationId: "near", durationMinutes: 30, distanceKm: 40 },
      { destinationId: "far", durationMinutes: 300, distanceKm: 400 },
      { destinationId: "unknown", durationMinutes: null, distanceKm: null },
    ]);
    const result = await filterByDrivingDistance(maps, origin, candidates, 100);
    expect(result.candidates.map((item) => item.id)).toEqual(["near"]);
    expect(result.error).toBeUndefined();
  });

  test("keeps the candidates when Google refuses the request, instead of failing the recommendation", async () => {
    const maps = fakeMaps(async () => { throw new Error("Google Routes returned 403: Routes API has not been used in project"); });
    const result = await filterByDrivingDistance(maps, origin, candidates, 100);
    expect(result.candidates).toEqual(candidates);
    expect(result.error).toContain("403");
  });

  test("does not call Google without a distance limit, since there is nothing to filter", async () => {
    const maps = fakeMaps(async () => []);
    const result = await filterByDrivingDistance(maps, origin, candidates, undefined);
    expect(result.candidates).toEqual(candidates);
    expect(maps.calls()).toBe(0);
  });
});
