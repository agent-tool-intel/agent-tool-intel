import { Hono } from "hono";
import { SearchRequestSchema } from "../types/index.js";
import { searchTools } from "../services/search.js";
import { logSearch } from "../services/search.js";

export const searchRoute = new Hono();

// GET /search — usage info for API discovery
searchRoute.get("/search", (c) => {
  return c.json({
    endpoint: "POST /api/v1/search",
    description: "Semantic search across 39,752+ MCP servers with quality scores and agent signals",
    body: { query: "string (required)", maxResults: "number (optional, default 10)", minScore: "number (optional)" },
    example: 'curl -X POST https://agent-tool-intel-production.up.railway.app/api/v1/search -H "Content-Type: application/json" -d \'{"query":"extract tables from PDF","maxResults":3}\'',
    docs: "https://agent-tool-intel-production.up.railway.app/docs"
  });
});

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
