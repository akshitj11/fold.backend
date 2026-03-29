import type { Context, Next } from "hono";
import { verifyPrivyJWT } from "./auth";

export type AuthVariables = {
  auth: {
    userId: string;
    walletAddress: string | null;
    privyUserId: string;
  } | null;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    pushToken: string | null;
    walletAddress: string | null;
    privyUserId: string | null;
    ceramicDid: string | null;
    lastSeen: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

export async function authMiddleware(c: Context, next: Next) {
  await verifyPrivyJWT(c, next);
}

export async function requireAuth(c: Context, next: Next) {
  const maybeResponse = await verifyPrivyJWT(c, async () => undefined);
  if (maybeResponse) return maybeResponse;
  await next();
}
