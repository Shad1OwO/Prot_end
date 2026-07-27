import { localeSchema, recommendationRequestSchema, uuidSchema } from "@tourism/contracts";
import type { RecommendationService } from "../services/recommendation-service";
import { parseInput } from "../http/validation";

export class RecommendationController {
  constructor(readonly service: RecommendationService) {}

  create(userId: string, body: unknown) {
    return this.service.create(userId, parseInput(recommendationRequestSchema, body));
  }

  status(userId: string, jobId: string, query: unknown) {
    const locale = parseInput(localeSchema, (query as Record<string, unknown>).locale ?? "en");
    return this.service.status(userId, parseInput(uuidSchema, jobId), locale);
  }
}
