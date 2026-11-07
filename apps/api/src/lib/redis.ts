import { Redis } from "@upstash/redis";

/**
 * Upstash Redis (REST) client, from UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 * `null` when those aren't set (e.g. local development), so callers can fall back gracefully:
 *
 *   if (redis) await redis.set("key", "value", { ex: 60 });
 */
export const redis: Redis | null =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? Redis.fromEnv() : null;
