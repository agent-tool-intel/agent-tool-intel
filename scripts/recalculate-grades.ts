// Recalculate all server grades using new 35/35/30 composite formula
// Fast version: batch update 500 at a time via raw SQL

import { db } from "../src/db/index.js";
import { servers, tools, qualityScores } from "../src/db/schema.js";
import { scoreCompositeGrade, scoreCommunity, scoreTrust, scoreToolQuality } from "../src/services/quality.js";
import { eq, sql } from "drizzle-orm";

async function main() {
  console.log("Starting grade recalculation...\n");

  const allTools = await db
    .select({
      toolId: tools.id,
      toolName: tools.name,
      toolDesc: tools.description,
      toolSchema: tools.inputSchema,
      toolTokens: tools.tokenCount,
      currentGrade: qualityScores.grade,
      metadata: servers.metadata,
    })
    .from(tools)
    .innerJoin(servers, eq(tools.serverId, servers.id))
    .innerJoin(qualityScores, eq(tools.id, qualityScores.toolId));

  console.log(`Found ${allTools.length} tools\n`);

  const distribution: Record<string, number> = {};
  const updates: Array<{ toolId: string; overallScore: string; grade: string }> = [];
  let batchCount = 0;

  for (const row of allTools) {
    const qualityResult = scoreToolQuality({
      id: row.toolId,
      name: row.toolName,
      description: row.toolDesc,
      inputSchema: row.toolSchema as Record<string, unknown> | null,
      tokenCount: row.toolTokens,
    });
    const qualityScore = qualityResult.overallScore;

    const meta = (row.metadata || {}) as Record<string, any>;
    const stars = meta?.stars || 0;
    const pushedAt = meta?.pushed_at;
    const lastPushDaysAgo = pushedAt
      ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / 86400000)
      : null;
    const isOfficial = meta?.is_official || false;
    const isVerifiedPublisher = meta?.is_verified_publisher || false;
    const communityScore = scoreCommunity(stars, lastPushDaysAgo, isOfficial, isVerifiedPublisher);

    const trustScore = scoreTrust(null, 0, null);
    const { composite, grade } = scoreCompositeGrade(qualityScore, communityScore, trustScore);

    updates.push({
      toolId: row.toolId,
      overallScore: qualityScore.toFixed(2),
      grade,
    });

    distribution[grade] = (distribution[grade] || 0) + 1;

    // Batch update every 500 tools
    if (updates.length >= 500) {
      await batchUpdate(updates.splice(0, 500));
      batchCount++;
      console.log(`  Batch ${batchCount}: ${batchCount * 500} tools updated...`);
    }
  }

  // Final batch
  if (updates.length > 0) {
    await batchUpdate(updates);
    batchCount++;
  }

  console.log(`\nUpdated ${allTools.length} tools in ${batchCount} batches\n`);

  console.log("Final Grade Distribution:");
  const gradeOrder = ["A+", "A", "B+", "B", "C+", "C", "D", "F"];
  for (const g of gradeOrder) {
    const count = distribution[g] || 0;
    const pct = ((count / allTools.length) * 100).toFixed(1);
    const bar = "█".repeat(Math.round(count / allTools.length * 50));
    console.log(`  ${g.padEnd(3)} ${count.toLocaleString().padStart(8)} (${pct}%) ${bar}`);
  }

  console.log("\nDone.");
}

async function batchUpdate(batch: Array<{ toolId: string; overallScore: string; grade: string }>) {
  // Use raw SQL for batch update — 100x faster than individual queries
  const values = batch
    .map(b => `('${b.toolId}', ${b.overallScore}, '${b.grade}')`)
    .join(", ");

  await db.execute(sql.raw(`
    UPDATE quality_scores AS qs SET
      overall_score = v.overall_score,
      grade = v.grade,
      scored_at = NOW()
    FROM (VALUES ${values}) AS v(tool_id, overall_score, grade)
    WHERE qs.tool_id = v.tool_id::uuid
  `));
}

main().catch(e => {
  console.error("Migration failed:", e);
  process.exit(1);
});
