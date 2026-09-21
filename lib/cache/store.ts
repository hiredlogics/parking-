import Redis from "ioredis";

/**
 * Shared cache — Redis when REDIS_URL is set, otherwise in-process memory.
 *
 * Used for admin issue graphs, KB catalog, and other read-mostly config so
 * question steps do not re-hit Postgres (or OpenAI) on every answer.
 */

type MemoryEntry = { value: string; expiresAt: number };

const memory = new Map<string, MemoryEntry>();
let redis: Redis | null | undefined;

function redisUrl(): string | null {
  const raw =
    process.env.REDIS_URL?.trim() ||
    process.env.UPSTASH_REDIS_URL?.trim() ||
    "";
  return raw.length > 0 ? raw : null;
}

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = redisUrl();
  if (!url) {
    redis = null;
    return null;
  }
  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 2_000,
    });
    redis.on("error", (err) => {
      console.warn("[cache] redis error:", err.message);
    });
    return redis;
  } catch (err) {
    console.warn("[cache] redis init failed; using memory:", err);
    redis = null;
    return null;
  }
}

export function cacheBackend(): "redis" | "memory" {
  return redisUrl() ? "redis" : "memory";
}

export async function cacheGet(key: string): Promise<string | null> {
  const client = getRedis();
  if (client) {
    try {
      if (client.status !== "ready") await client.connect().catch(() => undefined);
      const v = await client.get(key);
      return v;
    } catch (err) {
      console.warn("[cache] redis get failed:", err);
    }
  }
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const raw = await cacheGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds = 300,
): Promise<void> {
  const client = getRedis();
  if (client) {
    try {
      if (client.status !== "ready") await client.connect().catch(() => undefined);
      await client.set(key, value, "EX", Math.max(1, ttlSeconds));
      return;
    } catch (err) {
      console.warn("[cache] redis set failed:", err);
    }
  }
  memory.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
  });
}

export async function cacheSetJson(
  key: string,
  value: unknown,
  ttlSeconds = 300,
): Promise<void> {
  await cacheSet(key, JSON.stringify(value), ttlSeconds);
}

export async function cacheDel(key: string): Promise<void> {
  memory.delete(key);
  const client = getRedis();
  if (!client) return;
  try {
    if (client.status !== "ready") await client.connect().catch(() => undefined);
    await client.del(key);
  } catch {
    // ignore
  }
}

export async function cacheDelPrefix(prefix: string): Promise<void> {
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  const client = getRedis();
  if (!client) return;
  try {
    if (client.status !== "ready") await client.connect().catch(() => undefined);
    const keys = await client.keys(`${prefix}*`);
    if (keys.length > 0) await client.del(...keys);
  } catch {
    // ignore
  }
}
