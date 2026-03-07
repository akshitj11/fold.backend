import Ably from "ably";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema";
import { sendPushNotification } from "./push";

// =============================================================================
// Ably Server-Side Client (Singleton)
// =============================================================================

let ablyClient: Ably.Rest | null = null;

/**
 * Get the Ably REST client, creating it lazily on first use.
 * Reads ABLY_API_KEY from env at creation time.
 * If the key is rotated, call resetAblyClient() to pick up the new key.
 */
export function getAblyClient(): Ably.Rest {
    if (!ablyClient) {
        const apiKey = process.env.ABLY_API_KEY;
        if (!apiKey) {
            throw new Error("ABLY_API_KEY is not set in environment variables");
        }
        ablyClient = new Ably.Rest({ key: apiKey });
        console.log("[Ably] REST client initialized");
    }
    return ablyClient;
}

/**
 * Reset the cached client — next call to getAblyClient() will create a new one
 * with the current env value. Useful after key rotation.
 */
export function resetAblyClient(): void {
    ablyClient = null;
    console.log("[Ably] Client reset — will re-init on next use");
}

// =============================================================================
// Token Request (for client auth)
// =============================================================================

/**
 * Create a signed TokenRequest for a specific user.
 * The client uses this to authenticate with Ably without ever seeing the API key.
 *
 * Capabilities are locked to the user's private notification channel (subscribe only).
 */
export async function createTokenRequestForUser(userId: string) {
    const client = getAblyClient();

    const tokenRequest = await client.auth.createTokenRequest({
        clientId: userId,
        capability: {
            [`notifications:${userId}`]: ["subscribe"],
        },
    });

    return tokenRequest;
}

// =============================================================================
// Notification Publisher
// =============================================================================

export interface NotificationPayload {
    type: string;
    title: string;
    body: string;
    data?: Record<string, any>;
}

/**
 * Publish a notification to a user's private channel (Ably in-app)
 * AND send a native push notification via Expo Push API.
 * Fire-and-forget — errors are logged but don't propagate.
 */
export async function publishNotification(
    userId: string,
    notification: NotificationPayload
): Promise<void> {
    // 1. Ably in-app notification
    try {
        const client = getAblyClient();
        const channel = client.channels.get(`notifications:${userId}`);

        await channel.publish("notification", {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ...notification,
            timestamp: new Date().toISOString(),
        });

        console.log(`[Ably] Notification sent to user ${userId}: ${notification.type}`);
    } catch (error) {
        console.error(`[Ably] Failed to publish notification to ${userId}:`, error);
    }

    // 2. Native push notification (Expo Push API)
    try {
        const [targetUser] = await db
            .select({ pushToken: user.pushToken })
            .from(user)
            .where(eq(user.id, userId))
            .limit(1);

        if (targetUser?.pushToken) {
            await sendPushNotification(
                targetUser.pushToken,
                notification.title,
                notification.body,
                { type: notification.type, ...notification.data }
            );
        }
    } catch (error) {
        console.error(`[Push] Failed to send push to ${userId}:`, error);
    }
}
