import { z } from "zod";

export const localeSchema = z.enum(["en", "th"]);
export type Locale = z.infer<typeof localeSchema>;
export const scopeSchema = z.enum(["thailand", "worldwide"]);
export type DestinationScope = z.infer<typeof scopeSchema>;
export const uuidSchema = z.uuid();
export const isoDateSchema = z.iso.date();
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const cursorPageSchema = z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() });
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});
export type Problem = z.infer<typeof problemSchema>;
export const coordinateSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
export type Coordinate = z.infer<typeof coordinateSchema>;
export const transportModeSchema = z.enum(["car", "rail", "transit", "airplane"]);
export type TransportMode = z.infer<typeof transportModeSchema>;
