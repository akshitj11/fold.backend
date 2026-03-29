import { serve } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { db } from "./db";
import { share } from "./db/schema";
import { AuthVariables } from "./lib/middleware";
import { openApiSpec } from "./lib/openapi";
import { adminRoutes } from "./routes/admin.routes";
import { apkRoutes } from "./routes/apk.routes";
import { configRoutes } from "./routes/config.routes";
import { connectRoutes } from "./routes/connect.routes";
import { profileRoutes } from "./routes/profile.routes";
import { sharesRoutes } from "./routes/shares.routes";
import { timelineRoutes } from "./routes/timeline.routes";
import { uploadRoutes } from "./routes/upload.routes";
import { userRoutes } from "./routes/user.routes";
import { web3Routes } from "./routes/web3.routes";

const app = new Hono<{ Variables: AuthVariables }>();

app.use("*", logger());
app.use("*", prettyJSON());
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      const allowed = [
        "https://backend.fold.taohq.org",
        "https://link.fold.taohq.org",
        "https://admin.fold.taohq.org",
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:3001",
      ];
      if (origin.startsWith("exp://") || origin.startsWith("fold://")) return origin;
      return allowed.includes(origin) ? origin : null;
    },
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Cookie", "x-admin-wallet", "stripe-signature"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length", "X-Request-Id"],
    maxAge: 86400,
    credentials: false,
  }),
);

app.use("*", async (c, next) => {
  const host = c.req.header("x-forwarded-host")?.split(":")[0] || c.req.header("host")?.split(":")[0];
  if (host !== "link.fold.taohq.org") return next();

  const path = new URL(c.req.url).pathname;
  if (path === "/.well-known/apple-app-site-association") {
    return c.json({
      applinks: {
        details: [{ appIDs: ["TEAM_ID.com.taohq.fold"], components: [{ "/": "/*", comment: "Match all short link paths" }] }],
      },
    });
  }

  if (path === "/.well-known/assetlinks.json") {
    return c.json([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.taohq.fold",
          sha256_cert_fingerprints: ["SHA256_FINGERPRINT_HERE"],
        },
      },
    ]);
  }

  const tokenMatch = path.match(/^\/([a-z0-9]{10})$/);
  if (tokenMatch) {
    const token = tokenMatch[1];
    const shares = await db.select().from(share).where(eq(share.token, token)).limit(1);
    const isValid = shares.length > 0 && shares[0].status === "active";
    const isExpired = shares.length > 0 && shares[0].expiresAt && new Date(shares[0].expiresAt) < new Date();

    let statusMessage = "Someone shared a Fold memory with you";
    if (!isValid && !isExpired) statusMessage = "This link is no longer available";
    if (isExpired) statusMessage = "This link has expired";

    if (isValid && !isExpired) {
      await db.update(share).set({ viewCount: sql`${share.viewCount} + 1` }).where(eq(share.id, shares[0].id));
    }

    return c.html(`<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Fold</title></head><body><h1>${statusMessage}</h1></body></html>`);
  }

  return c.html(`<!DOCTYPE html><html><head><title>Fold</title></head><body><h1>Fold</h1></body></html>`, 404);
});

app.get("/", (c) => {
  return c.json({
    success: true,
    message: "Fold Backend API is running",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (c) => {
  return c.json({ success: true, status: "healthy", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get("/openapi.json", (c) => c.json(openApiSpec));
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

app.route("/api/user", userRoutes);
app.route("/api/upload", uploadRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api/timeline", timelineRoutes);
app.route("/api/shares", sharesRoutes);
app.route("/api/connect", connectRoutes);
app.route("/api/config", configRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/public/apk", apkRoutes);
app.route("/api", web3Routes);

app.notFound((c) => c.json({ success: false, error: "Not Found", message: `Route ${c.req.method} ${c.req.path} not found` }, 404));

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ success: false, error: "Internal Server Error", message: process.env.NODE_ENV === "development" ? err.message : "An unexpected error occurred" }, 500);
});

const port = parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Fold backend running on http://localhost:${info.port}`);
});

export default app;
