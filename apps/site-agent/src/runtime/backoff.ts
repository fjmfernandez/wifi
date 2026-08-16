export class ExponentialBackoff {
  #attempt = 0;

  constructor(
    private readonly baseMs: number,
    private readonly maximumMs: number,
    private readonly random: () => number = Math.random,
  ) {
    if (baseMs <= 0 || maximumMs < baseMs) {
      throw new TypeError("Invalid exponential backoff bounds");
    }
  }

  reset(): void {
    this.#attempt = 0;
  }

  next(): number {
    const exponential = Math.min(this.maximumMs, this.baseMs * 2 ** this.#attempt);
    this.#attempt = Math.min(this.#attempt + 1, 30);
    const jitter = 0.5 + Math.min(1, Math.max(0, this.random())) * 0.5;
    return Math.max(1, Math.floor(exponential * jitter));
  }
}

export async function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(done, milliseconds);
    function done(): void {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}
