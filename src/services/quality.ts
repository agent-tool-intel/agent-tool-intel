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

  // 4. Security (15%) — basic static checks
  const security = scoreSecurity(tool, issues);

  // 5. Install Reliability (10%) — placeholder, real data from Docker builds
  const installRel = 70;

  const overallScore =
    correctness * 0.3 +
    efficiency * 0.25 +
    descriptionQ * 0.2 +
    security * 0.15 +
    installRel * 0.1;

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

function scoreCorrectness(
  tool: ToolForScoring,
  issues: QualityIssue[]
): number {
  let score = 100;

  if (!tool.inputSchema) {
    score -= 30;
    issues.push({
      type: "correctness",
      severity: "high",
      detail: "Missing input schema — agent cannot know expected parameters",
    });
  } else {
    // Check for required fields
    const schema = tool.inputSchema as Record<string, unknown>;
    if (!schema.type) {
      score -= 15;
      issues.push({
        type: "correctness",
        severity: "medium",
        detail: "Schema missing 'type' field",
      });
    }
    if (!schema.properties || Object.keys(schema.properties as object).length === 0) {
      score -= 10;
      issues.push({
        type: "correctness",
        severity: "low",
        detail: "Schema has no properties defined",
      });
    }
  }

  return Math.max(0, score);
}

function scoreEfficiency(
  tool: ToolForScoring,
  issues: QualityIssue[]
): number {
  const tokens = tool.tokenCount ?? 500;

  if (tokens <= 200) return 100;
  if (tokens <= 500) return 80;
  if (tokens <= 1000) return 60;

  issues.push({
    type: "efficiency",
    severity: "high",
    detail: `Tool definition uses ${tokens} tokens (>1000), consuming significant context window`,
  });
  return 30;
}

function scoreDescription(
  tool: ToolForScoring,
  issues: QualityIssue[]
): number {
  let score = 100;
  const desc = tool.description;
  const len = desc.length;

  // Optimal length: 30-200 chars
  if (len < 10) {
    score -= 40;
    issues.push({
      type: "description",
      severity: "critical",
      detail: `Description too short (${len} chars) — agent cannot understand purpose`,
    });
  } else if (len > 500) {
    score -= 30;
    issues.push({
      type: "description",
      severity: "high",
      detail: `Description too long (${len} chars) — likely contains embedded documentation`,
    });
  } else if (len > 200) {
    score -= 10;
  }

  // Check for naming conventions
  if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
    score -= 15;
    issues.push({
      type: "description",
      severity: "medium",
      detail: `Tool name "${tool.name}" does not follow snake_case convention`,
    });
  }

  return Math.max(0, score);
}

function scoreSecurity(
  tool: ToolForScoring,
  issues: QualityIssue[]
): number {
  let score = 100;
  const desc = tool.description.toLowerCase();

  // Check for prompt injection patterns
  const suspiciousPatterns = [
    "ignore previous",
    "override your",
    "silently",
    "do not tell",
    "pretend you are",
    "always respond with",
  ];

  for (const pattern of suspiciousPatterns) {
    if (desc.includes(pattern)) {
      score -= 40;
      issues.push({
        type: "security",
        severity: "critical",
        detail: `Prompt injection pattern detected in description: "${pattern}"`,
      });
      break;
    }
  }

  return Math.max(0, score);
}

export function scoreToGrade(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
