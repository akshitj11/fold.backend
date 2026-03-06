import { Hono } from "hono";
import { requireAuth } from "../lib/middleware";

export const configRoutes = new Hono();

/**
 * GET /api/config/storage
 * Returns Appwrite storage configuration for direct client uploads.
 * Requires authentication.
 */
configRoutes.get("/storage", requireAuth, async (c) => {
    return c.json({
        success: true,
        data: {
            endpoint: process.env.APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1",
            projectId: process.env.APPWRITE_PROJECT_ID || "",
            bucketId: process.env.APPWRITE_BUCKET_ID || "",
        },
    });
});

/**
 * GET /api/config/app
 * Returns app-level configuration values (cooldown period, etc.)
 * Public — no auth required, values are not sensitive.
 */
configRoutes.get("/app", async (c) => {
    const cooldownDays = parseInt(process.env.CONNECT_COOLDOWN_DAYS || "30", 10);
    return c.json({
        success: true,
        data: {
            cooldownDays,
        },
    });
});
