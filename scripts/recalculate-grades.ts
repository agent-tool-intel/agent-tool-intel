// Recalculate all server grades using new 35/35/30 composite formula
// Run: npx tsx scripts/recalculate-grades.ts

import { db } from "../src/db/index.js";
import { servers, tools, qualityScores } from "../src/db/schema.js";
import { scoreCompositeGrade, scoreCommunity, scoreTrust, scoreToGrade } from "../src/services/quality.js";
import { eq, sql } from "drizzle-orm";

async function main() {
  console.log("Starting grade recalculation...\n");

  // Get all tools with scores and server metadata
  const allTools = await db
    .select({
      toolId: tools.id,
      toolName: tools.name,
      qualityOverall: qualityScores.overallScore,
      qualityCorrectness: qualityScores.correctness,
      qualityEfficiency: qualityScores.efficiency,
      qualityDesc: qualityScores.descriptionQ,
      qualitySecurity: qualityScores.security,
      qualityInstall: qualityScores.installRel,
      currentGrade: qualityScores.grade,
      serverId: servers.id,
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
    // Calculate Community Score
    const meta = row.metadata as Record<string, any> || {};
    const stars = meta?.stars || 0;
    const pushedAt = meta?.pushed_at;
    const lastPushDaysAgo = pushedAt
      ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / 86400000)
      : null;
    const isOfficial = meta?.is_official || false;
    const isVerifiedPublisher = meta?.is_verified_publisher || false;

    const communityScore = scoreCommunity(stars, lastPushDaysAgo, isOfficial, isVerifiedPublisher);

    // Calculate Trust Score (baseline for now)
    const totalCalls = meta?.total_calls || 0;
    const successRate = meta?.success_rate || null;
    const trustScore = scoreTrust(successRate, totalCalls, null);

    // Calculate Composite Grade
    // Drizzle decimal returns string — parse carefully
    const qualityScore = parseFloat(String(row.qualityOverall || "0")) || 0;
    const { composite, grade, qualityFloorCap } = scoreCompositeGrade(qualityScore, communityScore, trustScore);

    // Update grade if changed
    if (grade !== row.currentGrade) {
      await db
        .update(qualityScores)
        .set({
          grade,
          overallScore: composite.toFixed(2),
          updatedAt: new Date(),
        } as any)
        .where(eq(qualityScores.toolId, row.toolId));

      updated++;
    }

    distribution[grade] = (distribution[grade] || 0) + 1;

    if (updated % 1000 === 0 && updated > 0) {
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
