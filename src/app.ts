import { Hono } from "hono";
import { cors } from "hono/cors";
import { searchRoute } from "./routes/search.js";
import { toolsRoute } from "./routes/tools.js";
import { testRoute } from "./routes/test.js";
import { feedbackRoute } from "./routes/feedback.js";
import { executeRoute } from "./routes/execute.js";
import { publicRoute } from "./routes/public.js";

const app = new Hono();

app.use("*", cors());

// Health check
app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

// Public page + badge
app.route("/", publicRoute);

// Agent-facing API routes
app.route("/api/v1", searchRoute);
app.route("/api/v1", toolsRoute);
app.route("/api/v1", testRoute);
app.route("/api/v1", feedbackRoute);
app.route("/api/v1", executeRoute);

export default app;
