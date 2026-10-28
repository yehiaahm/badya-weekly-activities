import { tooManyRequests } from './errors.ts';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window, in-memory limiter. Good for a single instance (one Node process, or the one
 * Durable Object that serves the whole app); move the buckets to shared storage before
 * running several instances.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly max: number;
  private readonly windowMs: number;
  private nextSweep = 0;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Counts one hit; returns false once the key is over its limit for the window. */
  hit(key: string, now = Date.now()): boolean {
    this.sweep(now);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    bucket.count++;
    return bucket.count <= this.max;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Drops expired buckets at most once per window, so no timer is needed. */
  private sweep(now: number) {
    if (now < this.nextSweep) return;
    this.nextSweep = now + this.windowMs;
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }
}

/** Throws 429 when `ip` is over the limit for this scope. */
export function enforceLimit(limiter: RateLimiter, scope: string, ip: string): void {
  if (!limiter.hit(`${scope}:${ip}`)) throw tooManyRequests();
}
