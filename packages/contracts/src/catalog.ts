import { z } from "zod";
import { coordinateSchema, cursorPageSchema, isoDateSchema, localeSchema, scopeSchema, transportModeSchema, uuidSchema } from "./common";

/** Image hosts the website can render. Must match `images.remotePatterns` in apps/web/next.config.ts. */
export const allowedImageHosts = ["images.unsplash.com", "plus.unsplash.com"] as const;

export const categorySchema = z.object({ id: uuidSchema, slug: z.string().min(1), name: z.string().min(1), icon: z.string().min(1), destinationCount: z.number().int().nonnegative() });
export type Category = z.infer<typeof categorySchema>;
export const destinationImageSchema = z.object({ id: uuidSchema, url: z.url(), alt: z.string().min(1), width: z.number().int().positive(), height: z.number().int().positive(), blurDataUrl: z.string().optional(), isPrimary: z.boolean() });
export const transportOptionSchema = z.object({ mode: transportModeSchema, available: z.boolean(), durationMinutes: z.number().int().positive().nullable(), distanceKm: z.number().nonnegative().nullable(), label: z.string() });
export const destinationCardSchema = z.object({
  id: uuidSchema, slug: z.string().min(1), scope: scopeSchema, name: z.string().min(1), shortDescription: z.string().min(1),
  country: z.string().min(1), province: z.string().nullable(), city: z.string().nullable(), coordinates: coordinateSchema,
  primaryImage: destinationImageSchema, categories: z.array(categorySchema), travelerTypes: z.array(z.string()), rating: z.number().min(0).max(5),
  likesCount: z.number().int().nonnegative(), featured: z.boolean(), trending: z.boolean(), popular: z.boolean(), seasonal: z.boolean(),
  travelTimeMinutes: z.number().int().positive().nullable(), isFavorite: z.boolean(), isLiked: z.boolean(),
});
export type DestinationCard = z.infer<typeof destinationCardSchema>;
export const destinationDetailSchema = destinationCardSchema.extend({ description: z.string().min(1), address: z.string().min(1), images: z.array(destinationImageSchema).min(1), transports: z.array(transportOptionSchema), bestMonths: z.array(z.number().int().min(1).max(12)), openingHours: z.string().nullable(), websiteUrl: z.url().nullable(), metadata: z.record(z.string(), z.string()) });
export type DestinationDetail = z.infer<typeof destinationDetailSchema>;
/** Cursors are opaque to clients: base64 of a row offset. Anything else is rejected rather than guessed at. */
const paginationCursorSchema = z.string().max(24).refine((value) => {
  try {
    return /^\d{1,15}$/.test(atob(value));
  } catch {
    return false;
  }
}, { message: "Invalid pagination cursor" });
export const destinationQuerySchema = z.object({ locale: localeSchema.default("en"), scope: scopeSchema.default("thailand"), query: z.string().trim().max(120).optional(), category: z.string().trim().optional(), travelerType: z.string().trim().optional(), startDate: isoDateSchema.optional(), endDate: isoDateSchema.optional(), country: z.string().trim().optional(), province: z.string().trim().optional(), city: z.string().trim().optional(), originLat: z.coerce.number().min(-90).max(90).optional(), originLng: z.coerce.number().min(-180).max(180).optional(), maxDistanceKm: z.coerce.number().positive().max(20_000).optional(), sort: z.enum(["featured", "rating", "popular", "distance"]).default("featured"), cursor: paginationCursorSchema.optional(), limit: z.coerce.number().int().min(1).max(50).default(12) });
export type DestinationQuery = z.infer<typeof destinationQuerySchema>;
export const destinationListResponseSchema = z.object({ items: z.array(destinationCardSchema), page: cursorPageSchema });
export type DestinationListResponse = z.infer<typeof destinationListResponseSchema>;
export const homeSectionsSchema = z.object({ featured: z.array(destinationCardSchema), trending: z.array(destinationCardSchema), popular: z.array(destinationCardSchema), seasonal: z.array(destinationCardSchema), personalized: z.array(destinationCardSchema) });
export type HomeSections = z.infer<typeof homeSectionsSchema>;
const catalogImageUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && (allowedImageHosts as readonly string[]).includes(url.hostname);
}, { message: `Image URLs must be HTTPS and hosted on: ${allowedImageHosts.join(", ")}` });
export const catalogImportSchema = z.object({ destinations: z.array(z.object({ slug: z.string().min(1), scope: scopeSchema, translations: z.record(localeSchema, z.object({ name: z.string().min(1), shortDescription: z.string().min(1), description: z.string().min(1) })), coordinates: coordinateSchema, categorySlugs: z.array(z.string()).min(1).max(20), imageUrls: z.array(catalogImageUrlSchema).min(1).max(20) })).min(1).max(500) });
export const mediaUploadRequestSchema = z.object({ fileName: z.string().min(1).max(200), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), sizeBytes: z.number().int().positive().max(15 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
