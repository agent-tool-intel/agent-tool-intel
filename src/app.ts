import { Hono } from "hono";
import { cors } from "hono/cors";
import { searchRoute } from "./routes/search.js";
import { toolsRoute } from "./routes/tools.js";
import { testRoute } from "./routes/test.js";
import { feedbackRoute } from "./routes/feedback.js";
import { executeRoute } from "./routes/execute.js";
import { publicRoute } from "./routes/public.js";
import { phase3Route } from "./routes/phase3.js";

const app = new Hono();

app.use("*", cors());

// Security headers
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("X-XSS-Protection", "1; mode=block");
  c.res.headers.set("Referrer-Policy", "no-referrer");
  c.res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});

// Page view counter（simple analytics）
const pageViews: Record<string, number> = {};
app.use("*", async (c, next) => {
  const path = c.req.path;
  if (!path.startsWith("/api/") && path !== "/health") {
    pageViews[path] = (pageViews[path] || 0) + 1;
  }
  await next();
});

// Analytics endpoint
app.get("/api/v1/analytics", (c) => {
  const total = Object.values(pageViews).reduce((a, b) => a + b, 0);
  const top = Object.entries(pageViews).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return c.json({ total, top: Object.fromEntries(top), detail: pageViews });
});

// Trigger ingestion (admin)
app.post("/api/v1/admin/ingest", async (c) => {
  const { runIngestion } = await import("./services/ingestion.js");
  // Run in background
  runIngestion().then(r => console.log(`Ingestion done: ${r.newServers} new servers, ${r.newTools} new tools, ${r.totalServers} total`)).catch(e => console.error("Ingestion error:", e));
  return c.json({ status: "started", message: "Ingestion running in background. Check Railway logs for results." });
});

// Health check
app.get("/health", (c) => c.json({ status: "ok", version: "0.2.0" }));

// Public page + badge
app.route("/", publicRoute);

// Agent-facing API routes
app.route("/api/v1", searchRoute);
app.route("/api/v1", toolsRoute);
app.route("/api/v1", testRoute);
app.route("/api/v1", feedbackRoute);
app.route("/api/v1", executeRoute);

// Phase 3 routes
app.route("/api/v1", phase3Route);

// 404 handler
app.notFound((c) => {
  return c.html('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>404 — Agent Tool Intelligence</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:#0a0a0f;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}.container{max-width:400px;padding:40px}h1{font-size:4em;font-weight:800;background:linear-gradient(135deg,#7c9ff5,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}p{color:#8b949e;margin:16px 0 24px}a{color:#7c9ff5;text-decoration:none;font-weight:600}a:hover{color:#a0b8ff}</style></head><body><div class="container"><h1>404</h1><p>This page does not exist. But 39,752 MCP servers do.</p><a href="/">← Back to Leaderboard</a></div></body></html>', 404);
});

// Global error handler — prevents 500 from leaking
app.onError((err, c) => {
  console.error("Unhandled error:", err.message);
  return c.json({ error: "Internal server error. Please try again." }, 500);
});

// Rate limiting（simple in-memory, per-IP, 60 req/min）
const rateLimitMap = new Map<string, { count: number; reset: number }>();
app.use("/api/*", async (c, next) => {
  const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (entry && now < entry.reset) {
    if (entry.count >= 60) {
      return c.json({ error: "Too many requests. Try again later." }, 429);
    }
    entry.count++;
  } else {
    rateLimitMap.set(ip, { count: 1, reset: now + 60000 });
  }
  await next();
});

// Cache headers for static pages
app.use("/", async (c, next) => {
  await next();
  const path = c.req.path;
  const staticPages = ["/docs", "/scoring/methodology", "/roadmap", "/report/monthly", "/partners", "/robots.txt", "/sitemap.xml"];
  if (staticPages.includes(path)) {
    c.res.headers.set("Cache-Control", "public, max-age=300");
  }
});

export default app;
