import { z } from "zod";
import { destinationCardSchema } from "./catalog";
import { isoDateSchema, uuidSchema } from "./common";

export const tripDestinationSchema = z.object({ id: uuidSchema, destination: destinationCardSchema, position: z.number().int().nonnegative(), notes: z.string().max(1_000).nullable() });
export type TripDestination = z.infer<typeof tripDestinationSchema>;
export const tripSchema = z.object({ id: uuidSchema, name: z.string().min(1).max(120), startDate: isoDateSchema.nullable(), endDate: isoDateSchema.nullable(), notes: z.string().max(5_000).nullable(), destinations: z.array(tripDestinationSchema), createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }) });
export type Trip = z.infer<typeof tripSchema>;
const tripWriteSchema = z.object({ name: z.string().trim().min(1).max(120), startDate: isoDateSchema.nullable().default(null), endDate: isoDateSchema.nullable().default(null), notes: z.string().trim().max(5_000).nullable().default(null) });
const datesAreOrdered = ({ startDate, endDate }: { startDate?: string | null | undefined; endDate?: string | null | undefined }) => !startDate || !endDate || startDate <= endDate;
export const tripCreateSchema = tripWriteSchema.refine(datesAreOrdered, { message: "End date must be on or after start date", path: ["endDate"] });
export const tripUpdateSchema = tripWriteSchema.partial().refine(datesAreOrdered, { message: "End date must be on or after start date", path: ["endDate"] });
export const tripDestinationCreateSchema = z.object({ destinationId: uuidSchema, notes: z.string().trim().max(1_000).nullable().default(null) });
export const tripReorderSchema = z.object({ destinationIds: z.array(uuidSchema).min(1).max(500) });
