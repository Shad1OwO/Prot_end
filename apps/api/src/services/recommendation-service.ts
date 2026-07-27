import type { Locale, RecommendationRequest } from "@tourism/contracts";
import type { AppRepository, RecommendationQueue } from "../domain/repositories";
import { HttpError } from "../http/errors";

export class RecommendationService {
  constructor(readonly repository: AppRepository, readonly queue: RecommendationQueue, readonly apiOrigin: string) {}

  async create(userId: string, input: RecommendationRequest) {
    const job = await this.repository.createJob(userId, input);
    try {
      await this.queue.enqueue(job.id);
    } catch (error) {
      await this.repository.updateJob(job.id, { status: "failed", progress: 100, statusMessage: "Queue unavailable", error: error instanceof Error ? error.message : "Queue unavailable" });
      throw new HttpError(503, "Recommendation Queue Unavailable", "The recommendation job could not be queued. Try again shortly.");
    }
    return {
      job,
      statusUrl: `${this.apiOrigin}/api/v1/recommendations/${job.id}`,
      eventsUrl: `${this.apiOrigin}/api/v1/recommendations/${job.id}/events`,
    };
  }

  async status(userId: string, jobId: string, locale: Locale) {
    const job = await this.repository.getJob(userId, jobId);
    if (!job) throw new HttpError(404, "Recommendation Job Not Found", "The recommendation job does not exist or is not owned by this account.");
    if (job.status === "completed") return (await this.repository.getResult(userId, jobId, locale)) ?? { job, items: [], clarification: null, provider: "unknown", deterministicFallback: false };
    return { job, items: [], clarification: null, provider: "pending", deterministicFallback: false };
  }
}
