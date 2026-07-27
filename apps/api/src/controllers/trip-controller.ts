import { localeSchema, tripCreateSchema, tripDestinationCreateSchema, tripReorderSchema, tripUpdateSchema, uuidSchema } from "@tourism/contracts";
import type { TripService } from "../services/trip-service";
import { parseInput } from "../http/validation";

export class TripController {
  constructor(readonly service: TripService) {}

  list(userId: string, query: unknown) {
    return this.service.list(userId, this.#locale(query));
  }

  get(userId: string, tripId: string, query: unknown) {
    return this.service.get(userId, parseInput(uuidSchema, tripId), this.#locale(query));
  }

  create(userId: string, body: unknown, query: unknown) {
    return this.service.create(userId, parseInput(tripCreateSchema, body), this.#locale(query));
  }

  update(userId: string, tripId: string, body: unknown, query: unknown) {
    return this.service.update(userId, parseInput(uuidSchema, tripId), parseInput(tripUpdateSchema, body), this.#locale(query));
  }

  remove(userId: string, tripId: string) {
    return this.service.remove(userId, parseInput(uuidSchema, tripId));
  }

  addDestination(userId: string, tripId: string, body: unknown, query: unknown) {
    const input = parseInput(tripDestinationCreateSchema, body);
    return this.service.addDestination(userId, parseInput(uuidSchema, tripId), input.destinationId, input.notes, this.#locale(query));
  }

  removeDestination(userId: string, tripId: string, destinationId: string, query: unknown) {
    return this.service.removeDestination(userId, parseInput(uuidSchema, tripId), parseInput(uuidSchema, destinationId), this.#locale(query));
  }

  reorder(userId: string, tripId: string, body: unknown, query: unknown) {
    const input = parseInput(tripReorderSchema, body);
    return this.service.reorder(userId, parseInput(uuidSchema, tripId), input.destinationIds, this.#locale(query));
  }

  #locale(query: unknown) {
    return parseInput(localeSchema, (query as Record<string, unknown>).locale ?? "en");
  }
}
