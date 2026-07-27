interface RouteMetric {
  method: string;
  route: string;
  status: number;
  count: number;
  durationSeconds: number;
}

export class MetricsRegistry {
  readonly #routes = new Map<string, RouteMetric>();
  #queuedRecommendationJobs = 0;

  observe(method: string, route: string, status: number, durationMs: number): void {
    const normalizedRoute = route.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");
    const key = `${method}:${normalizedRoute}:${status}`;
    const metric = this.#routes.get(key) ?? { method, route: normalizedRoute, status, count: 0, durationSeconds: 0 };
    metric.count += 1;
    metric.durationSeconds += durationMs / 1_000;
    this.#routes.set(key, metric);
  }

  setQueuedRecommendationJobs(count: number): void {
    this.#queuedRecommendationJobs = Math.max(0, count);
  }

  render(): string {
    const lines = [
      "# HELP http_requests_total Total HTTP requests.",
      "# TYPE http_requests_total counter",
    ];
    for (const metric of this.#routes.values()) {
      const labels = `method="${metric.method}",route="${metric.route}",status="${metric.status}"`;
      lines.push(`http_requests_total{${labels}} ${metric.count}`);
    }
    lines.push("# HELP http_request_duration_seconds_sum Accumulated HTTP request duration.", "# TYPE http_request_duration_seconds_sum counter");
    for (const metric of this.#routes.values()) {
      const labels = `method="${metric.method}",route="${metric.route}",status="${metric.status}"`;
      lines.push(`http_request_duration_seconds_sum{${labels}} ${metric.durationSeconds}`);
    }
    lines.push("# HELP recommendation_jobs_queued Recommendation jobs awaiting processing.", "# TYPE recommendation_jobs_queued gauge", `recommendation_jobs_queued ${this.#queuedRecommendationJobs}`);
    return `${lines.join("\n")}\n`;
  }
}
