import { z } from "zod";
import { destinationCardSchema } from "./catalog";
import { isoDateSchema, uuidSchema } from "./common";

export const tripDestinationSchema = z.object({ id: uuidSchema, destination: destinationCardSchema, position: z.number().int().nonnegative(), notes: z.string().max(1_000).nullable() });
export type TripDestination = z.infer<typeof tripDestinationSchema>;
export const tripSchema = z.object({ id: uuidSchema, name: z.string().min(1).max(120), startDate: isoDateSchema.nullable(), endDate: isoDateSchema.nullable(), notes: z.string().max(5_000).nullable(), destinations: z.array(tripDestinationSchema), createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }) });
export type Trip = z.infer<typeof tripSchema>;
/** Hard caps that keep one account's trips cheap to list. */
export const tripLimits = { maxTripsPerUser: 50, maxDestinationsPerTrip: 100 } as const;

const tripFields = { name: z.string().trim().min(1).max(120), startDate: isoDateSchema.nullable(), endDate: isoDateSchema.nullable(), notes: z.string().trim().max(5_000).nullable() };
const datesAreOrdered = ({ startDate, endDate }: { startDate?: string | null | undefined; endDate?: string | null | undefined }) => !startDate || !endDate || startDate <= endDate;
const dateOrderIssue = { message: "End date must be on or after start date", path: ["endDate"] };
export const tripCreateSchema = z.object({ name: tripFields.name, startDate: tripFields.startDate.default(null), endDate: tripFields.endDate.default(null), notes: tripFields.notes.default(null) }).refine(datesAreOrdered, dateOrderIssue);
// No defaults here: zod applies defaults inside `.partial()`, which would turn "field omitted" into "clear this field".
export const tripUpdateSchema = z.object(tripFields).partial().refine(datesAreOrdered, dateOrderIssue);
/** Omitting `notes` leaves an existing note alone; `null` clears it. */
export const tripDestinationCreateSchema = z.object({ destinationId: uuidSchema, notes: z.string().trim().max(1_000).nullable().optional() });
export const tripReorderSchema = z.object({ destinationIds: z.array(uuidSchema).min(1).max(tripLimits.maxDestinationsPerTrip) });
