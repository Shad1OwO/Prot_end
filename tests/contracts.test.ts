import { describe, expect, test } from "bun:test";
import { aiProviderResponseSchema, recommendationRequestSchema, tripCreateSchema } from "../packages/contracts/src";
import { FixedWindowRateLimiter } from "../apps/api/src/security/rate-limit";

const id = "20000000-0000-4000-8000-000000000001";
describe("shared contracts", () => {
  test("rejects reversed trip dates", () => { expect(tripCreateSchema.safeParse({ name: "Trip", startDate: "2026-08-10", endDate: "2026-08-01" }).success).toBe(false); });
  test("bounds recommendation prompt", () => { expect(recommendationRequestSchema.safeParse({ prompt: "short", locale: "en", scope: "thailand", filters: {} }).success).toBe(false); });
  test("requires UUID destination IDs in AI output", () => { expect(aiProviderResponseSchema.safeParse({ recommendations: [{ destinationId: "unknown", rank: 1, reason: "x", score: .5 }], clarification: null }).success).toBe(false); expect(aiProviderResponseSchema.safeParse({ recommendations: [{ destinationId: id, rank: 1, reason: "match", score: .5 }], clarification: null }).success).toBe(true); });
});
describe("rate limiter", () => { test("blocks after fixed-window limit", () => { const limiter = new FixedWindowRateLimiter(2, 60); expect(limiter.consume("ip", 1).allowed).toBe(true); expect(limiter.consume("ip", 2).allowed).toBe(true); expect(limiter.consume("ip", 3).allowed).toBe(false); }); });
