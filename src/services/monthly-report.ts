// Monthly Ecosystem Report — Minor Gap #7
// Auto-generates ecosystem pulse, grade distribution, top tools, hidden gem

import { db } from "../db/index.js";
import { servers, qualityScores, tools } from "../db/schema.js";
import { sql, gte, and } from "drizzle-orm";

interface EcosystemPulse {
  newThisMonth: number;
  total: number;
  pctActive: number;
}

interface GradeDistribution {
  grade: string;
  count: number;
  pct: number;
}

interface TopTool {
  name: string;
  grade: string;
  stars: number;
  fullName: string;
  score: number;
}

interface HiddenGem {
  name: string;
  grade: string;
  stars: number;
  tokenEfficiency: number;
  fullName: string;
}

interface MonthlyReport {
  month: string;
  generatedAt: string;
  pulse: EcosystemPulse;
  gradeDistribution: GradeDistribution[];
  topTools: TopTool[];
  hiddenGem: HiddenGem | null;
  categoryTrend: { category: string; count: number }[];
}

export async function generateMonthlyReport(): Promise<MonthlyReport> {
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);

  const pulse = await getEcosystemPulse(thirtyDaysAgo);
  const gradeDist = await getGradeDistribution();
  const top = await getTopTools(ninetyDaysAgo);
  const gem = await getHiddenGem(ninetyDaysAgo);
  const categories = await getCategoryTrend(thirtyDaysAgo);

  return {
    month,
    generatedAt: now.toISOString(),
    pulse,
    gradeDistribution: gradeDist,
    topTools: top,
    hiddenGem: gem,
    categoryTrend: categories,
  };
}

async function getEcosystemPulse(since: Date): Promise<EcosystemPulse> {
  const result = await db
    .select({
      newThisMonth: sql<number>`count(*) filter (where ${servers.createdAt} >= ${since})`.mapWith(Number),
      total: sql<number>`count(*)`.mapWith(Number),
      // active = pushed within 30 days, using metadata->pushed_at or updatedAt
      active: sql<number>`count(*) filter (where ${servers.updatedAt} >= ${since})`.mapWith(Number),
    })
    .from(servers);

  const row = result[0];
  const total = row?.total || 0;
  const active = row?.active || 0;
  return {
    newThisMonth: row?.newThisMonth || 0,
    total,
    pctActive: total > 0 ? Math.round(active / total * 1000) / 10 : 0,
  };
}

async function getGradeDistribution(): Promise<GradeDistribution[]> {
  const result = await db
    .select({
      grade: qualityScores.grade,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(qualityScores)
    .groupBy(qualityScores.grade)
    .orderBy(qualityScores.grade);

  const total = result.reduce((s, r) => s + (r.count || 0), 0);

  return result
    .filter(r => r.grade)
    .map(r => ({
      grade: r.grade!,
      count: r.count || 0,
      pct: total > 0 ? Math.round((r.count || 0) / total * 1000) / 10 : 0,
    }));
}

async function getTopTools(activeSince: Date): Promise<TopTool[]> {
  const result = await db
    .select({
      name: tools.name,
      grade: qualityScores.grade,
      stars: sql<number>`coalesce((${servers.metadata}->>'stars')::int, 0)`.mapWith(Number),
      fullName: sql<string>`${servers.publisher} || '/' || ${servers.name}`.mapWith(String),
      score: qualityScores.overallScore,
    })
    .from(tools)
    .innerJoin(qualityScores, sql`${tools.id} = ${qualityScores.toolId}`)
    .innerJoin(servers, sql`${tools.serverId} = ${servers.id}`)
    .where(and(
      gte(servers.updatedAt, activeSince),
      sql`${qualityScores.overallScore} >= 80`,
      sql`coalesce((${servers.metadata}->>'stars')::int, 0) > 0`,
    ))
    .orderBy(sql`coalesce((${servers.metadata}->>'stars')::int, 0) desc`)
    .limit(3);

  return result.map(r => ({
    name: r.name,
    grade: r.grade || "?",
    stars: r.stars,
    fullName: r.fullName,
    score: Number(r.score || 0),
  }));
}

async function getHiddenGem(activeSince: Date): Promise<HiddenGem | null> {
  const result = await db
    .select({
      name: tools.name,
      grade: qualityScores.grade,
      stars: sql<number>`coalesce((${servers.metadata}->>'stars')::int, 0)`.mapWith(Number),
      tokenEfficiency: qualityScores.efficiency,
      fullName: sql<string>`${servers.publisher} || '/' || ${servers.name}`.mapWith(String),
    })
    .from(tools)
    .innerJoin(qualityScores, sql`${tools.id} = ${qualityScores.toolId}`)
    .innerJoin(servers, sql`${tools.serverId} = ${servers.id}`)
    .where(and(
      gte(servers.updatedAt, activeSince),
      sql`${qualityScores.overallScore} >= 85`,
      sql`coalesce((${servers.metadata}->>'stars')::int, 0) < 50`,
      sql`coalesce((${servers.metadata}->>'stars')::int, 0) > 0`,
    ))
    .orderBy(sql`${qualityScores.efficiency} desc`)
    .limit(1);

  if (!result[0]) return null;
  const r = result[0];
  return {
    name: r.name,
    grade: r.grade || "?",
    stars: r.stars,
    tokenEfficiency: Number(r.tokenEfficiency || 0),
    fullName: r.fullName,
  };
}

async function getCategoryTrend(since: Date): Promise<{ category: string; count: number }[]> {
  const result = await db
    .select({
      category: sql<string>`${servers.metadata}->>'category'`.mapWith(String),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(servers)
    .where(gte(servers.createdAt, since))
    .groupBy(sql`${servers.metadata}->>'category'`)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  return result.filter(r => r.category).map(r => ({
    category: r.category,
    count: r.count,
  }));
}

export function renderMonthlyReportMd(report: MonthlyReport): string {
  const distStr = report.gradeDistribution
    .map(d => `| ${d.grade} | ${d.count} | ${d.pct}% |`)
    .join("\n");

  const topStr = report.topTools
    .map((t, i) => `${["🥇", "🥈", "🥉"][i]} **${t.name}** — Grade ${t.grade}, ${t.stars}⭐ — \`${t.fullName}\``)
    .join("\n\n");

  const gemStr = report.hiddenGem
    ? `**${report.hiddenGem.name}** — Grade ${report.hiddenGem.grade}, ${report.hiddenGem.stars}⭐, Token Efficiency: ${report.hiddenGem.tokenEfficiency} — \`${report.hiddenGem.fullName}\``
    : "_No hidden gem this month_";

  return `# MCP Ecosystem Report — ${report.month}

> Generated: ${report.generatedAt}

## 📊 Ecosystem Pulse

| Metric | Value |
|--------|-------|
| New servers this month | **${report.pulse.newThisMonth}** |
| Total servers indexed | **${report.pulse.total}** |
| Active (pushed <30d) | **${report.pulse.pctActive}%** |

## 📈 Grade Distribution

| Grade | Count | % |
|-------|-------|---|
${distStr}

## 🏆 Top 3 Tools of the Month

${topStr}

## 💎 Hidden Gem

${gemStr}

## 🔥 Trending Categories

${report.categoryTrend.map(c => `- **${c.category}**: ${c.count} new`).join("\n")}

---
*Report auto-generated by [Agent Tool Intel](https://agent-tool-intel-production.up.railway.app). Methodology: [scoring/methodology](https://agent-tool-intel-production.up.railway.app/scoring/methodology).*
`;
}
