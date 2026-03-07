import { Hono } from "hono";
import { createTokenRequestForUser, publishNotification } from "../lib/ably";
import { requireAuth, type AuthVariables } from "../lib/middleware";

export const configRoutes = new Hono<{ Variables: AuthVariables }>();

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

/**
 * GET /api/config/ably-token
 * Generate a signed Ably TokenRequest for the authenticated user.
 * The client uses this to connect to Ably without ever seeing the API key.
 * Token is scoped to subscribe on `notifications:<userId>` only.
 */
configRoutes.get("/ably-token", requireAuth, async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "User not found" }, 404);

    try {
        const tokenRequest = await createTokenRequestForUser(user.id);
        return c.json({ success: true, data: tokenRequest });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Failed to create token";
        console.error("[Ably] Token request error:", error);
        return c.json({ success: false, error: msg }, 500);
    }
});

/**
 * POST /api/config/test-notification
 * Send a test notification to yourself. For development/testing only.
 * Remove this in production!
 */
configRoutes.post("/test-notification", requireAuth, async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "User not found" }, 404);

    const types = [
        { type: "connection_request", title: "New Connection Request", body: "Someone wants to connect with you" },
        { type: "connection_accepted", title: "Connection Accepted!", body: "Your connection request was accepted" },
        { type: "memory_shared", title: "New Shared Memory", body: "Someone shared a memory with you" },
        { type: "connection_ended", title: "Connection Ended", body: "A connection was ended" },
    ];

    // Pick a random notification type
    const n = types[Math.floor(Math.random() * types.length)];

    await publishNotification(user.id, {
        type: n.type,
        title: n.title,
        body: n.body,
        data: { test: true },
    });

    return c.json({ success: true, message: `Test notification sent: ${n.type}` });
});
