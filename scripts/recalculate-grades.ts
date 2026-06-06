// Recalculate all server grades using new 35/35/30 composite formula
// Run: npx tsx scripts/recalculate-grades.ts
// IMPORTANT: Re-computes quality scores from tool data, does NOT overwrite them

import { db } from "../src/db/index.js";
import { servers, tools, qualityScores } from "../src/db/schema.js";
import { scoreCompositeGrade, scoreCommunity, scoreTrust, scoreToolQuality } from "../src/services/quality.js";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Starting grade recalculation...\n");

  const allTools = await db
    .select({
      toolId: tools.id,
      toolName: tools.name,
      toolDesc: tools.description,
      toolSchema: tools.inputSchema,
      toolTokens: tools.tokenCount,
      qualityOverall: qualityScores.overallScore,
      qualityCorrectness: qualityScores.correctness,
      qualityEfficiency: qualityScores.efficiency,
      qualityDesc: qualityScores.descriptionQ,
      qualitySecurity: qualityScores.security,
      qualityInstall: qualityScores.installRel,
      currentGrade: qualityScores.grade,
      serverName: servers.name,
      metadata: servers.metadata,
    })
    .from(tools)
    .innerJoin(servers, eq(tools.serverId, servers.id))
    .innerJoin(qualityScores, eq(tools.id, qualityScores.toolId));

  console.log(`Found ${allTools.length} tools to recalculate\n`);

  const distribution: Record<string, number> = {};
  let updated = 0;

  for (const row of allTools) {
    // 1. Re-compute Quality Score from tool definition（NOT from stored score）
    const qualityResult = scoreToolQuality({
      id: row.toolId,
      name: row.toolName,
      description: row.toolDesc,
      inputSchema: row.toolSchema as Record<string, unknown> | null,
      tokenCount: row.toolTokens,
    });
    const qualityScore = qualityResult.overallScore;

    // 2. Community Score
    const meta = (row.metadata || {}) as Record<string, any>;
    const stars = meta?.stars || 0;
    const pushedAt = meta?.pushed_at;
    const lastPushDaysAgo = pushedAt
      ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / 86400000)
      : null;
    const isOfficial = meta?.is_official || false;
    const isVerifiedPublisher = meta?.is_verified_publisher || false;
    const communityScore = scoreCommunity(stars, lastPushDaysAgo, isOfficial, isVerifiedPublisher);

    // 3. Trust Score（baseline for now）
    const totalCalls = meta?.total_calls || 0;
    const successRate = meta?.success_rate || null;
    const trustScore = scoreTrust(successRate, totalCalls, null);

    // 4. Composite Grade
    const { composite, grade } = scoreCompositeGrade(qualityScore, communityScore, trustScore);

    // 5. Update: new quality score + composite + grade（don't overwrite quality）
    if (grade !== row.currentGrade || Math.abs(qualityScore - parseFloat(String(row.qualityOverall || "0"))) > 1) {
      await db
        .update(qualityScores)
        .set({
          overallScore: qualityScore.toFixed(2),  // Store QUALITY score, not composite
          grade,
          correctness: qualityResult.correctness,
          efficiency: qualityResult.efficiency,
          descriptionQ: qualityResult.descriptionQ,
          security: qualityResult.security,
          installRel: qualityResult.installRel,
          updatedAt: new Date(),
        } as any)
        .where(eq(qualityScores.toolId, row.toolId));
      updated++;
    }

    distribution[grade] = (distribution[grade] || 0) + 1;

    if (updated % 5000 === 0 && updated > 0) {
      console.log(`  Updated ${updated} tools...`);
    }
  }

  console.log(`\nUpdated ${updated} of ${allTools.length} tools\n`);

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

main().catch(e => {
  console.error("Migration failed:", e);
  process.exit(1);
});
