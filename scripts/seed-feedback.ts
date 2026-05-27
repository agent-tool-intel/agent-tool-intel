// Seed simulated agent feedback to bootstrap trust scores
// Run: npx tsx --env-file=.env scripts/seed-feedback.ts

import { db } from "../src/db/index.js";
import { tools, qualityScores, feedback } from "../src/db/schema.js";
import { eq, inArray } from "drizzle-orm";

interface ToolInfo {
  id: string;
  name: string;
  qualityScore: number;
  qualityGrade: string;
  serverName: string;
}

async function seedFeedback() {
  console.log("🤖 Generating simulated agent feedback...\n");

  // 1. Get all tools with quality scores
  const allTools = await db
    .select({
      id: tools.id,
      name: tools.name,
      serverName: tools.serverId,
      qualityScore: qualityScores.overallScore,
      qualityGrade: qualityScores.grade,
    })
    .from(tools)
    .innerJoin(qualityScores, eq(tools.id, qualityScores.toolId))
    .limit(200);

  console.log(`   Found ${allTools.length} tools with quality scores\n`);

  let totalFeedback = 0;

  for (const tool of allTools) {
    const qScore = Number(tool.qualityScore ?? 50);
    const qGrade = tool.qualityGrade ?? "C";

    // Determine feedback profile based on quality
    const profile = getFeedbackProfile(qGrade, qScore);

    // Generate feedback entries
    const entries: Array<{
      toolId: string;
      result: "success" | "partial" | "failure";
      latencyMs: number;
      tokensUsed: number;
      rating: number;
      daysAgo: number;
    }> = [];

    // Generate the right number of entries with the right success rate
    const total = profile.totalCalls;
    const successCount = Math.round(total * profile.successRate);
    const failCount = Math.round(total * profile.failRate);
    const partialCount = total - successCount - failCount;

    for (let i = 0; i < successCount; i++) {
      entries.push({
        toolId: tool.id,
        result: "success",
        latencyMs: randomInRange(profile.minLatency, profile.maxLatency),
        tokensUsed: randomInRange(200, 800),
        rating: randomInRange(4, 5),
        daysAgo: randomInRange(0, 120),
      });
    }
    for (let i = 0; i < partialCount; i++) {
      entries.push({
        toolId: tool.id,
        result: "partial",
        latencyMs: randomInRange(profile.minLatency * 1.5, profile.maxLatency * 1.5),
        tokensUsed: randomInRange(300, 1000),
        rating: randomInRange(2, 4),
        daysAgo: randomInRange(0, 60),
      });
    }
    for (let i = 0; i < failCount; i++) {
      entries.push({
        toolId: tool.id,
        result: "failure",
        latencyMs: randomInRange(profile.minLatency * 2, profile.maxLatency * 3),
        tokensUsed: randomInRange(100, 500),
        rating: randomInRange(1, 2),
        daysAgo: randomInRange(0, 90),
      });
    }

    // Shuffle entries to mix dates
    entries.sort(() => Math.random() - 0.5);

    // Insert in batches of 20
    for (let i = 0; i < entries.length; i += 20) {
      const batch = entries.slice(i, i + 20);
      await db.insert(feedback).values(
        batch.map((e) => ({
          toolId: e.toolId,
          result: e.result,
          latencyMs: e.latencyMs,
          tokensUsed: e.tokensUsed,
          rating: e.rating as 1 | 2 | 3 | 4 | 5,
          submittedAt: new Date(
            Date.now() - e.daysAgo * 24 * 60 * 60 * 1000
          ),
        }))
      );
    }

    totalFeedback += entries.length;
  }

  console.log(`✅ Generated ${totalFeedback} feedback entries across ${allTools.length} tools`);
  console.log("\n📊 Trust Profile Distribution:");
  console.log("   A-quality tools  → high success rate, high volume (active & trusted)");
  console.log("   B-quality tools  → good success rate, moderate volume");
  console.log("   C-quality tools  → mixed results, average volume");
  console.log("   D/F-quality tools → high failure rate, low volume");
  console.log("\n🔍 Run search to see real trust scores now!");
}

function getFeedbackProfile(grade: string, score: number) {
  // Maps quality grade to feedback simulation profile
  switch (grade) {
    case "A+":
    case "A":
      return {
        totalCalls: randomInRange(30, 80),
        successRate: 0.92 + Math.random() * 0.07, // 92-99%
        failRate: 0.01 + Math.random() * 0.02,     // 1-3%
        minLatency: 50,
        maxLatency: 300,
      };
    case "B+":
    case "B":
      return {
        totalCalls: randomInRange(20, 50),
        successRate: 0.82 + Math.random() * 0.13, // 82-95%
        failRate: 0.03 + Math.random() * 0.05,     // 3-8%
        minLatency: 80,
        maxLatency: 500,
      };
    case "C":
      return {
        totalCalls: randomInRange(10, 30),
        successRate: 0.65 + Math.random() * 0.20,  // 65-85%
        failRate: 0.08 + Math.random() * 0.12,      // 8-20%
        minLatency: 100,
        maxLatency: 800,
      };
    case "D":
    case "F":
    default:
      return {
        totalCalls: randomInRange(3, 15),
        successRate: 0.35 + Math.random() * 0.30,   // 35-65%
        failRate: 0.20 + Math.random() * 0.25,       // 20-45%
        minLatency: 200,
        maxLatency: 2000,
      };
  }
}

function randomInRange(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

seedFeedback().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
