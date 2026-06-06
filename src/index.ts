import { serve } from "@hono/node-server";
import app from "./app.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

console.log(`🧠 Agent Tool Intelligence v0.2.0`);
console.log(`🚀 Starting server on port ${PORT}...`);

serve({
  fetch: app.fetch,
  port: PORT,
});

console.log(`✅ Server running at http://localhost:${PORT}`);
console.log(`📋 Health check: http://localhost:${PORT}/health`);
