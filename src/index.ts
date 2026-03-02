import { serve } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { auth } from "./lib/auth";
import { authMiddleware, AuthVariables } from "./lib/middleware";
import { openApiSpec } from "./lib/openapi";
import { configRoutes } from "./routes/config.routes";
import { profileRoutes } from "./routes/profile.routes";
import { sharesRoutes } from "./routes/shares.routes";
import { timelineRoutes } from "./routes/timeline.routes";
import { uploadRoutes } from "./routes/upload.routes";
import { userRoutes } from "./routes/user.routes";

// Create Hono app with typed variables
const app = new Hono<{ Variables: AuthVariables }>();

// =============================================================================
// Global Middleware
// =============================================================================

// Request logging
app.use("*", logger());

// Pretty JSON responses in development
app.use("*", prettyJSON());

// CORS configuration - Allow all origins
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow requests with no origin (React Native / mobile apps)
      if (!origin) return "*";

      // Allow specific origins
      const allowed = [
        "https://backend.fold.taohq.org",
        "http://localhost:3000",
        "http://localhost:8081",
      ];

      // Allow Expo and app deep links
      if (origin.startsWith("exp://") || origin.startsWith("fold://")) {
        return origin;
      }

      return allowed.includes(origin) ? origin : null;
    },
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Cookie"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length", "X-Request-Id", "Set-Cookie"],
    maxAge: 86400,
    credentials: true, // Required for cookies/sessions
  })
);

// Auth middleware - attaches user/session to context
app.use("*", authMiddleware);

// =============================================================================
// Routes
// =============================================================================

// Health check
app.get("/", (c) => {
  return c.json({
    success: true,
    message: "Fold Backend API is running",
    version: "1.0.37",
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    success: true,
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// API Documentation
// =============================================================================

// OpenAPI JSON spec
app.get("/openapi.json", (c) => {
  return c.json(openApiSpec);
});

// Swagger UI
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

// Simple test login page for OAuth testing in browser
app.get("/test-login", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Test Login</title>
      <style>
        body { font-family: system-ui; max-width: 400px; margin: 50px auto; padding: 20px; }
        button { width: 100%; padding: 15px; margin: 10px 0; font-size: 16px; cursor: pointer; border-radius: 8px; }
        .google { background: #4285F4; color: white; border: none; }
        .email { background: #6366F1; color: white; border: none; }
        input { width: 100%; padding: 12px; margin: 5px 0; box-sizing: border-box; border-radius: 4px; border: 1px solid #ccc; }
        #result { padding: 15px; margin-top: 20px; border-radius: 8px; background: #f0f0f0; white-space: pre-wrap; }
      </style>
    </head>
    <body>
      <h2>🧪 Auth Test Page</h2>

      <h3>Google OAuth</h3>
      <button class="google" onclick="googleSignIn()">Sign in with Google</button>

      <h3>Email/Password</h3>
      <input type="email" id="email" placeholder="Email" value="test@example.com" />
      <input type="password" id="password" placeholder="Password" value="password123" />
      <input type="text" id="name" placeholder="Name (for signup)" value="Test User" />
      <button class="email" onclick="signUp()">Sign Up</button>
      <button class="email" onclick="signIn()">Sign In</button>

      <h3>Session</h3>
      <button onclick="getSession()">Get Session</button>
      <button onclick="signOut()">Sign Out</button>

      <div id="result">Results will appear here...</div>

      <script>
        async function signUp() {
          const res = await fetch('/api/auth/sign-up/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: document.getElementById('email').value,
              password: document.getElementById('password').value,
              name: document.getElementById('name').value,
            }),
            credentials: 'include',
          });
          document.getElementById('result').textContent = JSON.stringify(await res.json(), null, 2);
        }

        async function signIn() {
          const res = await fetch('/api/auth/sign-in/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: document.getElementById('email').value,
              password: document.getElementById('password').value,
            }),
            credentials: 'include',
          });
          document.getElementById('result').textContent = JSON.stringify(await res.json(), null, 2);
        }

        async function getSession() {
          const res = await fetch('/api/auth/session', { credentials: 'include' });
          document.getElementById('result').textContent = JSON.stringify(await res.json(), null, 2);
        }

        async function signOut() {
          const res = await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
          document.getElementById('result').textContent = 'Signed out!';
        }

        async function googleSignIn() {
          document.getElementById('result').textContent = 'Redirecting to Google...';
          const res = await fetch('/api/auth/sign-in/social', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: 'google',
              callbackURL: 'http://localhost:3000/test-login',
            }),
            credentials: 'include',
          });
          const data = await res.json();
          if (data.url) {
            window.location.href = data.url;
          } else {
            document.getElementById('result').textContent = JSON.stringify(data, null, 2);
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Helper function to add expo-origin as origin header for Better Auth
function withExpoOrigin(request: Request): Request {
  const origin = request.headers.get("origin");
  const expoOrigin = request.headers.get("expo-origin");

  console.log("[AUTH DEBUG] ====================================");
  console.log("[AUTH DEBUG] Incoming auth request:");
  console.log("[AUTH DEBUG]   URL:", request.url);
  console.log("[AUTH DEBUG]   Method:", request.method);
  console.log("[AUTH DEBUG]   origin header:", origin);
  console.log("[AUTH DEBUG]   expo-origin header:", expoOrigin);

  if (!expoOrigin) {
    console.log("[AUTH DEBUG] No expo-origin, using request as-is");
    console.log("[AUTH DEBUG] ====================================");
    return request;
  }

  const newHeaders = new Headers(request.headers);
  newHeaders.set("origin", expoOrigin);

  console.log("[AUTH DEBUG] Mapped expo-origin to origin:", expoOrigin);
  console.log("[AUTH DEBUG] ====================================");

  return new Request(request, { headers: newHeaders });
}

// Better Auth routes - handles all auth endpoints
// POST/GET /api/auth/* - sign-up, sign-in, sign-out, oauth, etc.
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  console.log("[AUTH DEBUG] Auth route matched:", c.req.method, c.req.path);
  return auth.handler(withExpoOrigin(c.req.raw));
});

// User management routes
app.route("/api/user", userRoutes);

// File upload routes
app.route("/api/upload", uploadRoutes);

// Profile routes
app.route("/api/profile", profileRoutes);

// Timeline routes
app.route("/api/timeline", timelineRoutes);

// Shares routes
app.route("/api/shares", sharesRoutes);

// Config routes (serves Appwrite config to client)
app.route("/api/config", configRoutes);

// =============================================================================
// Error Handling
// =============================================================================

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: "Not Found",
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404
  );
});

// Global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      success: false,
      error: "Internal Server Error",
      message:
        process.env.NODE_ENV === "development"
          ? err.message
          : "An unexpected error occurred",
    },
    500
  );
});

// =============================================================================
// Server
// =============================================================================

const port = parseInt(process.env.PORT || "3000", 10);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    FOLD BACKEND API                       ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${info.port}         ║
║  Environment: ${(process.env.NODE_ENV)}                   ║
╠═══════════════════════════════════════════════════════════╣
║  Auth Endpoints:                                          ║
║    POST /api/auth/sign-up/email     - Email registration  ║
║    POST /api/auth/sign-in/email     - Email login         ║
║    GET  /api/auth/sign-in/google    - Google OAuth        ║
║    POST /api/auth/sign-out          - Logout              ║
║    POST /api/auth/forgot-password   - Password reset      ║
║    POST /api/auth/reset-password    - Reset password      ║
║    GET  /api/auth/session           - Get session         ║
╠═══════════════════════════════════════════════════════════╣
║  User Endpoints:                                          ║
║    GET    /api/user/me              - Get profile         ║
║    PATCH  /api/user/me              - Update profile      ║
║    DELETE /api/user/me              - Delete account      ║
║    POST   /api/user/change-password - Change password     ║
║    GET    /api/user/sessions        - List sessions       ║
║    POST   /api/user/revoke-sessions - Revoke sessions     ║
╠═══════════════════════════════════════════════════════════╣
║  Upload Endpoints:                                        ║
║    POST   /api/upload               - Upload single file  ║
║    POST   /api/upload/multiple      - Upload multiple     ║
║    POST   /api/upload/avatar        - Upload avatar       ║
║    GET    /api/upload/:id           - Get file details    ║
║    DELETE /api/upload/:id           - Delete file         ║
║    GET    /api/upload/list/all      - List all files      ║
╠═══════════════════════════════════════════════════════════╣
║  Profile Endpoints:                                        ║
║    GET    /api/profile/me           - Get profile stats   ║
║    GET    /api/profile/activity     - Activity heatmap    ║
║    POST   /api/profile/log-activity - Log new entry       ║
╠═══════════════════════════════════════════════════════════╣
║  Timeline Endpoints:                                       ║
║    POST   /api/timeline             - Create entry        ║
║    GET    /api/timeline             - List entries         ║
║    GET    /api/timeline/:id         - Get single entry    ║
║    PATCH  /api/timeline/:id         - Update entry        ║
║    DELETE /api/timeline/:id         - Delete entry        ║
╠═══════════════════════════════════════════════════════════╣
║  Shares Endpoints:                                         ║
║    POST   /api/shares               - Create share        ║
║    GET    /api/shares               - List shares         ║
║    PATCH  /api/shares/:id           - Toggle status       ║
║    DELETE /api/shares/:id           - Delete share        ║
║    GET    /api/shares/public/:token - Public view         ║
╠═══════════════════════════════════════════════════════════╣
║  📚 Documentation:                                        ║
║    GET    /docs                     - Swagger UI          ║
║    GET    /openapi.json             - OpenAPI Spec        ║
╚═══════════════════════════════════════════════════════════╝
    `);
  }
);

export default app;
