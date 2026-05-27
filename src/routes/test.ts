import { Hono } from "hono";
import { db } from "../db/index.js";
import { tools, sandboxResults } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { testToolInSandbox } from "../services/sandbox.js";

export const testRoute = new Hono();

// POST /api/v1/tools/:id/test
testRoute.post("/tools/:id/test", async (c) => {
  const id = c.req.param("id");

  const tool = await db.query.tools.findFirst({
    where: eq(tools.id, id),
  });

  if (!tool) {
    return c.json({ error: "Tool not found" }, 404);
  }

  // Run sandbox test
  try {
    const result = await testToolInSandbox(id);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: "Sandbox test failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// GET /api/v1/tools/:id/test-results
testRoute.get("/tools/:id/test-results", async (c) => {
  const id = c.req.param("id");

  const results = await db
    .select()
    .from(sandboxResults)
    .where(eq(sandboxResults.toolId, id))
    .orderBy(desc(sandboxResults.testedAt))
    .limit(10);

  return c.json({ tool_id: id, results });
});
