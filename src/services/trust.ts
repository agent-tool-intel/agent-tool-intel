import { db } from "../db/index.js";
import { feedback, qualityScores } from "../db/schema.js";
import { eq, sql, count, avg, and, gt } from "drizzle-orm";

interface TrustScore {
  score: number;          // 0-100
  successRate: number;    // percentage
  totalCalls: number;
  avgLatencyMs: number;
  consistency: number;    // 0-100 (low variance = high consistency)
  recency: number;        // 0-100 (recent usage = high recency)
  community: number;      // 0-100 (GitHub stars, activity)
  confidence: "high" | "medium" | "low" | "insufficient_data";
}

export async function calculateToolTrust(toolId: string): Promise<TrustScore> {
  // 1. Get all feedback for this tool
  const feedbackData = await db
    .select({
      total: count(),
      successCount: sql<number>`count(CASE WHEN ${feedback.result} = 'success' THEN 1 END)`,
      partialCount: sql<number>`count(CASE WHEN ${feedback.result} = 'partial' THEN 1 END)`,
      failCount: sql<number>`count(CASE WHEN ${feedback.result} = 'failure' THEN 1 END)`,
      avgLatency: avg(feedback.latencyMs),
      avgRating: avg(feedback.rating),
      // Recent activity (last 30 days)
      recentTotal: sql<number>`count(CASE WHEN ${feedback.submittedAt} > now() - interval '30 days' THEN 1 END)`,
      recentSuccess: sql<number>`count(CASE WHEN ${feedback.submittedAt} > now() - interval '30 days' AND ${feedback.result} = 'success' THEN 1 END)`,
      // Last 7 days for recency
      last7Days: sql<number>`count(CASE WHEN ${feedback.submittedAt} > now() - interval '7 days' THEN 1 END)`,
    })
    .from(feedback)
    .where(eq(feedback.toolId, toolId));

  const stats = feedbackData[0];
  const total = Number(stats?.total ?? 0);

  // No feedback data
  if (total === 0 || !stats) {
    return {
      score: 50,
      successRate: 0,
      totalCalls: 0,
      avgLatencyMs: 0,
      consistency: 50,
      recency: 50,
      community: 50,
      confidence: "insufficient_data",
    };
  }

  const successCount = Number(stats.successCount ?? 0);
  const partialCount = Number(stats.partialCount ?? 0);
  const failCount = Number(stats.failCount ?? 0);
  const recentTotal = Number(stats.recentTotal ?? 0);
  const recentSuccess = Number(stats.recentSuccess ?? 0);
  const last7Days = Number(stats.last7Days ?? 0);

  // 2. Success Rate (40% weight)
  // Partial successes count as 0.5
  const effectiveSuccess = successCount + partialCount * 0.5;
  const successRate = total > 0 ? (effectiveSuccess / total) * 100 : 0;

  // 3. Recency Score (25% weight)
  // More recent activity = higher score
  let recencyScore: number;
  if (last7Days >= 10) recencyScore = 100;
  else if (last7Days >= 5) recencyScore = 85;
  else if (last7Days >= 1) recencyScore = 70;
  else if (recentTotal >= 5) recencyScore = 55;
  else if (recentTotal >= 1) recencyScore = 40;
  else recencyScore = 20;

  // 4. Consistency Score (20% weight)
  // Based on rating variance and success/fail ratio stability
  const avgRating = Number(stats.avgRating ?? 3);
  // High average rating + low fail rate = consistent
  const ratingConsistency = Math.min(100, (avgRating / 5) * 100);
  const failRate = total > 0 ? failCount / total : 0;
  const failPenalty = failRate * 100;
  const consistencyScore = Math.max(0, ratingConsistency - failPenalty * 0.5);

  // 5. Community Score (15% weight)
  // Based on total usage volume and rating
  const volumeScore = Math.min(100, total * 2); // 50 calls = 100
  const communityScore = (volumeScore * 0.6 + ratingConsistency * 0.4);

  // 6. Composite Trust Score
  const score =
    successRate * 0.40 +
    recencyScore * 0.25 +
    consistencyScore * 0.20 +
    communityScore * 0.15;

  // 7. Confidence level
  let confidence: TrustScore["confidence"];
  if (total >= 50) confidence = "high";
  else if (total >= 20) confidence = "medium";
  else if (total >= 5) confidence = "low";
  else confidence = "insufficient_data";

  return {
    score: Math.round(score * 100) / 100,
    successRate: Math.round(successRate * 100) / 100,
    totalCalls: total,
    avgLatencyMs: Math.round(Number(stats.avgLatency ?? 0)),
    consistency: Math.round(consistencyScore),
    recency: recencyScore,
    community: Math.round(communityScore),
    confidence,
  };
}

// ── Batch Trust Calculation ──

export async function calculateAllTrustScores(): Promise<{
  updated: number;
  withData: number;
  insufficient: number;
}> {
  // Get all tools that have at least one feedback
  const toolsWithFeedback = await db
    .select({ toolId: feedback.toolId })
    .from(feedback)
    .groupBy(feedback.toolId);

  let withData = 0;
  let insufficient = 0;

  for (const { toolId } of toolsWithFeedback) {
    const trust = await calculateToolTrust(toolId);

    // Update tool metadata in search_logs or a trust_scores table
    // For MVP, trust is calculated on-the-fly from feedback data
    if (trust.confidence !== "insufficient_data") {
      withData++;
    } else {
      insufficient++;
    }
  }

  return {
    updated: toolsWithFeedback.length,
    withData,
    insufficient,
  };
}

// ── Degradation over time ──

export function applyTimeDecay(trustScore: TrustScore): TrustScore {
  // If no activity in 60 days, apply confidence degradation
  if (trustScore.recency <= 40 && trustScore.confidence !== "insufficient_data") {
    const decayFactor = 0.85; // 15% reduction
    return {
      ...trustScore,
      score: Math.round(trustScore.score * decayFactor * 100) / 100,
      confidence:
        trustScore.confidence === "high"
          ? "medium"
          : trustScore.confidence === "medium"
            ? "low"
            : trustScore.confidence,
    };
  }

  return trustScore;
}
