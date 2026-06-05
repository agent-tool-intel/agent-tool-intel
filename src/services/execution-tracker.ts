// Execution Tracker — Phase 3A
// Records every tool execution → powers Real Execution Count + Success Rate + Latency

import { db } from "../db/index.js";
import { executionEvents, executionStats, tools } from "../db/schema.js";
import { eq, sql, and } from "drizzle-orm";

interface RecordExecutionInput {
  toolId: string;
  success: boolean;
  latencyMs: number;
  tokensConsumed?: number;
  errorMessage?: string;
  agentId?: string;
  partnerSource?: string;
}

export async function recordExecution(input: RecordExecutionInput) {
  // 1. Insert event
  await db.insert(executionEvents).values({
    toolId: input.toolId,
    success: input.success,
    latencyMs: input.latencyMs,
    tokensConsumed: input.tokensConsumed ?? null,
    errorMessage: input.errorMessage ?? null,
    agentId: input.agentId ?? null,
    partnerSource: input.partnerSource ?? null,
  });

  // 2. Upsert daily stats
  const today = new Date().toISOString().slice(0, 10);
  const existing = await db
    .select({ id: executionStats.id, totalExecutions: executionStats.totalExecutions, successCount: executionStats.successCount, totalTokens: executionStats.totalTokens, avgLatencyMs: executionStats.avgLatencyMs })
    .from(executionStats)
    .where(and(eq(executionStats.toolId, input.toolId), eq(executionStats.date, today)))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0]!;
    const newTotal = row.totalExecutions + 1;
    const newSuccess = row.successCount + (input.success ? 1 : 0);
    const newTokens = (row.totalTokens || 0) + (input.tokensConsumed || 0);
    const currentTotalLatency = Number(row.avgLatencyMs || 0) * row.totalExecutions;
    const newAvgLatency = ((currentTotalLatency + input.latencyMs) / newTotal).toFixed(2);

    await db
      .update(executionStats)
      .set({
        totalExecutions: newTotal,
        successCount: newSuccess,
        failCount: newTotal - newSuccess,
        avgLatencyMs: newAvgLatency,
        totalTokens: newTokens,
        updatedAt: new Date(),
      })
      .where(eq(executionStats.id, row.id));
  } else {
    await db.insert(executionStats).values({
      toolId: input.toolId,
      date: today,
      totalExecutions: 1,
      successCount: input.success ? 1 : 0,
      failCount: input.success ? 0 : 1,
      avgLatencyMs: input.latencyMs.toString(),
      totalTokens: input.tokensConsumed || 0,
      uniqueAgents: input.agentId ? 1 : 0,
    });
  }
}

interface ExecutionSummary {
  totalExecutions: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokensConsumed: number;
  last30Days: { date: string; executions: number; success: number }[];
}

export async function getExecutionSummary(toolId: string): Promise<ExecutionSummary | null> {
  const stats = await db
    .select({
      total: sql<number>`sum(${executionStats.totalExecutions})`.mapWith(Number),
      success: sql<number>`sum(${executionStats.successCount})`.mapWith(Number),
      avgLat: sql<number>`avg(${executionStats.avgLatencyMs})`.mapWith(Number),
      tokens: sql<number>`sum(${executionStats.totalTokens})`.mapWith(Number),
    })
    .from(executionStats)
    .where(eq(executionStats.toolId, toolId));

  const row = stats[0];
  if (!row || !row.total) return null;

  // Last 30 days trend
  const trend = await db
    .select({
      date: executionStats.date,
      executions: executionStats.totalExecutions,
      success: executionStats.successCount,
    })
    .from(executionStats)
    .where(and(eq(executionStats.toolId, toolId)))
    .orderBy(executionStats.date)
    .limit(30);

  return {
    totalExecutions: row.total || 0,
    successRate: row.total > 0 ? Math.round(((row.success || 0) / row.total) * 10000) / 100 : 0,
    avgLatencyMs: Math.round(row.avgLat || 0),
    totalTokensConsumed: row.tokens || 0,
    last30Days: trend.map(t => ({
      date: t.date,
      executions: t.executions,
      success: t.success,
    })),
  };
}

export async function getGlobalExecutionStats() {
  const result = await db
    .select({
      total: sql<number>`sum(${executionStats.totalExecutions})`.mapWith(Number),
      success: sql<number>`sum(${executionStats.successCount})`.mapWith(Number),
      uniqueTools: sql<number>`count(distinct ${executionStats.toolId})`.mapWith(Number),
    })
    .from(executionStats);

  const row = result[0];
  const total = row?.total || 0;
  const success = row?.success || 0;
  return {
    totalExecutions: total,
    successRate: total > 0 ? Math.round((success / total) * 10000) / 100 : 0,
    uniqueTools: row?.uniqueTools || 0,
  };
}

export async function getTopToolsByExecution(limit = 10) {
  return db
    .select({
      toolId: executionStats.toolId,
      total: sql<number>`sum(${executionStats.totalExecutions})`.mapWith(Number),
      success: sql<number>`sum(${executionStats.successCount})`.mapWith(Number),
      avgLat: sql<number>`avg(${executionStats.avgLatencyMs})`.mapWith(Number),
    })
    .from(executionStats)
    .groupBy(executionStats.toolId)
    .orderBy(sql`sum(${executionStats.totalExecutions}) desc`)
    .limit(limit);
}
