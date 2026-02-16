/**
 * Rate Limiter Middleware
 *
 * Redis-backed sliding window rate limiter.
 * Falls back to permissive mode if Redis is unavailable.
 */

import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './apiKeyAuth.js';
import type { RedisManager } from '../../utils/RedisManager.js';
import { REDIS_TTL } from '../../utils/RedisManager.js';
import { LogManager } from '../../utils/LogManager.js';

const logger = LogManager.getInstance();

export interface RateLimiterOptions {
  /** Default max requests per window (overridden by per-key limit) */
  defaultMaxRequests?: number;
  /** Window size in seconds */
  windowSeconds?: number;
  /** Also rate limit by IP? */
  enableIpRateLimit?: boolean;
  /** Max requests per IP per window */
  ipMaxRequests?: number;
}

/**
 * Create rate limiting middleware.
 * Uses per-user rate limit from API key, with optional per-IP limiting.
 */
export function createRateLimiterMiddleware(
  redis: RedisManager | null,
  options: RateLimiterOptions = {},
) {
  const {
    defaultMaxRequests = 60,
    windowSeconds = REDIS_TTL.RATE_LIMIT,
    enableIpRateLimit = true,
    ipMaxRequests = 120,
  } = options;

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    // Skip if no Redis (graceful degradation)
    if (!redis) {
      next();
      return;
    }

    try {
      // Per-user rate limit
      if (req.auth?.userId) {
        const maxReqs = req.auth.rateLimit || defaultMaxRequests;
        const result = await redis.checkRateLimit(
          `user:${req.auth.userId}`,
          maxReqs,
          windowSeconds,
        );

        res.setHeader('X-RateLimit-Limit', maxReqs);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', result.resetIn);

        if (!result.allowed) {
          res.status(429).json({
            error: 'Rate limit exceeded',
            retryAfter: result.resetIn,
          });
          return;
        }
      }

      // Per-IP rate limit
      if (enableIpRateLimit) {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const result = await redis.checkRateLimit(
          `ip:${ip}`,
          ipMaxRequests,
          windowSeconds,
        );

        if (!result.allowed) {
          res.status(429).json({
            error: 'Rate limit exceeded',
            retryAfter: result.resetIn,
          });
          return;
        }
      }

      next();
    } catch (err) {
      // Graceful degradation: allow request if Redis fails
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('RateLimiter', `Rate limit check failed, allowing request: ${message}`);
      next();
    }
  };
}
