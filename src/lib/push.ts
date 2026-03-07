// =============================================================================
// Expo Push Notification Helper
// =============================================================================
// Uses Expo's Push API directly via fetch — no SDK dependency needed.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushPayload {
    to: string; // Expo push token
    title: string;
    body: string;
    data?: Record<string, any>;
    sound?: "default" | null;
    badge?: number;
}

/**
 * Send a push notification via Expo's Push API.
 * Fire-and-forget — errors are logged but don't propagate.
 */
export async function sendPushNotification(
    pushToken: string,
    title: string,
    body: string,
    data?: Record<string, any>
): Promise<void> {
    // Validate token format (Expo push tokens start with "ExponentPushToken[")
    if (!pushToken.startsWith("ExponentPushToken[") && !pushToken.startsWith("ExpoPushToken[")) {
        console.warn("[Push] Invalid push token format:", pushToken.substring(0, 20));
        return;
    }

    try {
        const payload: PushPayload = {
            to: pushToken,
            title,
            body,
            data,
            sound: "default",
        };

        const response = await fetch(EXPO_PUSH_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`[Push] Expo API error (${response.status}):`, text);
            return;
        }

        const result = await response.json();
        console.log("[Push] Sent successfully:", result);
    } catch (error) {
        console.error("[Push] Failed to send:", error);
    }
}
