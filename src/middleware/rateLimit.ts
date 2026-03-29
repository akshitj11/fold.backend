import type { Context, Next } from "hono";

type WindowState = {
  count: number;
  resetAt: number;
};

const ipRequests = new Map<string, WindowState>();
const userSaves = new Map<string, WindowState>();

function incrementWindow(map: Map<string, WindowState>, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = map.get(key);

  if (!existing || existing.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= limit) return false;
  existing.count += 1;
  map.set(key, existing);
  return true;
}

export async function rateLimitByIp(c: Context, next: Next) {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
  const allowed = incrementWindow(ipRequests, ip, 100, 60_000);
  if (!allowed) {
    return c.json({ error: "rate limit exceeded" }, 429);
  }
  await next();
}

export async function rateLimitMemorySaves(c: Context, next: Next) {
  const auth = c.get("auth") as { userId?: string } | null;
  const userId = auth?.userId;
  if (!userId) {
    return c.json({ error: "rate limit exceeded" }, 429);
  }

  const allowed = incrementWindow(userSaves, userId, 20, 60 * 60 * 1000);
  if (!allowed) {
    return c.json({ error: "rate limit exceeded" }, 429);
  }

  await next();
}
