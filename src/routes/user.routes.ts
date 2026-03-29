import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { user, userSettings } from "../db/schema";
import { requireAuth, type AuthVariables } from "../lib/middleware";

const userRoutes = new Hono<{ Variables: AuthVariables }>();

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().url().optional().nullable(),
});

const updateSettingsSchema = z.object({
  autoLocation: z.boolean().optional(),
  screenshotProtection: z.boolean().optional(),
});

userRoutes.get("/me", requireAuth, async (c) => {
  const currentUser = c.get("user");
  if (!currentUser) return c.json({ success: false, error: "User not found" }, 404);

  return c.json({
    success: true,
    data: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      avatar: currentUser.image,
      emailVerified: currentUser.emailVerified,
      createdAt: currentUser.createdAt,
      updatedAt: currentUser.updatedAt,
    },
  });
});

userRoutes.patch("/me", requireAuth, async (c) => {
  const currentUser = c.get("user");
  if (!currentUser) return c.json({ success: false, error: "User not found" }, 404);

  const body = await c.req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const updates: { name?: string; image?: string | null; updatedAt: Date } = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.avatar !== undefined) updates.image = parsed.data.avatar;

  const [updatedUser] = await db.update(user).set(updates).where(eq(user.id, currentUser.id)).returning();

  return c.json({
    success: true,
    data: {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      avatar: updatedUser.image,
      emailVerified: updatedUser.emailVerified,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    },
  });
});

userRoutes.delete("/me", requireAuth, async (c) => {
  const currentUser = c.get("user");
  if (!currentUser) return c.json({ success: false, error: "User not found" }, 404);

  await db.delete(user).where(eq(user.id, currentUser.id));
  return c.json({ success: true, message: "Account deleted successfully" });
});

userRoutes.get("/sessions", requireAuth, async () => {
  return { success: true, data: [] };
});

userRoutes.post("/revoke-sessions", requireAuth, async () => {
  return { success: true, message: "Sessions revoked" };
});

userRoutes.post("/change-password", requireAuth, async () => {
  return { success: false, error: "Password flow not supported with Privy" };
});

userRoutes.get("/settings", requireAuth, async (c) => {
  const currentUser = c.get("user");
  if (!currentUser) return c.json({ success: false, error: "User not found" }, 404);

  const existing = await db.select().from(userSettings).where(eq(userSettings.userId, currentUser.id)).limit(1);

  if (existing.length > 0) {
    return c.json({
      success: true,
      data: {
        autoLocation: existing[0].autoLocation,
        screenshotProtection: existing[0].screenshotProtection,
      },
    });
  }

  const [created] = await db.insert(userSettings).values({ userId: currentUser.id }).returning();
  return c.json({ success: true, data: { autoLocation: created.autoLocation, screenshotProtection: created.screenshotProtection } });
});

userRoutes.patch("/settings", requireAuth, async (c) => {
  const currentUser = c.get("user");
  if (!currentUser) return c.json({ success: false, error: "User not found" }, 404);

  const body = await c.req.json();
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const existing = await db.select().from(userSettings).where(eq(userSettings.userId, currentUser.id)).limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(userSettings)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(userSettings.userId, currentUser.id))
      .returning();

    return c.json({ success: true, data: { autoLocation: updated.autoLocation, screenshotProtection: updated.screenshotProtection } });
  }

  const [created] = await db.insert(userSettings).values({ userId: currentUser.id, ...parsed.data }).returning();
  return c.json({ success: true, data: { autoLocation: created.autoLocation, screenshotProtection: created.screenshotProtection } });
});

export { userRoutes };
