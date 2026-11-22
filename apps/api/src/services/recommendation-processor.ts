import { recommendationFailedMessage, type AiProviderResponse } from "@tourism/contracts";
import type { AppRepository } from "../domain/repositories";

const sensitivePattern = /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{7,}\d)/gi;

export class DeterministicRecommendationProcessor {
  constructor(readonly repository: AppRepository, readonly historyRetentionDays = 90) {}

  async process(jobId: string): Promise<void> {
    const stored = await this.repository.getJobRequest(jobId);
    if (!stored) return;
    try {
      await this.repository.updateJob(jobId, { status: "filtering", progress: 20, statusMessage: "Filtering the curated catalog", error: null });
      const candidates = await this.repository.shortlist(stored.request, 12);
      await this.repository.updateJob(jobId, { status: "routing", progress: 55, statusMessage: "Checking destination eligibility", error: null });
      const words = new Set(stored.request.prompt.toLocaleLowerCase(stored.request.locale).split(/\s+/).filter((word) => word.length > 2));
      const ranked = candidates.map((destination) => {
        const haystack = `${destination.name} ${destination.shortDescription} ${destination.categories.map((category) => category.name).join(" ")} ${destination.travelerTypes.join(" ")}`.toLocaleLowerCase(stored.request.locale);
        const matches = [...words].filter((word) => haystack.includes(word)).length;
        const score = Math.min(1, 0.35 + destination.rating / 10 + matches * 0.08 + (destination.featured ? 0.05 : 0));
        return { destination, score };
      }).sort((left, right) => right.score - left.score || right.destination.rating - left.destination.rating).slice(0, 8);
      await this.repository.updateJob(jobId, { status: "ranking", progress: 80, statusMessage: "Ranking the best catalog matches", error: null });
      const response: AiProviderResponse = {
        recommendations: ranked.map(({ destination, score }, index) => ({
          destinationId: destination.id,
          rank: index + 1,
          score,
          reason: stored.request.locale === "th" ? `เหมาะกับคำค้นหาและตัวกรองของคุณ คะแนนรีวิว ${destination.rating.toFixed(1)}` : `Matches your request and selected filters, with a ${destination.rating.toFixed(1)} traveler rating.`,
        })),
        clarification: ranked.length === 0 ? (stored.request.locale === "th" ? "ไม่พบสถานที่ในแค็ตตาล็อกที่ตรงกับตัวกรอง ลองขยายระยะทางหรือหมวดหมู่" : "No catalog destinations matched those filters. Try a wider distance or category.") : null,
      };
      await this.repository.saveResult(jobId, response, "deterministic", true);
      const preferences = await this.repository.getPreferences(stored.userId);
      if (preferences.aiHistoryOptIn) {
        const redactedPrompt = stored.request.prompt.replace(sensitivePattern, "[redacted]");
        await this.repository.storeHistory(stored.userId, jobId, redactedPrompt, new Date(Date.now() + this.historyRetentionDays * 24 * 60 * 60 * 1_000));
      }
      await this.repository.updateJob(jobId, { status: "completed", progress: 100, statusMessage: "Recommendations ready", error: null });
    } catch (error) {
      console.error(JSON.stringify({ level: "error", message: "recommendation_failed", jobId, error: error instanceof Error ? error.message : String(error) }));
      await this.repository.updateJob(jobId, { status: "failed", progress: 100, statusMessage: "Recommendation failed", error: recommendationFailedMessage });
    }
  }
}
