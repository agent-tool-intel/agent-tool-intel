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

  // 1. Schema Correctness (30%)
  const correctness = scoreCorrectness(tool, issues);

  // 2. Token Efficiency (25%)
  const efficiency = scoreEfficiency(tool, issues);

  // 3. Description Quality (20%)
  const descriptionQ = scoreDescription(tool, issues);

  // 4. Security (15%)
  const security = scoreSecurity(tool, issues);

  // 5. Install Reliability (10%)
  const installRel = scoreInstall(tool, issues);

  const overallScore =
    correctness * 0.30 +
    efficiency * 0.25 +
    descriptionQ * 0.20 +
    security * 0.15 +
    installRel * 0.10;

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
  // Aim for: ~5% A, ~25% B, ~45% C, ~25% D/F
  // Calibrated against 19K tool population
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 72) return "B+";
  if (score >= 64) return "B";
  if (score >= 52) return "C";
  if (score >= 38) return "D";
  return "F";
}
