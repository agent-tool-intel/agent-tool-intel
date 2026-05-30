// Re-score all tools with tightened scoring engine
import { db } from "../src/db/index.js";
import { tools, qualityScores } from "../src/db/schema.js";
import { sql, eq } from "drizzle-orm";
import { scoreToolQuality } from "../src/services/quality.js";

async function rescore() {
  const allTools = await db.select({
    id: tools.id,
    name: tools.name,
    description: tools.description,
    inputSchema: tools.inputSchema,
    tokenCount: tools.tokenCount,
  }).from(tools);

  console.log(`Re-scoring ${allTools.length} tools with tightened engine...\n`);

  // Distribution tracking
  const dist: Record<string, number> = {};

  for (const tool of allTools) {
    const score = scoreToolQuality({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as any,
      tokenCount: tool.tokenCount,
    });

    // Update quality_scores
    await db.update(qualityScores)
      .set({
        overallScore: String(score.overallScore),
        grade: score.grade,
        correctness: String(score.correctness),
        efficiency: String(score.efficiency),
        descriptionQ: String(score.descriptionQ),
        security: String(score.security),
        installRel: String(score.installRel),
        issuesFound: score.issuesFound,
        scoredAt: new Date(),
      })
      .where(eq(qualityScores.toolId, tool.id));

    dist[score.grade] = (dist[score.grade] || 0) + 1;
    if (Object.values(dist).reduce((a, b) => a + b, 0) % 1000 === 0) {
      console.log(`  ${Object.values(dist).reduce((a, b) => a + b, 0)} tools re-scored...`);
    }
  }

  console.log("\n📊 New Grade Distribution:");
  const sorted = Object.entries(dist).sort((a, b) => {
    const order = ["A+", "A", "B+", "B", "C", "D", "F"];
    return order.indexOf(a[0]) - order.indexOf(b[0]);
  });
  for (const [grade, count] of sorted) {
    const pct = ((count / allTools.length) * 100).toFixed(1);
    console.log(`  ${grade}: ${count} (${pct}%)`);
  }
  console.log(`\n✅ Re-score complete. ${allTools.length} tools updated.`);
}

rescore();
