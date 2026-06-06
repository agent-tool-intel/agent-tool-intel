// Recalculate all server grades using new 35/35/30 composite formula
// Percentile-based grade mapping for guaranteed spread

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
      metadata: servers.metadata,
    })
    .from(tools)
    .innerJoin(servers, eq(tools.serverId, servers.id))
    .innerJoin(qualityScores, eq(tools.id, qualityScores.toolId));

  console.log(`Found ${allTools.length} tools\n`);

  // Step 1: Calculate composite scores for all tools
  const results: Array<{ toolId: string; qualityScore: number; composite: number }> = [];

  for (const row of allTools) {
    const qualityResult = scoreToolQuality({
      id: row.toolId, name: row.toolName, description: row.toolDesc,
      inputSchema: row.toolSchema as Record<string, unknown> | null, tokenCount: row.toolTokens,
    });
    const qualityScore = qualityResult.overallScore;

    const meta = (row.metadata || {}) as Record<string, any>;
    const stars = meta?.stars || 0;
    const pushedAt = meta?.pushed_at;
    const lastPushDaysAgo = pushedAt ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / 86400000) : null;
    const communityScore = scoreCommunity(stars, lastPushDaysAgo, meta?.is_official || false, meta?.is_verified_publisher || false);
    const trustScore = scoreTrust(null, 0, null);
    const { composite } = scoreCompositeGrade(qualityScore, communityScore, trustScore);

    results.push({ toolId: row.toolId, qualityScore, composite });
  }

  // Step 2: Sort by composite to find percentile thresholds
  results.sort((a, b) => b.composite - a.composite);
  const n = results.length;

  const percentile = (pct: number) => results[Math.floor(n * pct)]!.composite || 0;

  console.log("Score percentiles:");
  console.log(`  Top 1%: ≥${percentile(0.01).toFixed(1)}`);
  console.log(`  Top 3%: ≥${percentile(0.03).toFixed(1)}`);
  console.log(`  Top 10%: ≥${percentile(0.10).toFixed(1)}`);
  console.log(`  Top 25%: ≥${percentile(0.25).toFixed(1)}`);
  console.log(`  Top 45%: ≥${percentile(0.45).toFixed(1)}`);
  console.log(`  Top 65%: ≥${percentile(0.65).toFixed(1)}`);
  console.log(`  Top 85%: ≥${percentile(0.85).toFixed(1)}`);
  console.log(`  Top 95%: ≥${percentile(0.95).toFixed(1)}`);

  // Percentile-based grade mapping
  const gradeMap: Array<{ grade: string; threshold: number }> = [
    { grade: "A+", threshold: percentile(0.02) },    // top 2%
    { grade: "A", threshold: percentile(0.08) },      // top 8%
    { grade: "B+", threshold: percentile(0.18) },     // top 18%
    { grade: "B", threshold: percentile(0.35) },      // top 35%
    { grade: "C+", threshold: percentile(0.55) },     // top 55%
    { grade: "C", threshold: percentile(0.80) },      // top 80%
    { grade: "D", threshold: percentile(0.93) },      // top 93%
    // Below top 93% = F
  ];

  console.log("\nGrade thresholds:");
  for (const g of gradeMap) {
    console.log(`  ${g.grade}: ≥${g.threshold.toFixed(1)}`);
  }
  console.log(`  F: <${gradeMap[gradeMap.length-1].threshold.toFixed(1)}`);

  // Step 3: Assign grades and batch update
  const distribution: Record<string, number> = {};
  const updates: Array<{ toolId: string; overallScore: string; grade: string }> = [];
  let batchCount = 0;

  for (const r of results) {
    let grade = "F";
    for (const g of gradeMap) {
      if (r.composite >= g.threshold) { grade = g.grade; break; }
    }

    updates.push({ toolId: r.toolId, overallScore: r.qualityScore.toFixed(2), grade });
    distribution[grade] = (distribution[grade] || 0) + 1;

    if (updates.length >= 500) {
      await batchUpdate(updates.splice(0, 500));
      batchCount++;
      console.log(`  Batch ${batchCount}: ${batchCount * 500} tools updated...`);
    }
  }

  if (updates.length > 0) { await batchUpdate(updates); batchCount++; }

  console.log(`\nUpdated ${n} tools in ${batchCount} batches\n`);

  console.log("Final Grade Distribution:");
  const gradeOrder = ["A+", "A", "B+", "B", "C+", "C", "D", "F"];
  for (const g of gradeOrder) {
    const count = distribution[g] || 0;
    const pct = ((count / n) * 100).toFixed(1);
    const bar = "█".repeat(Math.round(count / n * 50));
    console.log(`  ${g.padEnd(3)} ${count.toLocaleString().padStart(8)} (${pct}%) ${bar}`);
  }

  console.log("\nDone.");
}

async function batchUpdate(batch: Array<{ toolId: string; overallScore: string; grade: string }>) {
  const values = batch.map(b => `('${b.toolId}', ${b.overallScore}, '${b.grade}')`).join(", ");
  await db.execute(sql.raw(`
    UPDATE quality_scores AS qs SET
      overall_score = v.overall_score,
      grade = v.grade,
      scored_at = NOW()
    FROM (VALUES ${values}) AS v(tool_id, overall_score, grade)
    WHERE qs.tool_id = v.tool_id::uuid
  `));
}

main().catch(e => { console.error("Migration failed:", e); process.exit(1); });
