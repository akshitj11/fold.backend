import { and, count, desc, eq, isNull, like, sql } from "drizzle-orm";
import { Hono } from "hono";
import Stripe from "stripe";
import { createPublicClient, http } from "viem";
import { polygonAmoy } from "viem/chains";
import { db } from "../db";
import { gasLog, memories, pushTokens, sharedMemories, subscriptions, user } from "../db/schema";
import { publishNotification } from "../lib/ably";
import { PaymasterABI, PremiumSBTABI } from "../lib/abis";
import { verifyAdminWallet, verifyPrivyJWT } from "../lib/auth";
import { quotaMiddleware } from "../middleware/quota";
import { rateLimitByIp, rateLimitMemorySaves } from "../middleware/rateLimit";

const web3Routes = new Hono();

const publicClient = createPublicClient({
  chain: polygonAmoy,
  transport: http(process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology"),
});

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" })
  : null;

function authFrom(c: any) {
  return c.get("auth") as { userId: string; walletAddress: string | null; privyUserId: string };
}

async function pinataUpload(name: string, content: Buffer | string, mimeType: string) {
  const formData = new FormData();
  const blob = new Blob([content], { type: mimeType });
  formData.append("file", blob, name);

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PINATA_JWT || ""}` },
    body: formData,
  });

  if (!response.ok) throw new Error(`pinata upload failed: ${await response.text()}`);
  const json = await response.json();
  return json.IpfsHash as string;
}

async function pinataUnpin(cid: string) {
  if (!cid) return;
  await fetch(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${process.env.PINATA_JWT || ""}` },
  });
}

web3Routes.use("*", rateLimitByIp);

web3Routes.post("/auth/verify", verifyPrivyJWT, async (c) => {
  const auth = authFrom(c);
  await db.update(user).set({ lastSeen: new Date(), updatedAt: new Date() }).where(eq(user.id, auth.userId));
  return c.json({ userId: auth.userId, walletAddress: auth.walletAddress });
});

web3Routes.post("/auth/wallet-link", verifyPrivyJWT, async (c) => {
  const auth = authFrom(c);
  const body = await c.req.json();
  const walletAddress = body.walletAddress as string;
  if (!walletAddress) return c.json({ success: false, error: "walletAddress required" }, 400);
  await db.update(user).set({ walletAddress, updatedAt: new Date() }).where(eq(user.id, auth.userId));
  return c.json({ success: true });
});

web3Routes.post("/upload/ipfs", verifyPrivyJWT, quotaMiddleware, rateLimitMemorySaves, async (c) => {
  const body = await c.req.json();
  const blobBase64 = body.blob as string;
  if (!blobBase64) return c.json({ success: false, error: "blob is required" }, 400);
  const cid = await pinataUpload("memory.bin", Buffer.from(blobBase64, "base64"), "application/octet-stream");
  return c.json({ cid });
});

web3Routes.post("/upload/manifest", verifyPrivyJWT, async (c) => {
  const body = await c.req.json();
  const cid = await pinataUpload("manifest.json", JSON.stringify(body), "application/json");
  return c.json({ cid });
});

web3Routes.post("/memories", verifyPrivyJWT, quotaMiddleware, rateLimitMemorySaves, async (c) => {
  const auth = authFrom(c);
  const body = await c.req.json();
  const [created] = await db
    .insert(memories)
    .values({
      userId: auth.userId,
      ipfsCid: body.cid,
      manifestCid: body.manifestCid || null,
      memoryType: body.memoryType || "text",
      ceramicStream: body.ceramicStream || null,
    })
    .returning();
  return c.json({ memoryId: created.id });
});
web3Routes.get("/memories", verifyPrivyJWT, async (c) => {
  const auth = authFrom(c);
  const rows = await db
    .select({
      id: memories.id,
      ipfs_cid: memories.ipfsCid,
      manifest_cid: memories.manifestCid,
      memory_type: memories.memoryType,
      created_at: memories.createdAt,
      synced_at: memories.syncedAt,
    })
    .from(memories)
    .where(eq(memories.userId, auth.userId))
    .orderBy(desc(memories.createdAt));
  return c.json(rows);
});

web3Routes.delete("/memories/:id", verifyPrivyJWT, async (c) => {
  const auth = authFrom(c);
  const memoryId = c.req.param("id");
  const [row] = await db
    .select()
    .from(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.userId, auth.userId)))
    .limit(1);
  if (!row) return c.json({ success: false, error: "not found" }, 404);
  await pinataUnpin(row.ipfsCid);
  await db.delete(memories).where(eq(memories.id, memoryId));
  return c.json({ success: true });
});

web3Routes.post("/blockchain/record", verifyPrivyJWT, async (c) => {
  const auth = authFrom(c);
  const body = await c.req.json();
  const cid = body.cid as string;
  if (!cid) return c.json({ success: false, error: "cid required" }, 400);

  const txHash = `0x${crypto.randomUUID().replace(/-/g, "")}`;

  const [latest] = await db
    .select()
    .from(memories)
    .where(and(eq(memories.userId, auth.userId), eq(memories.ipfsCid, cid)))
    .orderBy(desc(memories.createdAt))
    .limit(1);

  if (latest) {
    await db.update(memories).set({ txHash, syncedAt: new Date() }).where(eq(memories.id, latest.id));
  }

  await db.insert(gasLog).values({ userId: auth.userId, txHash, gasUsed: 0, gasCostMatic: 0 });
  return c.json({ txHash });
});

web3Routes.get("/blockchain/status/:tx", async (c) => {
  const tx = c.req.param("tx") as `0x${string}`;
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: tx });
    return c.json({ status: receipt.status === "success" ? "confirmed" : "failed", blockNumber: Number(receipt.blockNumber) });
  } catch {
    return c.json({ status: "pending", blockNumber: null });
  }
});

web3Routes.post("/share/memory", verifyPrivyJWT, async (c) => {
  const auth = authFrom(c);
  const body = await c.req.json();
  const memoryId = body.memoryId as string;
  const recipientUserId = body.recipientUserId as string;
  const recipientKeyPacket = body.recipientKeyPacket as string;

  const [owned] = await db
    .select()
    .from(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.userId, auth.userId)))
    .limit(1);
  if (!owned) return c.json({ success: false, error: "memory not found" }, 404);

  const recipientKeyCid = await pinataUpload("recipient-key.bin", Buffer.from(recipientKeyPacket || "", "base64"), "application/octet-stream");

  const [created] = await db
    .insert(sharedMemories)
    .values({ memoryId, ownerId: auth.userId, recipientId: recipientUserId, recipientKeyCid })
    .returning();

  await publishNotification(recipientUserId, {
    type: "memory_shared",
    title: "A memory was shared with you",
    body: "A memory was shared with you",
  });

  return c.json({ shareId: created.id });
});
web3Routes.get("/share/received", verifyPrivyJWT, async (c) => {
  const auth = authFrom(c);
  const rows = await db
    .select({
      id: sharedMemories.id,
      memoryId: sharedMemories.memoryId,
      recipientKeyCid: sharedMemories.recipientKeyCid,
      createdAt: sharedMemories.createdAt,
      ipfsCid: memories.ipfsCid,
      manifestCid: memories.manifestCid,
      memoryType: memories.memoryType,
      ownerId: sharedMemories.ownerId,
    })
    .from(sharedMemories)
    .innerJoin(memories, eq(memories.id, sharedMemories.memoryId))
    .where(and(eq(sharedMemories.recipientId, auth.userId), isNull(sharedMemories.revokedAt)))
    .orderBy(desc(sharedMemories.createdAt));
  return c.json(rows);
});

web3Routes.delete("/share/:id", verifyPrivyJWT, async (c) => {
  const auth = authFrom(c);
  const shareId = c.req.param("id");
  const [row] = await db
    .select()
    .from(sharedMemories)
    .where(and(eq(sharedMemories.id, shareId), eq(sharedMemories.ownerId, auth.userId)))
    .limit(1);
  if (!row) return c.json({ success: false, error: "share not found" }, 404);
  await db.update(sharedMemories).set({ revokedAt: new Date() }).where(eq(sharedMemories.id, shareId));
  await pinataUnpin(row.recipientKeyCid);
  return c.json({ success: true });
});

web3Routes.post("/subscription/checkout", verifyPrivyJWT, async (c) => {
  if (!stripe) return c.json({ success: false, error: "stripe not configured" }, 500);
  const auth = authFrom(c);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PREMIUM_PRICE_ID || "", quantity: 1 }],
    success_url: "fold://subscription/success",
    cancel_url: "fold://subscription/cancel",
    metadata: { userId: auth.userId },
  });
  return c.json({ url: session.url });
});

web3Routes.post("/subscription/webhook", async (c) => {
  if (!stripe) return c.json({ received: true });
  const bodyText = await c.req.text();
  const signature = c.req.header("stripe-signature") || "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(bodyText, signature, process.env.STRIPE_WEBHOOK_SECRET || "");
  } catch {
    return c.json({ success: false, error: "invalid signature" }, 400);
  }

  queueMicrotask(async () => {
    if (event.type === "customer.subscription.created") {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (!userId) return;

      await db
        .insert(subscriptions)
        .values({
          userId,
          stripeSubId: sub.id,
          status: "active",
          sbtMinted: true,
          expiresAt: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
        })
        .onConflictDoUpdate({
          target: subscriptions.stripeSubId,
          set: {
            status: "active",
            sbtMinted: true,
            expiresAt: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
          },
        });
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      await db.update(subscriptions).set({ status: "cancelled", sbtMinted: false }).where(eq(subscriptions.stripeSubId, sub.id));
    }
  });

  return c.json({ received: true });
});
web3Routes.get("/subscription/status", verifyPrivyJWT, async (c) => {
  const auth = authFrom(c);
  const [u] = await db.select().from(user).where(eq(user.id, auth.userId)).limit(1);
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, auth.userId), eq(subscriptions.status, "active")))
    .limit(1);

  let isPremium = Boolean(sub?.sbtMinted);

  if (u?.walletAddress && process.env.PREMIUM_SBT_ADDRESS) {
    try {
      const onChain = await publicClient.readContract({
        address: process.env.PREMIUM_SBT_ADDRESS as `0x${string}`,
        abi: PremiumSBTABI,
        functionName: "isPremium",
        args: [u.walletAddress as `0x${string}`],
      });
      isPremium = Boolean(onChain);
    } catch {
      isPremium = Boolean(sub?.sbtMinted);
    }
  }

  return c.json({ isPremium, expiresAt: sub?.expiresAt || null, status: sub?.status || "cancelled" });
});

web3Routes.post("/config/push-token", verifyPrivyJWT, async (c) => {
  const auth = authFrom(c);
  const body = await c.req.json();
  const token = body.token as string;
  const platform = body.platform as "ios" | "android";

  if (!token || !platform) return c.json({ success: false, error: "token and platform required" }, 400);

  const existing = await db
    .select()
    .from(pushTokens)
    .where(and(eq(pushTokens.userId, auth.userId), eq(pushTokens.token, token)))
    .limit(1);

  if (existing.length > 0) {
    await db.update(pushTokens).set({ platform, updatedAt: new Date() }).where(eq(pushTokens.id, existing[0].id));
  } else {
    await db.insert(pushTokens).values({ userId: auth.userId, token, platform });
  }

  await db.update(user).set({ pushToken: token, updatedAt: new Date() }).where(eq(user.id, auth.userId));

  return c.json({ success: true });
});

web3Routes.get("/admin/metrics", verifyAdminWallet, async (c) => {
  const [totalUsersRow] = await db.select({ total: count() }).from(user);
  const [totalMemoriesRow] = await db.select({ total: count() }).from(memories);
  const [activeSubsRow] = await db.select({ total: count() }).from(subscriptions).where(eq(subscriptions.status, "active"));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [gasSpentRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${gasLog.gasCostMatic}), 0)` })
    .from(gasLog)
    .where(sql`${gasLog.createdAt} >= ${today}`);

  let paymasterBalance = 0;
  if (process.env.PAYMASTER_ADDRESS) {
    try {
      const deposit = await publicClient.readContract({
        address: process.env.PAYMASTER_ADDRESS as `0x${string}`,
        abi: PaymasterABI,
        functionName: "getDeposit",
      });
      paymasterBalance = Number(deposit) / 1e18;
    } catch {
      paymasterBalance = 0;
    }
  }

  return c.json({
    totalUsers: totalUsersRow?.total || 0,
    totalMemories: totalMemoriesRow?.total || 0,
    activeSubscriptions: activeSubsRow?.total || 0,
    paymasterBalance,
    gasSpentToday: gasSpentRow?.total || 0,
  });
});

web3Routes.get("/admin/users", verifyAdminWallet, async (c) => {
  const search = c.req.query("search") || "";
  const plan = c.req.query("plan") || "all";

  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      walletAddress: user.walletAddress,
      createdAt: user.createdAt,
      memoryCount: sql<number>`COUNT(${memories.id})`,
      sbtMinted: sql<boolean>`COALESCE(MAX(${subscriptions.sbtMinted}), false)`,
      subscriptionStatus: sql<string>`COALESCE(MAX(${subscriptions.status}), none)`,
    })
    .from(user)
    .leftJoin(memories, eq(memories.userId, user.id))
    .leftJoin(subscriptions, eq(subscriptions.userId, user.id))
    .where(search ? like(user.email, `%${search}%`) : undefined)
    .groupBy(user.id);

  const filtered = rows.filter((row) => {
    if (plan === "premium") return row.sbtMinted;
    if (plan === "free") return !row.sbtMinted;
    return true;
  });

  return c.json(filtered);
});

export { web3Routes };
