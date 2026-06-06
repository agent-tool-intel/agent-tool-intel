// Agent Tool Intelligence — Scoring Engine v2 (Option A: Additive Model)
// Composite = Quality(0-100) + Community Bonus(0-30) + Trust Bonus(0-20)

import type { QualityScore, QualityIssue } from "../types/index.js";

interface ToolForScoring {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown> | null;
  tokenCount: number | null;
}

export function scoreToolQuality(tool: ToolForScoring): Omit<QualityScore, "id" | "scoredAt"> {
  const issues: QualityIssue[] = [];

  // 1. Schema Correctness (25%)
  const correctness = scoreCorrectness(tool, issues);

  // 2. Token Efficiency (25%)
  const efficiency = scoreEfficiency(tool, issues);

  // 3. Description Quality (20%)
  const descriptionQ = scoreDescription(tool, issues);

  // 4. Security (15%)
  const security = scoreSecurity(tool, issues);

  // 5. Install Reliability (15%)
  const installRel = scoreInstall(tool, issues);

  const overallScore =
    correctness * 0.25 +
    efficiency * 0.25 +
    descriptionQ * 0.20 +
    security * 0.15 +
    installRel * 0.15;

  const grade = scoreToGrade(overallScore);

  return {
    toolId: tool.id,
    overallScore: Math.round(overallScore * 100) / 100,
    grade,
    correctness,
    efficiency,
    descriptionQ,
    security,
    installRel,
    issuesFound: issues,
  };
}

// ── Individual scorers ──

function scoreCorrectness(tool: ToolForScoring, issues: QualityIssue[]): number {
  if (!tool.inputSchema) return 5; // No schema = near-zero
  const schema = tool.inputSchema as Record<string, unknown>;
  let score = 60;
  if (!schema.type) { score -= 25; issues.push({ type: "correctness", severity: "high", detail: "Missing type field" }); }
  if (!schema.properties || Object.keys(schema.properties as object).length === 0) {
    score -= 15; issues.push({ type: "correctness", severity: "medium", detail: "No properties" });
  }
  if (schema.properties && Object.keys(schema.properties as object).length >= 3) { score += 20; }
  if (schema.properties && Object.keys(schema.properties as object).length >= 5) { score += 10; }
  if (schema.required) score += 15;
  return Math.max(0, Math.min(100, score));
}

function scoreEfficiency(tool: ToolForScoring, issues: QualityIssue[]): number {
  const tokens = tool.tokenCount ?? 500;
  if (tokens <= 50) return 100;
  if (tokens <= 100) return 90;
  if (tokens <= 200) return 70;
  if (tokens <= 350) return 45;
  if (tokens <= 500) return 20;
  issues.push({ type: "efficiency", severity: "critical", detail: `${tokens} tokens` });
  return 5;
}

function scoreDescription(tool: ToolForScoring, issues: QualityIssue[]): number {
  const desc = tool.description;
  const len = desc.length;
  let score = 50;
  if (len < 10) { score = 5; issues.push({ type: "description", severity: "critical", detail: "Extremely short" }); }
  else if (len < 30) { score -= 30; issues.push({ type: "description", severity: "high", detail: "Too short" }); }
  else if (len < 50) { score -= 10; }
  else if (len >= 50 && len <= 200) { score += 25; }
  else if (len > 500) { score -= 30; issues.push({ type: "description", severity: "high", detail: "Excessive length" }); }
  else if (len > 300) { score -= 10; }

  const verbs = /\b(read|write|query|search|fetch|extract|create|update|delete|list|get|post|execute|run|connect|send|download|upload|manage|control|monitor|track|analyze|generate|build|test|deploy|configure)\b/i;
  if (verbs.test(desc)) score += 15;
  else { score -= 15; issues.push({ type: "description", severity: "medium", detail: "No action verbs" }); }

  if (/^[a-z][a-z0-9_-]*$/.test(tool.name)) score += 10;
  else { score -= 15; issues.push({ type: "description", severity: "medium", detail: "Poor naming" }); }

  if (/example|usage|e\.g\.|such as|returns|output/i.test(desc)) score += 10;
  return Math.max(0, Math.min(100, score));
}

function scoreSecurity(tool: ToolForScoring, issues: QualityIssue[]): number {
  let score = 60;
  const desc = tool.description.toLowerCase();
  const critical = ["ignore previous", "override your", "silently remember", "do not tell", "pretend you are", "always respond with"];
  for (const p of critical) { if (desc.includes(p)) { score -= 60; issues.push({ type: "security", severity: "critical", detail: "Injection risk" }); return Math.max(0, score); } }
  const medium = ["without telling", "secretly", "hidden from user", "bypass", "backdoor"];
  for (const p of medium) { if (desc.includes(p)) { score -= 35; issues.push({ type: "security", severity: "high", detail: "Suspicious pattern" }); } }
  if (/security|auth|encrypt|sandbox|isolated|permission|rate.limit/i.test(desc)) score += 20;
  if (/api.key|oauth|token/i.test(desc)) score += 15;
  return Math.max(0, Math.min(100, score));
}

function scoreInstall(tool: ToolForScoring, issues: QualityIssue[]): number {
  let score = 30;
  if (/^npm:|npx /i.test(tool.name)) score += 40;
  else if (/^pypi:|pip /i.test(tool.name)) score += 40;
  else if (/^docker:|ghcr/i.test(tool.name)) score += 35;
  if (/npm install|pip install|docker pull|npx |go install|cargo install/i.test(tool.description)) score += 25;
  if (/http|sse|server/i.test(tool.description)) score += 10;
  return Math.max(0, Math.min(100, score));
}

// ── Grade Mapping ──

export function scoreToGrade(score: number): string {
  // Quality-only grade (used for quality sub-score display)
  if (score >= 85) return "A";
  if (score >= 72) return "B";
  if (score >= 58) return "C";
  if (score >= 45) return "D";
  return "F";
}

// ── Option A: Additive Composite Model ──
// Composite = Quality(0-100) + Community Bonus(0-60) + Trust Bonus(0-30)
// Range: 0-190 — wide variance from Community + Trust bonuses

export function scoreCompositeGrade(qualityScore: number, communityBonus: number, trustBonus: number): {
  composite: number;
  grade: string;
  breakdown: { quality: number; communityBonus: number; trustBonus: number };
} {
  const composite = Math.round((qualityScore + communityBonus + trustBonus) * 100) / 100;

  // 8-grade mapping — Final（2026-06-06）
  // FDC customized, C+↑ from Option 2
  let grade: string;
  if (composite >= 131) grade = "A+";
  else if (composite >= 106) grade = "A";
  else if (composite >= 86)  grade = "B+";
  else if (composite >= 76)  grade = "B";
  else if (composite >= 66)  grade = "C+";
  else if (composite >= 46)  grade = "C";
  else if (composite >= 21)  grade = "D";
  else grade = "F";

  // Quality Floor: caps max grade
  const floorMap: Array<{ minQ: number; maxGrade: string }> = [
    { minQ: 80, maxGrade: "A+" },
    { minQ: 70, maxGrade: "A" },
    { minQ: 60, maxGrade: "B+" },
    { minQ: 50, maxGrade: "B" },
    { minQ: 40, maxGrade: "C+" },
    { minQ: 30, maxGrade: "C" },
  ];
  const GRADE_ORDER = ["F", "D", "C", "C+", "B", "B+", "A", "A+"];
  for (const floor of floorMap) {
    if (qualityScore >= floor.minQ) break;
    const capIdx = GRADE_ORDER.indexOf(floor.maxGrade);
    const rawIdx = GRADE_ORDER.indexOf(grade);
    if (rawIdx > capIdx) grade = floor.maxGrade;
  }

  return { composite, grade, breakdown: { quality: qualityScore, communityBonus, trustBonus } };
}

/**
 * Community Bonus (0-60) — widened for variance
 * Stars (0-30) + Activity (0-20) + Official (0-10)
 */
export function scoreCommunity(stars: number, lastPushDaysAgo: number | null, isOfficial: boolean, isVerifiedPublisher: boolean): number {
  // Stars: 0-30 — bigger range for differentiation
  let starScore = 0;
  if (stars >= 10000) starScore = 30;
  else if (stars >= 5000) starScore = 26;
  else if (stars >= 1000) starScore = 22;
  else if (stars >= 500) starScore = 18;
  else if (stars >= 100) starScore = 14;
  else if (stars >= 50) starScore = 10;
  else if (stars >= 10) starScore = 6;
  else if (stars >= 1) starScore = 3;

  // Activity: 0-20
  let activityScore = 0;
  if (lastPushDaysAgo === null) activityScore = 5;
  else if (lastPushDaysAgo <= 30) activityScore = 20;
  else if (lastPushDaysAgo <= 180) activityScore = 10;
  else if (lastPushDaysAgo <= 365) activityScore = 5;

  // Official: 0-10
  let officialScore = 0;
  if (isOfficial && isVerifiedPublisher) officialScore = 10;
  else if (isOfficial) officialScore = 7;
  else if (isVerifiedPublisher) officialScore = 5;

  return starScore + activityScore + officialScore;
}

/**
 * Trust Bonus (0-30) — widened for variance
 * Success Rate (0-15) + Recency (0-8) + Consistency (0-7)
 * Baseline: 0 (no data = no bonus)
 */
export function scoreTrust(successRate: number | null, totalCalls: number, lastExecutionDaysAgo: number | null): number {
  if (totalCalls === 0 || successRate === null) return 0;

  const successScore = Math.round((successRate / 100) * 15);
  let recencyScore = 0;
  if (lastExecutionDaysAgo !== null && lastExecutionDaysAgo <= 7) recencyScore = 8;
  else if (lastExecutionDaysAgo !== null && lastExecutionDaysAgo <= 30) recencyScore = 4;

  let consistencyScore = 0;
  if (totalCalls >= 1000) consistencyScore = 7;
  else if (totalCalls >= 100) consistencyScore = 4;

  return Math.min(30, successScore + recencyScore + consistencyScore);
}
