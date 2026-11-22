import { tripLimits, type Locale, type TripCreate, type TripUpdate } from "@tourism/contracts";
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

  async create(userId: string, input: TripCreate, locale: Locale) {
    if ((await this.repository.countTrips(userId)) >= tripLimits.maxTripsPerUser) {
      throw new HttpError(409, "Trip Limit Reached", `An account can hold at most ${tripLimits.maxTripsPerUser} trips. Delete one to create another.`);
    }
    return this.repository.createTrip(userId, input, locale);
  }

  async update(userId: string, tripId: string, input: TripUpdate, locale: Locale) {
    // The contract only sees the fields being changed, so a single new date has to be checked against the stored one.
    if (input.startDate !== undefined || input.endDate !== undefined) {
      const current = this.#required(await this.repository.getTrip(userId, tripId, locale));
      const startDate = input.startDate === undefined ? current.startDate : input.startDate;
      const endDate = input.endDate === undefined ? current.endDate : input.endDate;
      if (startDate && endDate && startDate > endDate) throw new HttpError(422, "Validation Failed", "The request did not satisfy the API contract.", { endDate: ["End date must be on or after start date"] });
    }
    return this.#required(await this.repository.updateTrip(userId, tripId, input, locale));
  }

  async remove(userId: string, tripId: string): Promise<void> {
    if (!(await this.repository.deleteTrip(userId, tripId))) throw new HttpError(404, "Trip Not Found", "The requested trip does not exist or is not owned by this account.");
  }

  async addDestination(userId: string, tripId: string, destinationId: string, notes: string | null | undefined, locale: Locale) {
    const trip = this.#required(await this.repository.getTrip(userId, tripId, locale));
    const alreadyIncluded = trip.destinations.some((item) => item.destination.id === destinationId);
    if (!alreadyIncluded && trip.destinations.length >= tripLimits.maxDestinationsPerTrip) {
      throw new HttpError(409, "Trip Is Full", `A trip can hold at most ${tripLimits.maxDestinationsPerTrip} destinations.`);
    }
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
