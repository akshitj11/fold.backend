import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { pushTokens, user } from "../db/schema";
import { publishNotification } from "../lib/ably";
import { requireAuth, type AuthVariables } from "../lib/middleware";

export const configRoutes = new Hono<{ Variables: AuthVariables }>();

configRoutes.get("/storage", requireAuth, async () => {
  return {
    success: true,
    data: {
      provider: "pinata",
      relay: "/api/upload/ipfs",
    },
  };
});

configRoutes.get("/app", async () => {
  const cooldownDays = parseInt(process.env.CONNECT_COOLDOWN_DAYS || "30", 10);
  return { success: true, data: { cooldownDays } };
});

configRoutes.post("/test-notification", requireAuth, async (c) => {
  const currentUser = c.get("user");
  if (!currentUser) return c.json({ success: false, error: "User not found" }, 404);

  await publishNotification(currentUser.id, {
    type: "memory_shared",
    title: "Test Notification",
    body: "Notifications are working",
    data: { test: true },
  });

  return c.json({ success: true, message: "Test notification sent" });
});

configRoutes.post("/push-token", requireAuth, async (c) => {
  const currentUser = c.get("user");
  if (!currentUser) return c.json({ success: false, error: "User not found" }, 404);

  const body = await c.req.json();
  const token = body.token as string;
  const platform = body.platform as "ios" | "android";

  if (!token || !platform) {
    return c.json({ success: false, error: "token and platform required" }, 400);
  }

  const existing = await db
    .select()
    .from(pushTokens)
    .where(and(eq(pushTokens.userId, currentUser.id), eq(pushTokens.token, token)))
    .limit(1);

  if (existing.length > 0) {
    await db.update(pushTokens).set({ platform, updatedAt: new Date() }).where(eq(pushTokens.id, existing[0].id));
  } else {
    await db.insert(pushTokens).values({ userId: currentUser.id, token, platform });
  }

  await db.update(user).set({ pushToken: token, updatedAt: new Date() }).where(eq(user.id, currentUser.id));

  return c.json({ success: true });
});
