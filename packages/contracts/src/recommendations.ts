import { z } from "zod";
import { destinationCardSchema } from "./catalog";
import { coordinateSchema, isoDateSchema, isoDateTimeSchema, localeSchema, scopeSchema, uuidSchema } from "./common";

export const recommendationFiltersSchema = z.object({ categorySlugs: z.array(z.string()).max(10).default([]), travelerTypes: z.array(z.string()).max(10).default([]), startDate: isoDateSchema.optional(), endDate: isoDateSchema.optional(), country: z.string().optional(), province: z.string().optional(), maxDistanceKm: z.number().positive().max(20_000).optional(), origin: coordinateSchema.optional() });
export const recommendationRequestSchema = z.object({ prompt: z.string().trim().min(10).max(1_500), locale: localeSchema, scope: scopeSchema, filters: recommendationFiltersSchema.default({ categorySlugs: [], travelerTypes: [] }) });
export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;
export const rankedRecommendationSchema = z.object({ destinationId: uuidSchema, rank: z.number().int().positive(), reason: z.string().min(1).max(500), score: z.number().min(0).max(1) });
export type RankedRecommendation = z.infer<typeof rankedRecommendationSchema>;
export const aiProviderResponseSchema = z.object({ recommendations: z.array(rankedRecommendationSchema).max(12), clarification: z.string().max(500).nullable().default(null) });
export type AiProviderResponse = z.infer<typeof aiProviderResponseSchema>;
export const recommendationStatusSchema = z.enum(["queued", "filtering", "routing", "ranking", "completed", "failed"]);
export type RecommendationStatus = z.infer<typeof recommendationStatusSchema>;
export const recommendationJobSchema = z.object({ id: uuidSchema, status: recommendationStatusSchema, progress: z.number().int().min(0).max(100), statusMessage: z.string(), createdAt: isoDateTimeSchema, updatedAt: isoDateTimeSchema, error: z.string().nullable() });
export type RecommendationJob = z.infer<typeof recommendationJobSchema>;
export const recommendationResultSchema = z.object({ job: recommendationJobSchema, items: z.array(z.object({ destination: destinationCardSchema, reason: z.string(), score: z.number().min(0).max(1) })), clarification: z.string().nullable(), provider: z.string(), deterministicFallback: z.boolean() });
export type RecommendationResult = z.infer<typeof recommendationResultSchema>;
export const recommendationCreatedSchema = z.object({ job: recommendationJobSchema, statusUrl: z.string(), eventsUrl: z.string() });
