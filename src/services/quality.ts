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
  if (!tool.inputSchema) {
    issues.push({
      type: "correctness", severity: "medium",
      detail: "No input schema detected — agent must rely on description alone",
    });
    return 50;
  }

  let score = 70;
  const schema = tool.inputSchema as Record<string, unknown>;

  if (!schema.type) {
    score -= 15;
    issues.push({ type: "correctness", severity: "medium", detail: "Schema missing 'type' field" });
  }

  if (!schema.properties || Object.keys(schema.properties as object).length === 0) {
    score -= 10;
    issues.push({ type: "correctness", severity: "low", detail: "Schema has no properties" });
  }

  if (schema.properties && Object.keys(schema.properties as object).length >= 2) {
    score += 15;
    if (schema.required) score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

function scoreEfficiency(tool: ToolForScoring, issues: QualityIssue[]): number {
  const tokens = tool.tokenCount ?? 500;
  if (tokens <= 80) return 100;
  if (tokens <= 150) return 85;
  if (tokens <= 250) return 70;
  if (tokens <= 400) return 55;
  if (tokens <= 600) return 40;
  issues.push({ type: "efficiency", severity: "high", detail: `${tokens} tokens — consumes significant context` });
  return 25;
}

function scoreDescription(tool: ToolForScoring, issues: QualityIssue[]): number {
  let score = 65;
  const desc = tool.description;
  const len = desc.length;

  if (len < 20) {
    score -= 40;
    issues.push({ type: "description", severity: "critical", detail: `Too short (${len} chars)` });
  } else if (len < 50) {
    score -= 15;
    issues.push({ type: "description", severity: "low", detail: `Short (${len} chars)` });
  } else if (len >= 50 && len <= 200) {
    score += 15;
  } else if (len > 400) {
    score -= 20;
    issues.push({ type: "description", severity: "medium", detail: `Too long (${len} chars)` });
  }

  const actionVerbs = /\b(read|write|query|search|fetch|extract|create|update|delete|list|get|post|execute|run|connect|send|download|upload|manage|control|monitor|track|analyze|generate|build|test|deploy|configure|install|parse|convert|transform|validate|check|verify|scan|audit|optimize|schedule|notify|alert)\b/i;
  if (actionVerbs.test(desc)) { score += 10; }
  else { score -= 5; issues.push({ type: "description", severity: "low", detail: "No action verbs" }); }

  if (/^[a-z][a-z0-9_]*$/.test(tool.name)) { score += 5; }
  else { score -= 10; issues.push({ type: "description", severity: "medium", detail: `Name "${tool.name}" should use snake_case` }); }

  if (/example|usage|e\.g\.|such as|like|for instance/i.test(desc)) { score += 5; }

  return Math.max(0, Math.min(100, score));
}

function scoreSecurity(tool: ToolForScoring, issues: QualityIssue[]): number {
  let score = 75;
  const desc = tool.description.toLowerCase();

  const criticalPatterns = ["ignore previous", "override your", "silently remember", "do not tell", "pretend you are", "always respond with"];
  for (const pattern of criticalPatterns) {
    if (desc.includes(pattern)) {
      score -= 50;
      issues.push({ type: "security", severity: "critical", detail: `Prompt injection: "${pattern}"` });
      return Math.max(0, score);
    }
  }

  const mediumPatterns = ["without telling", "secretly", "hidden from user", "bypass", "backdoor"];
  for (const pattern of mediumPatterns) {
    if (desc.includes(pattern)) { score -= 25; issues.push({ type: "security", severity: "high", detail: `Suspicious: "${pattern}"` }); }
  }

  if (/security|auth|authenticate|encrypt|sandbox|isolated|permission/i.test(desc)) { score += 10; }
  return Math.max(0, Math.min(100, score));
}

function scoreInstall(tool: ToolForScoring, issues: QualityIssue[]): number {
  let score = 50;
  if (/^npm:|npx /i.test(tool.name)) { score += 20; }
  else if (/^pypi:|pip /i.test(tool.name)) { score += 20; }
  if (/npm install|pip install|docker pull|npx |go install/i.test(tool.description)) { score += 15; }
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
// Composite = Quality(0-100) + Community Bonus(0-30) + Trust Bonus(0-20)
// Range: 0-150 — natural variance from Quality alone

export function scoreCompositeGrade(qualityScore: number, communityBonus: number, trustBonus: number): {
  composite: number;
  grade: string;
  breakdown: { quality: number; communityBonus: number; trustBonus: number };
} {
  const composite = Math.round((qualityScore + communityBonus + trustBonus) * 100) / 100;

  // 8-grade mapping — calibrated to Additive Model score distribution
  let grade: string;
  if (composite >= 95) grade = "A+";
  else if (composite >= 85) grade = "A";
  else if (composite >= 78) grade = "B+";
  else if (composite >= 70) grade = "B";
  else if (composite >= 62) grade = "C+";
  else if (composite >= 54) grade = "C";
  else if (composite >= 45) grade = "D";
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
 * Community Bonus (0-30)
 * Stars (0-15) + Activity (0-10) + Official (0-5)
 */
export function scoreCommunity(stars: number, lastPushDaysAgo: number | null, isOfficial: boolean, isVerifiedPublisher: boolean): number {
  // Stars: 0-15
  let starScore = 0;
  if (stars >= 10000) starScore = 15;
  else if (stars >= 1000) starScore = 13;
  else if (stars >= 500) starScore = 11;
  else if (stars >= 100) starScore = 9;
  else if (stars >= 50) starScore = 7;
  else if (stars >= 10) starScore = 5;
  else if (stars >= 1) starScore = 3;

  // Activity: 0-10
  let activityScore = 0;
  if (lastPushDaysAgo === null) activityScore = 3;
  else if (lastPushDaysAgo <= 30) activityScore = 10;
  else if (lastPushDaysAgo <= 180) activityScore = 6;
  else if (lastPushDaysAgo <= 365) activityScore = 3;

  // Official: 0-5
  let officialScore = 0;
  if (isOfficial && isVerifiedPublisher) officialScore = 5;
  else if (isOfficial) officialScore = 4;
  else if (isVerifiedPublisher) officialScore = 3;

  return starScore + activityScore + officialScore;
}

/**
 * Trust Bonus (0-20)
 * Success Rate (0-10) + Recency (0-5) + Consistency (0-5)
 * Baseline: 0 (no data = no bonus, not penalty)
 */
export function scoreTrust(successRate: number | null, totalCalls: number, lastExecutionDaysAgo: number | null): number {
  // No real execution data → no bonus (not a penalty)
  if (totalCalls === 0 || successRate === null) return 0;

  const successScore = Math.round((successRate / 100) * 10);
  let recencyScore = 0;
  if (lastExecutionDaysAgo !== null && lastExecutionDaysAgo <= 7) recencyScore = 5;
  else if (lastExecutionDaysAgo !== null && lastExecutionDaysAgo <= 30) recencyScore = 3;

  let consistencyScore = 0;
  if (totalCalls >= 1000) consistencyScore = 5;
  else if (totalCalls >= 100) consistencyScore = 3;

  return Math.min(20, successScore + recencyScore + consistencyScore);
}
