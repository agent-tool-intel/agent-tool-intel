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

function scoreCorrectness(tool: ToolForScoring, issues: QualityIssue[]): number {
  if (!tool.inputSchema) {
    issues.push({
      type: "correctness",
      severity: "medium",
      detail: "No input schema detected — agent must rely on description alone",
    });
    return 50; // Neutral — many MCP tools use natural language params, not JSON Schema
  }

  let score = 70;
  const schema = tool.inputSchema as Record<string, unknown>;

  if (!schema.type) {
    score -= 15;
    issues.push({ type: "correctness", severity: "medium", detail: "Schema missing 'type' field" });
  }

  if (!schema.properties || Object.keys(schema.properties as object).length === 0) {
    score -= 10;
    issues.push({ type: "correctness", severity: "low", detail: "Schema has no properties — may use implicit parameters" });
  }

  if (schema.properties && Object.keys(schema.properties as object).length >= 2) {
    score += 15;
    if (schema.required) score += 10; // Well-structured
  }

  return Math.max(0, Math.min(100, score));
}

function scoreEfficiency(tool: ToolForScoring, issues: QualityIssue[]): number {
  const tokens = tool.tokenCount ?? 500; // Default to moderate

  // Much tighter thresholds
  if (tokens <= 80) return 100;       // Extremely efficient
  if (tokens <= 150) return 85;        // Very efficient
  if (tokens <= 250) return 70;        // Efficient
  if (tokens <= 400) return 55;        // Acceptable
  if (tokens <= 600) return 40;        // Heavy

  issues.push({ type: "efficiency", severity: "high", detail: `${tokens} tokens — consumes significant context` });
  return 25; // Very heavy
}

function scoreDescription(tool: ToolForScoring, issues: QualityIssue[]): number {
  let score = 65; // Start slightly above neutral
  const desc = tool.description;
  const len = desc.length;

  // Length
  if (len < 20) {
    score -= 40;
    issues.push({ type: "description", severity: "critical", detail: `Too short (${len} chars) — agent cannot understand purpose` });
  } else if (len < 50) {
    score -= 15;
    issues.push({ type: "description", severity: "low", detail: `Short (${len} chars) — could use more detail` });
  } else if (len >= 50 && len <= 200) {
    score += 15; // Optimal length
  } else if (len > 400) {
    score -= 20;
    issues.push({ type: "description", severity: "medium", detail: `Too long (${len} chars) — likely embedded documentation` });
  }

  // Action verbs check (more strict)
  const actionVerbs = /\b(read|write|query|search|fetch|extract|create|update|delete|list|get|post|execute|run|connect|send|download|upload|manage|control|monitor|track|analyze|generate|build|test|deploy|configure|install|parse|convert|transform|validate|check|verify|scan|audit|optimize|schedule|notify|alert)\b/i;
  if (actionVerbs.test(desc)) {
    score += 10;
  } else {
    score -= 5;
    issues.push({ type: "description", severity: "low", detail: "No clear action verbs — what does this tool actually do?" });
  }

  // Naming convention
  if (/^[a-z][a-z0-9_]*$/.test(tool.name)) {
    score += 5;
  } else {
    score -= 10;
    issues.push({ type: "description", severity: "medium", detail: `Name "${tool.name}" should use snake_case` });
  }

  // Has concrete examples in description?
  if (/example|usage|e\.g\.|such as|like|for instance/i.test(desc)) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

function scoreSecurity(tool: ToolForScoring, issues: QualityIssue[]): number {
  let score = 75; // Start neutral
  const desc = tool.description.toLowerCase();

  // Critical: prompt injection patterns
  const criticalPatterns = ["ignore previous", "override your", "silently remember", "do not tell", "pretend you are", "always respond with"];
  for (const pattern of criticalPatterns) {
    if (desc.includes(pattern)) {
      score -= 50;
      issues.push({ type: "security", severity: "critical", detail: `Prompt injection detected: "${pattern}"` });
      return Math.max(0, score);
    }
  }

  // Medium concern patterns
  const mediumPatterns = ["without telling", "secretly", "hidden from user", "bypass", "backdoor"];
  for (const pattern of mediumPatterns) {
    if (desc.includes(pattern)) {
      score -= 25;
      issues.push({ type: "security", severity: "high", detail: `Suspicious pattern: "${pattern}"` });
    }
  }

  // Has explicit security mention = good sign
  if (/security|auth|authenticate|encrypt|sandbox|isolated|permission/i.test(desc)) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

function scoreInstall(tool: ToolForScoring, issues: QualityIssue[]): number {
  // Can't know install method without metadata — start lower
  // The ingestion pipeline provides installCmd and installType
  // If we're here without that data, score is uncertain
  let score = 50;

  // Name might indicate install method
  if (/^npm:|npx /i.test(tool.name)) {
    score += 20;
  } else if (/^pypi:|pip /i.test(tool.name)) {
    score += 20;
  }

  // Description mentions install
  if (/npm install|pip install|docker pull|npx |go install/i.test(tool.description)) {
    score += 15;
  }

  return Math.max(0, Math.min(100, score));
}

export function scoreToGrade(score: number): string {
  // 8-grade mapping (2026-06-06)
  // Designed for natural distribution via weighted composite
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 58) return "B";
  if (score >= 48) return "C+";
  if (score >= 38) return "C";
  if (score >= 35) return "D";
  return "F";
}

/**
 * Composite Grade = Quality(35%) + Community(35%) + Trust(30%)
 * With Quality Floor: popular tools can't outrank quality excellence
 */
export function scoreCompositeGrade(qualityScore: number, communityScore: number, trustScore: number): {
  composite: number;
  grade: string;
  qualityFloorCap: string | null;
  breakdown: { quality: number; community: number; trust: number };
} {
  const composite = Math.round(
    (qualityScore * 0.35 + communityScore * 0.35 + trustScore * 0.30) * 100
  ) / 100;

  const rawGrade = scoreToGrade(composite);

  // Quality Floor: caps maximum grade based on quality score
  let qualityFloorCap: string | null = null;
  let grade = rawGrade;

  const floorMap: Array<{ minQuality: number; maxGrade: string }> = [
    { minQuality: 80, maxGrade: "A+" },   // Quality ≥ 80 → no cap
    { minQuality: 70, maxGrade: "A" },     // Quality ≥ 70 → can reach A
    { minQuality: 60, maxGrade: "B+" },    // Quality ≥ 60 → can reach B+
    { minQuality: 50, maxGrade: "B" },     // Quality ≥ 50 → can reach B
    { minQuality: 40, maxGrade: "C+" },    // Quality ≥ 40 → can reach C+
    { minQuality: 30, maxGrade: "C" },     // Quality ≥ 30 → can reach C
  ];

  const GRADE_ORDER = ["F", "D", "C", "C+", "B", "B+", "A", "A+"];

  for (const floor of floorMap) {
    if (qualityScore >= floor.minQuality) break; // Quality passes this floor
    // Quality too low → cap applies
    const capIndex = GRADE_ORDER.indexOf(floor.maxGrade);
    const rawIndex = GRADE_ORDER.indexOf(rawGrade);
    if (rawIndex > capIndex) {
      grade = floor.maxGrade;
      qualityFloorCap = floor.maxGrade;
      break;
    }
  }

  return {
    composite,
    grade,
    qualityFloorCap,
    breakdown: { quality: qualityScore, community: communityScore, trust: trustScore },
  };
}

/**
 * Calculate Trust Score
 * Success Rate (0-40) + Recency (0-30) + Consistency (0-30)
 * IMPORTANT: Baseline is 40 — all tools start here, rise with real data
 */
export function scoreTrust(successRate: number | null, totalCalls: number, lastExecutionDaysAgo: number | null): number {
  // If no real execution data → baseline 40 (tool gets benefit of doubt)
  if (totalCalls === 0 || successRate === null) return 40;

  // Success rate: scale from baseline
  const successScore = Math.round((successRate / 100) * 40);

  // Recency: recent executions matter
  let recencyScore = 0;
  if (lastExecutionDaysAgo === null) recencyScore = 10;
  else if (lastExecutionDaysAgo <= 7) recencyScore = 30;
  else if (lastExecutionDaysAgo <= 30) recencyScore = 20;
  else if (lastExecutionDaysAgo <= 90) recencyScore = 10;

  // Consistency: variance proxy — starts higher
  let consistencyScore = 25; // baseline
  if (totalCalls >= 1000) consistencyScore = 30;
  else if (totalCalls >= 100) consistencyScore = 28;
  else if (totalCalls >= 10) consistencyScore = 25;

  return Math.min(100, Math.round(successScore + recencyScore + consistencyScore));
}

/**
 * Calculate Community Score from agent signals
 * Stars (log scale, 0-50) + Activity (0-30) + Official (tiered, 0-20)
 * Floor: 10 for any active tool (agents need to see some community signal)
 */
export function scoreCommunity(stars: number, lastPushDaysAgo: number | null, isOfficial: boolean, isVerifiedPublisher: boolean): number {
  // Stars: log scale — slightly more generous at low end
  let starScore = 0;
  if (stars >= 10000) starScore = 50;
  else if (stars >= 1000) starScore = 45;
  else if (stars >= 500) starScore = 40;
  else if (stars >= 100) starScore = 32;
  else if (stars >= 50) starScore = 25;
  else if (stars >= 10) starScore = 18;
  else if (stars >= 5) starScore = 12;
  else if (stars >= 1) starScore = 8;

  // Activity: time since last push
  let activityScore = 0;
  if (lastPushDaysAgo === null) activityScore = 10; // unknown → give some credit
  else if (lastPushDaysAgo <= 30) activityScore = 30;
  else if (lastPushDaysAgo <= 180) activityScore = 20;
  else if (lastPushDaysAgo <= 365) activityScore = 10;
  // > 365 = abandoned = 0

  // Official: tiered
  let officialScore = 0;
  if (isOfficial && isVerifiedPublisher) officialScore = 20;
  else if (isOfficial) officialScore = 15;
  else if (isVerifiedPublisher) officialScore = 10;

  // Floor: 10 for any active tool, 5 for any tool
  const raw = starScore + activityScore + officialScore;
  if (raw < 5) return 5;
  return Math.min(100, raw);
}
