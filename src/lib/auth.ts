import { PrivyClient } from "@privy-io/server-auth";
import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { db } from "../db";
import { user } from "../db/schema";

const privyAppId = process.env.PRIVY_APP_ID || "";
const privyAppSecret = process.env.PRIVY_APP_SECRET || "";

export const privy = new PrivyClient(privyAppId, privyAppSecret);

type AuthContextData = {
  userId: string;
  walletAddress: string | null;
  privyUserId: string;
};

function createUserName(email: string | null, walletAddress: string | null, privyUserId: string): string {
  if (email) return email.split("@")[0] || "fold-user";
  if (walletAddress) return `user-${walletAddress.slice(2, 8)}`;
  return `user-${privyUserId.slice(-6)}`;
}

export async function verifyPrivyToken(authorizationHeader: string | undefined): Promise<AuthContextData> {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    throw new Error("missing authorization token");
  }

  const token = authorizationHeader.slice(7);
  const claims = await privy.verifyAuthToken(token);
  const privyUserId = claims.userId;

  const privyUser = await privy.getUser(privyUserId);
  const email = privyUser.email?.address || null;
  const walletAddress =
    privyUser.wallet?.address ||
    privyUser.linkedAccounts.find((account) => account.type === "wallet" && "address" in account)?.address ||
    null;

  let existing = await db.select().from(user).where(eq(user.privyUserId, privyUserId)).limit(1);

  if (existing.length === 0 && email) {
    existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
  }

  if (existing.length === 0) {
    const created = await db
      .insert(user)
      .values({
        id: crypto.randomUUID(),
        name: createUserName(email, walletAddress, privyUserId),
        email: email || `${privyUserId}@privy.local`,
        emailVerified: Boolean(email),
        walletAddress,
        privyUserId,
        lastSeen: new Date(),
      })
      .returning();
    existing = created;
  } else {
    const current = existing[0];
    const nextWallet = walletAddress || current.walletAddress;
    await db
      .update(user)
      .set({
        walletAddress: nextWallet,
        privyUserId,
        lastSeen: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(user.id, current.id));
  }

  return {
    userId: existing[0].id,
    walletAddress: walletAddress || existing[0].walletAddress || null,
    privyUserId,
  };
}

export async function verifyPrivyJWT(c: Context, next: Next) {
  try {
    const authData = await verifyPrivyToken(c.req.header("Authorization"));
    c.set("auth", authData);
    const [currentUser] = await db.select().from(user).where(eq(user.id, authData.userId)).limit(1);
    c.set("user", currentUser || null);
    await next();
  } catch {
    return c.json({ success: false, error: "unauthorized" }, 401);
  }
}

export async function verifyAdminWallet(c: Context, next: Next) {
  const expected = process.env.ADMIN_WALLET_ADDRESS || "";
  const provided = c.req.header("x-admin-wallet") || "";

  if (!expected || expected.toLowerCase() !== provided.toLowerCase()) {
    return c.json({ success: false, error: "forbidden" }, 403);
  }

  await next();
}
