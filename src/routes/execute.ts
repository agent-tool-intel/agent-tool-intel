import { Hono } from "hono";
import { executeTool } from "../services/executor.js";
import { z } from "zod";
import { db } from "../db/index.js";
import { feedback } from "../db/schema.js";

const ExecuteRequestSchema = z.object({
  query: z.string().min(1).max(500),
  input: z.record(z.unknown()).optional(),
  maxResults: z.number().min(1).max(10).optional().default(5),
  preferTrusted: z.boolean().optional().default(true),
});

export const executeRoute = new Hono();

executeRoute.post("/execute", async (c) => {
  const body = await c.req.json();
  const parsed = ExecuteRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const result = await executeTool(parsed.data);

  // Auto-feedback: record execution result
  if (result.toolUsed && result.serverName) {
    try {
      await db.insert(feedback).values({
        toolId: `tool:mcp:${result.serverName}@latest`,
        result: result.executed ? "success" : "failure",
        latencyMs: result.latencyMs,
        rating: result.executed ? 4 : 2,
        notes: `Phase 3 MVP execution: ${result.method}`,
      });
    } catch {}
  }

  return c.json(result);
});
