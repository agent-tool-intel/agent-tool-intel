import { Hono } from "hono";
import { cors } from "hono/cors";
import { searchRoute } from "./routes/search.js";
import { toolsRoute } from "./routes/tools.js";
import { testRoute } from "./routes/test.js";
import { feedbackRoute } from "./routes/feedback.js";

const app = new Hono();

app.use("*", cors());

// Health check
app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

// Agent-facing API routes
app.route("/api/v1", searchRoute);
app.route("/api/v1", toolsRoute);
app.route("/api/v1", testRoute);
app.route("/api/v1", feedbackRoute);

export default app;
