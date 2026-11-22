interface WindowState {
  count: number;
  resetsAt: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

export class FixedWindowRateLimiter {
  readonly #windows = new Map<string, WindowState>();
  #nextSweepAt = 0;

  /** `maxKeys` bounds memory: beyond it the oldest keys are dropped, whatever their state. */
  constructor(readonly max: number, readonly windowSeconds: number, readonly maxKeys = 50_000) {}

  consume(key: string, now = Date.now()): RateLimitDecision {
    const state = this.#current(key, now) ?? { count: 0, resetsAt: now + this.windowSeconds * 1_000 };
    state.count += 1;
    this.#windows.set(key, state);
    this.#prune(now);
    return this.#decision(state, now);
  }

  /** Reports the state of a key without counting a request against it. */
  peek(key: string, now = Date.now()): RateLimitDecision {
    const state = this.#current(key, now);
    if (!state) return { allowed: true, remaining: this.max, resetSeconds: this.windowSeconds };
    return { ...this.#decision(state, now), allowed: state.count < this.max };
  }

  reset(key: string): void {
    this.#windows.delete(key);
  }

  #current(key: string, now: number): WindowState | undefined {
    const state = this.#windows.get(key);
    return state && state.resetsAt > now ? state : undefined;
  }

  #decision(state: WindowState, now: number): RateLimitDecision {
    return { allowed: state.count <= this.max, remaining: Math.max(0, this.max - state.count), resetSeconds: Math.max(1, Math.ceil((state.resetsAt - now) / 1_000)) };
  }

  #prune(now: number): void {
    if (this.#windows.size <= this.maxKeys) return;
    // Sweeping is O(n), so do it at most once a second however many requests arrive.
    if (now >= this.#nextSweepAt) {
      this.#nextSweepAt = now + 1_000;
      for (const [key, state] of this.#windows) if (state.resetsAt <= now) this.#windows.delete(key);
    }
    for (const key of this.#windows.keys()) {
      if (this.#windows.size <= this.maxKeys) break;
      this.#windows.delete(key);
    }
  }
}
