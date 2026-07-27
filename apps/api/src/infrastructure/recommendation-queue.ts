import { Queue } from "bullmq";
import type { RecommendationQueue } from "../domain/repositories";

export class RedisRecommendationQueue implements RecommendationQueue {
  readonly #queue: Queue;

  constructor(redisUrl: string) {
    const parsed = new URL(redisUrl);
    this.#queue = new Queue("recommendations", {
      connection: {
        host: parsed.hostname,
        port: Number(parsed.port || 6379),
        username: parsed.username || undefined,
        password: parsed.password || undefined,
        tls: parsed.protocol === "rediss:" ? {} : undefined,
      },
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1_000 }, removeOnComplete: 100, removeOnFail: 500 },
    });
  }

  async enqueue(jobId: string): Promise<void> {
    await this.#queue.add("recommend", { jobId }, { jobId });
  }

  async close(): Promise<void> {
    await this.#queue.close();
  }
}

export class InlineRecommendationQueue implements RecommendationQueue {
  constructor(readonly process: (jobId: string) => Promise<void>) {}

  async enqueue(jobId: string): Promise<void> {
    queueMicrotask(() => { void this.process(jobId); });
  }

  async close(): Promise<void> {}
}
