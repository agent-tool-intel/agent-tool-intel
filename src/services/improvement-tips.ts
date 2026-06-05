// Improvement Tips Engine — Phase 3A Feature #13
// Rule-based MVP → LLM-powered v2 (Phase 3.5)

import type { qualityScores } from "../db/schema.js";

interface ToolScores {
  overallScore: number;
  grade: string;
  correctness: number | null;
  efficiency: number | null;
  descriptionQ: number | null;
  security: number | null;
  installRel: number | null;
}

interface ImprovementTip {
  dimension: string;
  currentScore: number;
  targetScore: number;
  tip: string;
  impact: "high" | "medium" | "low";
}

const TIPS = {
  correctness: [
    { threshold: 60, tip: "Validate input/output schema against JSON Schema spec. Tools with well-defined schemas score +20 points.", impact: "high" as const },
    { threshold: 80, tip: "Add detailed field descriptions and examples to your schema. This helps agents understand parameter intent.", impact: "medium" as const },
  ],
  efficiency: [
    { threshold: 50, tip: "Reduce token overhead: shorten tool descriptions to <200 chars, remove redundant parameters, use concise naming.", impact: "high" as const },
    { threshold: 70, tip: "Consider batching related operations into a single tool call to reduce round-trips.", impact: "medium" as const },
    { threshold: 85, tip: "Your token efficiency is strong. Benchmark against optimal token count for your tool type to reach 🥇 tier.", impact: "low" as const },
  ],
  descriptionQ: [
    { threshold: 50, tip: "Write tool descriptions for AI agents, not humans. Be specific: 'Extracts text from PDF files' vs 'PDF tool'.", impact: "high" as const },
    { threshold: 75, tip: "Add usage examples in your description. Agents learn from examples: 'Example: extract_tables(\"report.pdf\") → [{...}]'", impact: "medium" as const },
  ],
  security: [
    { threshold: 40, tip: "CRITICAL: Add authentication. 41% of MCP servers have zero auth. OAuth 2.0 or API key minimum.", impact: "high" as const },
    { threshold: 60, tip: "Implement input sanitization to prevent injection attacks. 43% of servers have command injection flaws.", impact: "high" as const },
    { threshold: 80, tip: "Add rate limiting (2.4% of servers have it). Being in the top 2.4% is a strong trust signal.", impact: "medium" as const },
  ],
  installRel: [
    { threshold: 40, tip: "Ensure your install command works in a clean environment. Test: clone your repo → run install → tool should respond.", impact: "high" as const },
    { threshold: 70, tip: "Provide fallback install methods (npx + docker + pip). Multiple install paths = less friction for diverse agent environments.", impact: "medium" as const },
  ],
};

export function generateImprovementTips(scores: ToolScores): ImprovementTip[] {
  const tips: ImprovementTip[] = [];
  const dims: Array<{ key: keyof typeof TIPS; score: number | null }> = [
    { key: "correctness", score: scores.correctness },
    { key: "efficiency", score: scores.efficiency },
    { key: "descriptionQ", score: scores.descriptionQ },
    { key: "security", score: scores.security },
    { key: "installRel", score: scores.installRel },
  ];

  for (const dim of dims) {
    if (dim.score === null) continue;
    const candidates = TIPS[dim.key];
    for (const c of candidates) {
      if (dim.score < c.threshold) {
        tips.push({
          dimension: dim.key,
          currentScore: dim.score,
          targetScore: c.threshold,
          tip: c.tip,
          impact: c.impact,
        });
        break; // One tip per dimension（the first matching = most critical）
      }
    }
  }

  // Sort: high impact first, then by current score ascending (worst first)
  return tips.sort((a, b) => {
    const impactOrder = { high: 0, medium: 1, low: 2 };
    const ia = impactOrder[a.impact];
    const ib = impactOrder[b.impact];
    if (ia !== ib) return ia - ib;
    return a.currentScore - b.currentScore;
  });
}

export function getGradeImprovementPath(currentGrade: string): string {
  const gradeMap: Record<string, { next: string; need: number }> = {
    "F": { next: "D", need: 60 },
    "D": { next: "C", need: 70 },
    "C": { next: "B", need: 80 },
    "B": { next: "A", need: 88 },
    "A": { next: "A+", need: 95 },
  };

  const path = gradeMap[currentGrade];
  if (!path) return "You're at the top. Maintain excellence to stay here.";

  return `To reach Grade ${path.next}: improve overall score to ≥${path.need}. Focus on your lowest-scoring dimensions first.`;
}

export function renderTipsMarkdown(tips: ImprovementTip[], gradePath: string): string {
  if (tips.length === 0) {
    return `## 📈 Improvement Tips\n\nNo critical improvements needed. All dimensions are above threshold.\n\n${gradePath}`;
  }

  const high = tips.filter(t => t.impact === "high");
  const med = tips.filter(t => t.impact === "medium");
  const low = tips.filter(t => t.impact === "low");

  let md = "## 📈 Improvement Tips\n\n";
  md += `${gradePath}\n\n`;

  if (high.length) {
    md += "### 🔴 Critical\n\n";
    high.forEach(t => {
      md += `- **${t.dimension}** (${t.currentScore}→${t.targetScore}): ${t.tip}\n`;
    });
    md += "\n";
  }

  if (med.length) {
    md += "### 🟡 Recommended\n\n";
    med.forEach(t => {
      md += `- **${t.dimension}** (${t.currentScore}→${t.targetScore}): ${t.tip}\n`;
    });
    md += "\n";
  }

  if (low.length) {
    md += "### 🟢 Fine-tuning\n\n";
    low.forEach(t => {
      md += `- **${t.dimension}** (${t.currentScore}→${t.targetScore}): ${t.tip}\n`;
    });
    md += "\n";
  }

  return md;
}
