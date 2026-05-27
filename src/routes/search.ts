import { Hono } from "hono";
import { SearchRequestSchema } from "../types/index.js";
import { searchTools } from "../services/search.js";
import { logSearch } from "../services/search.js";

export const searchRoute = new Hono();

searchRoute.post("/search", async (c) => {
  const body = await c.req.json();
  const parsed = SearchRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const { query, minScore, maxResults, preferences } = parsed.data;

  const results = await searchTools({
    query,
    minScore,
    maxResults,
    preferences,
  });

  // Log search for analytics
  const topIds = results.results.slice(0, 3).map((r) => r.toolId);
  await logSearch({
    query,
    resultsCount: results.results.length,
    topToolIds: topIds,
  });

  return c.json(results);
});
