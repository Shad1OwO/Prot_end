import type { FetchJson } from "./types";

export interface PoliteFetchOptions {
  /** Wikimedia asks automated clients to identify themselves. */
  userAgent: string;
  /** Pause between requests, so the import never hammers a public API. */
  delayMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const retryable = (status: number) => status === 429 || status >= 500;
/** Wikimedia asks for at least five seconds between retries when it gives no Retry-After. */
const backoffMs = (retry: number) => 5_000 * 2 ** retry;

/**
 * Wikimedia allows 10 requests a minute from clients whose User-Agent carries no contact details, and 200 a minute
 * when it names a site, an email address or a wiki user (2026 limits). Pace just under each.
 */
export function wikimediaDelayMs(userAgent: string | undefined): number {
  return userAgent && /https?:\/\/|@|User:/.test(userAgent) ? 400 : 6_500;
}

/** Runs requests one at a time, retries rate limits and server errors with backoff, and returns parsed JSON. */
export function createPoliteFetch(options: PoliteFetchOptions): FetchJson {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const delayMs = options.delayMs ?? 250;
  const maxRetries = options.maxRetries ?? 4;
  let queue: Promise<unknown> = Promise.resolve();

  async function attempt(url: string, init?: RequestInit): Promise<unknown> {
    for (let retry = 0; ; retry += 1) {
      const headers = new Headers(init?.headers);
      headers.set("user-agent", options.userAgent);
      if (!headers.has("accept")) headers.set("accept", "application/json");
      let response: Response;
      try {
        response = await doFetch(url, { ...init, headers, signal: AbortSignal.timeout(90_000) });
      } catch (error) {
        if (retry >= maxRetries) throw new Error(`Request to ${new URL(url).hostname} failed: ${error instanceof Error ? error.message : String(error)}`);
        await sleep(backoffMs(retry));
        continue;
      }
      if (response.ok) {
        // A busy server can answer 200 with a cut-off body; retrying is cheaper than losing the whole run.
        try {
          return await response.json();
        } catch (error) {
          if (retry >= maxRetries) throw new Error(`Unreadable JSON from ${new URL(url).hostname}: ${error instanceof Error ? error.message : String(error)}`);
          await sleep(backoffMs(retry));
          continue;
        }
      }
      if (!retryable(response.status) || retry >= maxRetries) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : backoffMs(retry));
    }
  }

  return (url, init) => {
    const result = queue.then(async () => {
      if (delayMs > 0) await sleep(delayMs);
      return attempt(url, init);
    });
    queue = result.catch(() => undefined);
    return result;
  };
}
