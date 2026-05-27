import { Hono } from "hono";
import { db } from "../db/index.js";
import { tools, servers, qualityScores, sandboxResults, feedback } from "../db/schema.js";
import { eq, desc, sql } from "drizzle-orm";

export const toolsRoute = new Hono();

// GET /api/v1/tools/:id
toolsRoute.get("/tools/:id", async (c) => {
  const id = c.req.param("id");

  const result = await db
    .select({
      tool: tools,
      server: servers,
      quality: qualityScores,
    })
    .from(tools)
    .innerJoin(servers, eq(tools.serverId, servers.id))
    .leftJoin(qualityScores, eq(tools.id, qualityScores.toolId))
    .where(eq(tools.id, id))
    .limit(1);

  if (!result[0]) {
    return c.json({ error: "Tool not found" }, 404);
  }

  const row = result[0];

  // Get latest sandbox result
  const latestSandbox = await db
    .select()
    .from(sandboxResults)
    .where(eq(sandboxResults.toolId, id))
    .orderBy(desc(sandboxResults.testedAt))
    .limit(1);

  // Get feedback stats
  const feedbackStats = await db
    .select({
      total: sql<number>`count(*)`,
      avgRating: sql<number>`avg(${feedback.rating})`,
      successRate: sql<number>`
        count(case when ${feedback.result} = 'success' then 1 end)::float / NULLIF(count(*), 0) * 100
      `,
    })
    .from(feedback)
    .where(eq(feedback.toolId, id));

  return c.json({
    tool: row.tool,
    server: row.server,
    quality: row.quality,
    latestSandbox: latestSandbox[0] ?? null,
    feedbackStats: feedbackStats[0] ?? null,
  });
});
