import { and, count, eq, sql } from "drizzle-orm";
import type { Context, Next } from "hono";
import { db } from "../db";
import { memories, subscriptions } from "../db/schema";

const FREE_MEMORY_LIMIT = 1000;
const FREE_STORAGE_LIMIT_MB = 500;

export async function quotaMiddleware(c: Context, next: Next) {
  const auth = c.get("auth") as { userId?: string } | null;
  const userId = auth?.userId;

  if (!userId) {
    return c.json({ success: false, error: "unauthorized" }, 401);
  }

  const activeSub = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .limit(1);

  if (activeSub.length > 0) {
    await next();
    return;
  }

  const [memoryCountRow] = await db
    .select({ total: count() })
    .from(memories)
    .where(eq(memories.userId, userId));

  if ((memoryCountRow?.total || 0) >= FREE_MEMORY_LIMIT) {
    return c.json({ success: false, error: "quota exceeded" }, 403);
  }

  const [storageEstimate] = await db
    .select({ totalMb: sql<number>`COALESCE(SUM(LENGTH(${memories.ipfsCid})) / 1024.0 / 1024.0, 0)` })
    .from(memories)
    .where(eq(memories.userId, userId));

  if ((storageEstimate?.totalMb || 0) >= FREE_STORAGE_LIMIT_MB) {
    return c.json({ success: false, error: "quota exceeded" }, 403);
  }

  await next();
}
