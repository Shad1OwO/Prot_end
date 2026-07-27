interface WindowState {
  count: number;
  resetsAt: number;
}

export class FixedWindowRateLimiter {
  readonly #windows = new Map<string, WindowState>();

  constructor(readonly max: number, readonly windowSeconds: number) {}

  consume(key: string, now = Date.now()): { allowed: boolean; remaining: number; resetSeconds: number } {
    const current = this.#windows.get(key);
    const windowMs = this.windowSeconds * 1_000;
    const state = !current || current.resetsAt <= now ? { count: 0, resetsAt: now + windowMs } : current;
    state.count += 1;
    this.#windows.set(key, state);
    if (this.#windows.size > 10_000) {
      for (const [candidate, value] of this.#windows) if (value.resetsAt <= now) this.#windows.delete(candidate);
    }
    return { allowed: state.count <= this.max, remaining: Math.max(0, this.max - state.count), resetSeconds: Math.max(1, Math.ceil((state.resetsAt - now) / 1_000)) };
  }
}
