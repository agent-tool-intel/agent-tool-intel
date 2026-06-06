// Recalculate grades: Additive Model with Min-Max normalization
// Normalizes quality scores to 0-100 range → guaranteed spread

import { db } from "../src/db/index.js";
import { servers, tools, qualityScores } from "../src/db/schema.js";
import { scoreCompositeGrade, scoreCommunity, scoreTrust, scoreToolQuality } from "../src/services/quality.js";
import { eq, sql } from "drizzle-orm";

async function main() {
  console.log("Recalculating grades (Additive + Normalized)...\n");

  const allTools = await db
    .select({ toolId: tools.id, toolName: tools.name, toolDesc: tools.description, toolSchema: tools.inputSchema, toolTokens: tools.tokenCount, metadata: servers.metadata })
    .from(tools).innerJoin(servers, eq(tools.serverId, servers.id)).innerJoin(qualityScores, eq(tools.id, qualityScores.toolId));

  console.log(`Found ${allTools.length} tools\n`);

  // Step 1: Compute raw quality scores
  const raw: Array<{ toolId: string; q: number; meta: any; name: string }> = [];
  for (const row of allTools) {
    const q = scoreToolQuality({ id: row.toolId, name: row.toolName, description: row.toolDesc, inputSchema: row.toolSchema as Record<string, unknown> | null, tokenCount: row.toolTokens });
    raw.push({ toolId: row.toolId, q: q.overallScore, meta: (row.metadata || {}) as Record<string, any>, name: row.toolName });
  }

  // Step 2: Min-Max normalize quality scores to 0-100
  const qMin = Math.min(...raw.map(r => r.q));
  const qMax = Math.max(...raw.map(r => r.q));
  console.log(`Quality raw: min=${qMin.toFixed(1)} max=${qMax.toFixed(1)} range=${(qMax-qMin).toFixed(1)}\n`);

  // Step 3: Compute final composite with bonuses
  const distribution: Record<string, number> = {};
  const updates: Array<{ toolId: string; overallScore: string; grade: string }> = [];

  for (const r of raw) {
    // Normalize quality to 0-100
    const qNorm = qMax > qMin ? ((r.q - qMin) / (qMax - qMin)) * 100 : 50;

    const meta = r.meta;
    const stars = meta?.stars || 0;
    const pushedAt = meta?.pushed_at;
    const lastPush = pushedAt ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / 86400000) : null;
    const c = scoreCommunity(stars, lastPush, meta?.is_official || false, meta?.is_verified_publisher || false);
    const totalCalls = meta?.total_calls || 0;
    const t = scoreTrust(meta?.success_rate || null, totalCalls, null);
    const { composite, grade } = scoreCompositeGrade(qNorm, c, t);

    updates.push({ toolId: r.toolId, overallScore: qNorm.toFixed(1), grade });
    distribution[grade] = (distribution[grade] || 0) + 1;

    if (updates.length >= 500) { await batchUpdate(updates.splice(0, 500)); }
  }
  if (updates.length > 0) await batchUpdate(updates);

  console.log(`Updated ${allTools.length} tools\n`);
  console.log("Final Grade Distribution:");
  for (const g of ["A+","A","B+","B","C+","C","D","F"]) {
    const count = distribution[g] || 0;
    const pct = ((count / allTools.length) * 100).toFixed(1);
    console.log(`  ${g.padEnd(3)} ${count.toLocaleString().padStart(8)} (${pct}%) ${"█".repeat(Math.round(count/allTools.length*50))}`);
  }
  console.log("\nDone.");
}

async function batchUpdate(batch: Array<{ toolId: string; overallScore: string; grade: string }>) {
  const values = batch.map(b => `('${b.toolId}', ${b.overallScore}, '${b.grade}')`).join(", ");
  await db.execute(sql.raw(`UPDATE quality_scores AS qs SET overall_score = v.overall_score, grade = v.grade, scored_at = NOW() FROM (VALUES ${values}) AS v(tool_id, overall_score, grade) WHERE qs.tool_id = v.tool_id::uuid`));
}

main().catch(e => { console.error("Migration failed:", e); process.exit(1); });
