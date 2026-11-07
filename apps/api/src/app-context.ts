import type { ApiEnvironment } from "@tourism/config";
import type { AppRepository, RecommendationQueue } from "./domain/repositories";
import type { OAuthIdentityProvider, ObjectStorageProvider } from "./domain/providers";
import { MetricsRegistry } from "./observability/metrics";

export interface ApplicationContext {
  env: ApiEnvironment;
  repository: AppRepository;
  queue: RecommendationQueue;
  oauthProviders: Record<"google", OAuthIdentityProvider>;
  objectStorage: ObjectStorageProvider;
  metrics: MetricsRegistry;
  startedAt: number;
  close(): Promise<void>;
}
