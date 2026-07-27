import { z } from "zod";
import { catalogImportSchema } from "./catalog";
import { tripCreateSchema, tripUpdateSchema } from "./trips";

export type CatalogImport = z.input<typeof catalogImportSchema>;
export type TripCreate = z.input<typeof tripCreateSchema>;
export type TripUpdate = z.input<typeof tripUpdateSchema>;
