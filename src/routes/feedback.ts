import { Hono } from "hono";
import { db } from "../db/index.js";
import { feedback } from "../db/schema.js";
import { FeedbackRequestSchema } from "../types/index.js";

export const feedbackRoute = new Hono();

feedbackRoute.post("/feedback", async (c) => {
  const body = await c.req.json();
  const parsed = FeedbackRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const entry = parsed.data;

  await db.insert(feedback).values({
    toolId: entry.toolId,
    searchId: entry.searchId ?? null,
    result: entry.result,
    latencyMs: entry.latencyMs ?? null,
    tokensUsed: entry.tokensUsed ?? null,
    rating: entry.rating,
    notes: entry.notes ?? null,
  });

  return c.json({
    received: true,
    trust_score_updated: true,
  });
});
