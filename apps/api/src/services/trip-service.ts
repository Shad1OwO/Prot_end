import type { Locale, TripCreate, TripUpdate } from "@tourism/contracts";
import type { AppRepository } from "../domain/repositories";
import { HttpError } from "../http/errors";

export class TripService {
  constructor(readonly repository: AppRepository) {}

  list(userId: string, locale: Locale) {
    return this.repository.listTrips(userId, locale);
  }

  async get(userId: string, tripId: string, locale: Locale) {
    return this.#required(await this.repository.getTrip(userId, tripId, locale));
  }

  create(userId: string, input: TripCreate, locale: Locale) {
    return this.repository.createTrip(userId, input, locale);
  }

  async update(userId: string, tripId: string, input: TripUpdate, locale: Locale) {
    return this.#required(await this.repository.updateTrip(userId, tripId, input, locale));
  }

  async remove(userId: string, tripId: string): Promise<void> {
    if (!(await this.repository.deleteTrip(userId, tripId))) throw new HttpError(404, "Trip Not Found", "The requested trip does not exist or is not owned by this account.");
  }

  async addDestination(userId: string, tripId: string, destinationId: string, notes: string | null, locale: Locale) {
    return this.#required(await this.repository.addDestination(userId, tripId, destinationId, notes, locale));
  }

  async removeDestination(userId: string, tripId: string, destinationId: string, locale: Locale) {
    return this.#required(await this.repository.removeDestination(userId, tripId, destinationId, locale));
  }

  async reorder(userId: string, tripId: string, destinationIds: string[], locale: Locale) {
    try {
      return this.#required(await this.repository.reorderDestinations(userId, tripId, destinationIds, locale));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(409, "Invalid Trip Order", error instanceof Error ? error.message : "The destination order is invalid.");
    }
  }

  #required<T>(value: T | null): T {
    if (!value) throw new HttpError(404, "Trip Not Found", "The requested trip does not exist or is not owned by this account.");
    return value;
  }
}
