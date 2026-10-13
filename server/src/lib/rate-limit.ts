import type { RequestHandler } from 'express';
import { tooManyRequests } from './errors.ts';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window, in-memory limiter. Good for a single instance; move the
 * buckets to Redis (or similar) before running several server instances.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
    setInterval(() => this.sweep(), windowMs).unref();
  }

  /** Counts one hit; returns false once the key is over its limit for the window. */
  hit(key: string, now = Date.now()): boolean {
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

  private sweep(now = Date.now()) {
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }
}

export function limitByIp(limiter: RateLimiter, scope: string): RequestHandler {
  return (req, _res, next) => {
    if (!limiter.hit(`${scope}:${req.ip}`)) throw tooManyRequests();
    next();
  };
}
