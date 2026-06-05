// Phase 3 Routes — Execution Tracking + Analytics + Tips

import { Hono } from "hono";
import { recordExecution, getExecutionSummary, getGlobalExecutionStats } from "../services/execution-tracker.js";
import { generateMonthlyReport, renderMonthlyReportMd } from "../services/monthly-report.js";
import { generateImprovementTips, getGradeImprovementPath, renderTipsMarkdown } from "../services/improvement-tips.js";
import { calculateTokenSavings, renderTokenSavingsMd, renderToolTokenEfficiency } from "../services/token-calculator.js";
import { getCompatibilityMatrix, renderCompatibilityMd } from "../services/compatibility-matrix.js";
import { executeToolById, qualityDrivenExecute } from "../services/http-proxy-executor.js";
import { db } from "../db/index.js";
import { qualityScores, tools, servers, executionStats as execStatsTable } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const phase3Route = new Hono();

// ── Execution Tracking ──

// POST /api/v1/execution/record
phase3Route.post("/execution/record", async (c) => {
  const body = await c.req.json();
  const { toolId, success, latencyMs, tokensConsumed, errorMessage, agentId, partnerSource } = body;

  if (!toolId || success === undefined || latencyMs === undefined) {
    return c.json({ error: "toolId, success, and latencyMs are required" }, 400);
  }

  await recordExecution({ toolId, success, latencyMs, tokensConsumed, errorMessage, agentId, partnerSource });
  return c.json({ recorded: true });
});

// GET /api/v1/execution/stats/:toolId
phase3Route.get("/execution/stats/:toolId", async (c) => {
  const summary = await getExecutionSummary(c.req.param("toolId"));
  if (!summary) {
    return c.json({ error: "No execution data for this tool" }, 404);
  }
  return c.json(summary);
});

// GET /api/v1/execution/stats (global)
phase3Route.get("/execution/stats", async (c) => {
  const stats = await getGlobalExecutionStats();
  return c.json(stats);
});

// ── Monthly Report ──

// GET /api/v1/report/monthly
phase3Route.get("/report/monthly", async (c) => {
  const report = await generateMonthlyReport();
  const format = c.req.query("format") || "json";
  if (format === "md" || format === "markdown") {
    return c.text(renderMonthlyReportMd(report), 200, { "Content-Type": "text/markdown" });
  }
  return c.json(report);
});

// ── Improvement Tips ──

// GET /api/v1/tools/:toolId/tips
phase3Route.get("/tools/:toolId/tips", async (c) => {
  const toolId = c.req.param("toolId");

  const result = await db
    .select({
      overall: qualityScores.overallScore,
      grade: qualityScores.grade,
      correctness: qualityScores.correctness,
      efficiency: qualityScores.efficiency,
      descriptionQ: qualityScores.descriptionQ,
      security: qualityScores.security,
      installRel: qualityScores.installRel,
    })
    .from(qualityScores)
    .where(eq(qualityScores.toolId, toolId))
    .limit(1);

  if (!result[0]) {
    return c.json({ error: "No quality scores for this tool" }, 404);
  }

  const scores = result[0];
  const tips = generateImprovementTips({
    overallScore: Number(scores.overall || 0),
    grade: scores.grade || "?",
    correctness: scores.correctness ? Number(scores.correctness) : null,
    efficiency: scores.efficiency ? Number(scores.efficiency) : null,
    descriptionQ: scores.descriptionQ ? Number(scores.descriptionQ) : null,
    security: scores.security ? Number(scores.security) : null,
    installRel: scores.installRel ? Number(scores.installRel) : null,
  });

  const gradePath = getGradeImprovementPath(scores.grade || "C");

  const format = c.req.query("format") || "json";
  if (format === "md" || format === "markdown") {
    return c.text(renderTipsMarkdown(tips, gradePath), 200, { "Content-Type": "text/markdown" });
  }

  return c.json({ grade: scores.grade, gradePath, tips });
});

// ── Token Calculator ──

// GET /api/v1/tools/:toolId/tokens
phase3Route.get("/tools/:toolId/tokens", async (c) => {
  const toolId = c.req.param("toolId");
  const monthly = parseInt(c.req.query("monthly") || "1000");

  // Get tool token count and success rate
  const result = await db
    .select({
      name: tools.name,
      tokenCount: tools.tokenCount,
      successRate: qualityScores.efficiency,
    })
    .from(tools)
    .leftJoin(qualityScores, eq(tools.id, qualityScores.toolId))
    .where(eq(tools.id, toolId))
    .limit(1);

  if (!result[0]) {
    return c.json({ error: "Tool not found" }, 404);
  }

  const { name, tokenCount } = result[0];
  const efficiencyTier = renderToolTokenEfficiency(name, tokenCount, null);
  const comparison = calculateTokenSavings(monthly, 85); // default 85% success

  const format = c.req.query("format") || "json";
  if (format === "md" || format === "markdown") {
    return c.text(
      `# ⚡ ${name}\n\n**Token Efficiency Tier:** ${efficiencyTier.emoji} ${efficiencyTier.label}\n\n` +
      renderTokenSavingsMd(comparison, monthly),
      200,
      { "Content-Type": "text/markdown" }
    );
  }

  return c.json({ toolName: name, efficiencyTier, comparison });
});

// ── Compatibility Matrix ──

// GET /api/v1/tools/:toolId/compatibility
phase3Route.get("/tools/:toolId/compatibility", async (c) => {
  const toolId = c.req.param("toolId");

  const result = await db
    .select({ installType: tools.sideEffects })
    .from(tools)
    .where(eq(tools.id, toolId))
    .limit(1);

  // Use install type from server metadata — for MVP, map sideEffects field
  const installType = "npx"; // Default; in production, read from server.installType

  const format = c.req.query("format") || "json";
  if (format === "md" || format === "markdown") {
    return c.text(renderCompatibilityMd(installType), 200, { "Content-Type": "text/markdown" });
  }

  return c.json({ toolId, installType, compatible: getCompatibilityMatrix(installType) });
});

// ── Execution Gateway ──

// POST /api/v1/execute/proxy
phase3Route.post("/execute/proxy", async (c) => {
  const body = await c.req.json();
  const { toolId, params, agentId } = body;
  if (!toolId) return c.json({ error: "toolId is required" }, 400);
  const result = await executeToolById(toolId, params, agentId);
  return c.json(result, result.success ? 200 : 502);
});

// POST /api/v1/execute/quality
phase3Route.post("/execute/quality", async (c) => {
  const body = await c.req.json();
  const { query, params, agentId } = body;
  if (!query) return c.json({ error: "query is required" }, 400);
  const result = await qualityDrivenExecute(query, params, agentId);
  return c.json(result, result.success ? 200 : 502);
});

// ── Badge v2（with execution count）──

phase3Route.get("/badge/v2/:toolId", async (c) => {
  const toolId = decodeURIComponent(c.req.param("toolId"));

  const [serverResult] = await Promise.all([
    db.select({
      grade: qualityScores.grade,
      score: qualityScores.overallScore,
      serverName: servers.name,
    })
    .from(servers)
    .innerJoin(tools, eq(tools.serverId, servers.id))
    .innerJoin(qualityScores, eq(tools.id, qualityScores.toolId))
    .where(eq(servers.name, toolId))
    .limit(1),
  ]);

  const result = serverResult[0];
  const grade = result?.grade || "N/A";
  const serverName = result?.serverName || toolId;

  // Try to get execution count
  let execCount = 0;
  try {
    const toolRows = await db
      .select({ id: tools.id })
      .from(tools)
      .innerJoin(servers, eq(tools.serverId, servers.id))
      .where(eq(servers.name, toolId))
      .limit(1);
    if (toolRows[0]) {
      const execResult = await db
        .select({ total: execStatsTable.totalExecutions })
        .from(execStatsTable)
        .where(eq(execStatsTable.toolId, toolRows[0].id))
        .limit(1);
      if (execResult[0]) execCount = execResult[0].total;
    }
  } catch { /* table may not exist yet */ }

  const colors: Record<string, { bg: string; text: string }> = {
    "A+": { bg: "#28a745", text: "#fff" },
    "A":  { bg: "#28a745", text: "#fff" },
    "B+": { bg: "#6c75e3", text: "#fff" },
    "B":  { bg: "#6c75e3", text: "#fff" },
    "C":  { bg: "#ffab00", text: "#000" },
    "D":  { bg: "#dc3545", text: "#fff" },
    "F":  { bg: "#dc3545", text: "#fff" },
  };
  const color = colors[grade.replace(/\+/g, "+")] || colors["C"]!;

  const labelWidth = 125, gradeWidth = 45;
  const showExec = execCount > 0;
  const execWidth = showExec ? 65 : 0;
  const totalWidth = labelWidth + gradeWidth + execWidth;
  const execText = execCount >= 1000 ? (execCount / 1000).toFixed(1) + "k exec" : execCount + " exec";

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + totalWidth + '" height="20">',
    '<rect width="' + totalWidth + '" height="20" rx="4" fill="#333"/>',
    '<rect width="' + labelWidth + '" height="20" rx="4" fill="#555"/>',
    '<rect x="' + (labelWidth - 4) + '" width="' + (gradeWidth + 4) + '" height="20" rx="4" fill="' + color.bg + '"/>',
    '<rect x="4" y="0" width="' + (labelWidth - 4) + '" height="20" rx="4" fill="#555"/>',
    '<text x="' + (labelWidth / 2) + '" y="14" font-family="system-ui,sans-serif" font-size="11" fill="#ccc" text-anchor="middle" font-weight="600">agent tool intel</text>',
    '<text x="' + (labelWidth + gradeWidth / 2) + '" y="14" font-family="system-ui,sans-serif" font-size="11" fill="' + color.text + '" text-anchor="middle" font-weight="800">' + grade + '</text>',
    showExec
      ? '<rect x="' + (labelWidth + gradeWidth) + '" y="0" width="' + execWidth + '" height="20" rx="4" fill="#1a1a2e"/><text x="' + (labelWidth + gradeWidth + execWidth / 2) + '" y="14" font-family="system-ui,sans-serif" font-size="10" fill="#8b949e" text-anchor="middle">' + execText + '</text>'
      : '',
    '</svg>',
  ].join("");

  return c.html(svg, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=3600",
  });
});
