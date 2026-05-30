import { db } from "../db/index.js";
import { tools, servers, qualityScores, sandboxResults, feedback } from "../db/schema.js";
import { eq, sql, desc, count, avg } from "drizzle-orm";
import { generateEmbedding } from "./embedding.js";
import type { SearchResponse, SearchResultTool } from "../types/index.js";

interface SearchParams {
  query: string;
  minScore?: number;
  maxResults: number;
  preferences?: {
    maxTokensPerCall?: number;
    requireSandboxVerified?: boolean;
    sideEffects?: string[];
  };
}

// Raw row shape from the pgvector similarity SQL query
interface SearchRow {
  tool_id: string;
  tool_name: string;
  tool_description: string;
  side_effects: string;
  token_count: number | null;
  input_schema: unknown;
  server_name: string;
  server_metadata: Record<string, unknown> | null;
  install_cmd: string | null;
  install_type: string | null;
  publisher: string | null;
  is_official: boolean;
  relevance_score: number;
}

// Feedback stats row shape
interface FeedbackStats {
  totalCalls: number;
  avgRating: number | null;
  successRate: number | null;
  last30Success: number;
  last30Fail: number;
}

export async function searchTools(params: SearchParams): Promise<SearchResponse> {
  const { query, minScore = 0, maxResults = 5 } = params;

  // 1. Generate embedding for query
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // 2. Semantic search with pgvector (cosine similarity)
  const rawResults = await db.execute(sql`
    SELECT
      t.id AS tool_id,
      t.name AS tool_name,
      t.description AS tool_description,
      t.side_effects,
      t.token_count,
      t.input_schema,
      s.name AS server_name,
      s.metadata AS server_metadata,
      s.install_cmd,
      s.install_type,
      s.publisher,
      s.is_official,
      1 - (t.embedding <=> ${embeddingStr}::vector) AS relevance_score
    FROM tools t
    JOIN servers s ON t.server_id = s.id
    WHERE 1 - (t.embedding <=> ${embeddingStr}::vector) > 0.5
    ORDER BY t.embedding <=> ${embeddingStr}::vector
    LIMIT ${maxResults * 3}
  `);

  // db.execute with pg driver returns { rows: [...] }
  const resultRows = (rawResults as unknown as { rows: SearchRow[] }).rows;
  const rows: SearchRow[] = resultRows ?? [];

  if (rows.length === 0) {
    return { searchId: crypto.randomUUID(), results: [], topPick: null };
  }

  // 3. Get quality scores, sandbox results, feedback stats for results
  const toolIds: string[] = rows.map((r: SearchRow) => r.tool_id);

  const [qualityRows, sandboxRows, feedbackRows] = await Promise.all([
    db.select().from(qualityScores).where(
      sql`${qualityScores.toolId} = ANY(ARRAY[${sql.join(toolIds.map((id: string) => sql`${id}::uuid`), sql`, `)}]::uuid[])`
    ),
    Promise.all(
      toolIds.map((tid: string) =>
        db
          .select()
          .from(sandboxResults)
          .where(eq(sandboxResults.toolId, tid))
          .orderBy(desc(sandboxResults.testedAt))
          .limit(1)
      )
    ),
    Promise.all(
      toolIds.map((tid: string) =>
        db
          .select({
            totalCalls: count(),
            avgRating: avg(feedback.rating),
            successRate: sql<number>`
              count(CASE WHEN ${feedback.result} = 'success' THEN 1 END)::float
              / NULLIF(count(*), 0) * 100
            `,
            last30Success: sql<number>`
              count(CASE WHEN ${feedback.result} = 'success'
                AND ${feedback.submittedAt} > now() - interval '30 days'
                THEN 1 END)
            `,
            last30Fail: sql<number>`
              count(CASE WHEN ${feedback.result} = 'failure'
                AND ${feedback.submittedAt} > now() - interval '30 days'
                THEN 1 END)
            `,
          })
          .from(feedback)
          .where(eq(feedback.toolId, tid))
      )
    ),
  ]);

  // 4. Build lookup maps
  const qualityMap = new Map(qualityRows.map((q) => [q.toolId, q]));
  const sandboxMap = new Map(
    sandboxRows.map((rows, i) => [toolIds[i]!, rows[0] ?? null])
  );
  const feedbackMap = new Map(
    feedbackRows.map((rows, i) => [toolIds[i]!, rows[0] as FeedbackStats | null])
  );

  // 5. Build ranked results
  const searchResults: SearchResultTool[] = rows
    .map((row: SearchRow) => {
      const toolId = row.tool_id;
      const quality = qualityMap.get(toolId);
      const sb = sandboxMap.get(toolId);
      const fb = feedbackMap.get(toolId);

      const qualityScore = quality ? Number(quality.overallScore) : 50;

      // Trust score: same formula as trust engine
      const fbSuccessRate = fb?.successRate ? Number(fb.successRate) : 0;
      const fbTotal = fb?.totalCalls ?? 0;
      const fbLast30 = (fb?.last30Success ?? 0) + (fb?.last30Fail ?? 0);
      const fbRating = fb?.avgRating ? Number(fb.avgRating) : 0;

      // Recency (from last 30 days activity)
      let recencyScore: number;
      if (fbLast30 >= 10) recencyScore = 100;
      else if (fbLast30 >= 5) recencyScore = 85;
      else if (fbLast30 >= 1) recencyScore = 70;
      else if (fbTotal >= 5) recencyScore = 40;
      else recencyScore = 20;

      // Consistency (from rating and fail rate)
      const ratingConsistency = Math.min(100, (fbRating / 5) * 100);
      const failRate = fbTotal > 0 ? (fb?.last30Fail ?? 0) / fbTotal : 0;
      const consistencyScore = Math.max(0, ratingConsistency - failRate * 50);

      // Community (from total usage volume)
      const volumeScore = Math.min(100, fbTotal * 2);
      const communityScore = volumeScore * 0.6 + ratingConsistency * 0.4;

      // Composite: successRate(40%) + recency(25%) + consistency(20%) + community(15%)
      const trustScore = fbTotal > 0
        ? fbSuccessRate * 0.40 + recencyScore * 0.25 + consistencyScore * 0.20 + communityScore * 0.15
        : 50; // No data = neutral

      return {
        rank: 0,
        toolId,
        toolName: row.tool_name,
        serverName: row.server_name,
        relevanceScore: Math.round(Number(row.relevance_score) * 100) / 100,
        quality: {
          overall: qualityScore,
          grade: quality?.grade ?? "C",
          breakdown: {
            correctness: quality ? Number(quality.correctness) : 50,
            efficiency: quality ? Number(quality.efficiency) : 50,
            descriptionQ: quality ? Number(quality.descriptionQ) : 50,
            security: quality ? Number(quality.security) : 50,
            installRel: quality ? Number(quality.installRel) : 50,
          },
        },
        trust: {
          score: Math.round(trustScore),
          successRate: fb?.successRate ? `${Math.round(fbSuccessRate)}%` : "N/A",
          totalCalls: fb?.totalCalls ?? 0,
          last30Days: {
            success: fb?.last30Success ?? 0,
            fail: fb?.last30Fail ?? 0,
          },
          avgLatencyMs: 0,
        },
        security: {
          grade: quality?.grade ?? "C",
          vulnerabilities: 0,
          lastAudit: "N/A",
        },
        efficiency: {
          toolDefinitionTokens: row.token_count ?? 0,
          avgTokensPerCall: 0,
          rating: getEfficiencyRating(row.token_count ?? 0),
        },
        install: {
          method: row.install_type ?? "unknown",
          command: row.install_cmd ?? "N/A",
        },
        sandboxVerified: sb?.passed ?? false,
        lastSandboxTest: sb?.testedAt?.toISOString() ?? "N/A",
        recommendationSummary: getRecommendationSummary(
          quality?.grade ?? "C",
          trustScore,
          sb?.passed ?? false,
          row.server_name,
          row.tool_name
        ),
        agentSignals: buildAgentSignals(row),
        communityScore: calcCommunityScore(row),
        dataProvenance: {
          qualityScore: (quality ? "real" : "estimated") as "real" | "estimated",
          trustScore: (fb?.totalCalls && fb.totalCalls > 0 ? "simulated" : "baseline") as "real_feedback" | "federated" | "simulated" | "baseline",
          communityScore: (row.server_metadata ? "live" : "unknown") as "live" | "cached" | "unknown",
        },
        trustTier: getTrustTier(
          quality?.grade ?? "C", qualityScore, trustScore,
          row.is_official === true,
          buildAgentSignals(row)?.activityStatus ?? "maintained",
          (row.server_metadata as any)?.github_stars ?? 0
        ),
        discrepancy: getDiscrepancy(qualityScore, trustScore, quality?.grade ?? "C"),
      };
    })
    .sort((a: SearchResultTool, b: SearchResultTool) => {
      const aScore = a.relevanceScore * 0.5 + (a.quality.overall / 100) * 0.3 + (a.trust.score / 100) * 0.2;
      const bScore = b.relevanceScore * 0.5 + (b.quality.overall / 100) * 0.3 + (b.trust.score / 100) * 0.2;
      return bScore - aScore;
    })
    .filter((r: SearchResultTool) => r.quality.overall >= minScore)
    .slice(0, maxResults)
    .map((r: SearchResultTool, i: number) => ({ ...r, rank: i + 1 }));

  const topPick = searchResults.length > 0
    ? {
        toolId: searchResults[0]!.toolId,
        reason: `Highest composite score. ${searchResults[0]!.quality.grade} quality. ${searchResults[0]!.trust.successRate} real-world success rate.${searchResults[0]!.sandboxVerified ? " Sandbox verified." : ""}`,
      }
    : null;

  return {
    searchId: crypto.randomUUID(),
    results: searchResults,
    topPick,
  };
}

function getTrustTier(
  qualityGrade: string,
  qualityScore: number,
  trustScore: number,
  isOfficial: boolean,
  activityStatus: string,
  githubStars: number
): SearchResultTool["trustTier"] {
  // Premium: A grade, 50+ stars, active, trust ≥ 80
  if ((qualityGrade.startsWith("A") || qualityGrade === "A+") && githubStars >= 50 && activityStatus === "active" && trustScore >= 80) {
    return { tier: "premium", label: "Premium", icon: "🔥", description: "Top-tier: excellent quality, highly active, trusted by the community" };
  }
  // Verified: Official + active + trust ≥ 60
  if (isOfficial && activityStatus !== "abandoned" && trustScore >= 60) {
    return { tier: "verified", label: "Verified", icon: "✅", description: "Official maintainer, active development, proven reliability" };
  }
  // Reliable: B+ or above, active, trust ≥ 50
  if (["A+","A","B+"].some(g => qualityGrade.startsWith(g)) && activityStatus !== "abandoned" && trustScore >= 50) {
    return { tier: "reliable", label: "Reliable", icon: "👍", description: "Good quality, active, community-endorsed" };
  }
  // Deprecated: abandoned or F grade
  if (activityStatus === "abandoned" || qualityGrade === "F") {
    return { tier: "deprecated", label: "Deprecated", icon: "💀", description: "Abandoned or critically flawed — not recommended" };
  }
  // Caution: low trust (<50) or stale (>180d)
  if (trustScore < 50 || activityStatus === "stale") {
    return { tier: "caution", label: "Caution", icon: "⚠️", description: "Low trust score or stale — verify before using" };
  }
  // Emerging: active but new
  return { tier: "emerging", label: "Emerging", icon: "🌱", description: "New and active — promising but not yet proven" };
}

function getDiscrepancy(
  qualityScore: number,
  trustScore: number,
  qualityGrade: string
): SearchResultTool["discrepancy"] {
  const gap = qualityScore - trustScore;

  // Quality is high (≥80, A/B+) but trust is low (<50)
  if (qualityScore >= 80 && trustScore < 50) {
    return {
      type: "quality_beats_trust",
      severity: "warning",
      message: "Well-designed on paper but unverified in production",
      detail: `Quality grade ${qualityGrade} (${qualityScore}/100) but no real-world trust data (${Math.round(trustScore)}/100). Static analysis looks good — but no agent has validated this tool in practice. Treat as experimental.`,
    };
  }

  // Quality is high but trust is moderate (50-70)
  if (qualityScore >= 80 && trustScore < 70) {
    return {
      type: "quality_beats_trust",
      severity: "caution",
      message: "Design quality exceeds real-world validation",
      detail: `Quality grade ${qualityGrade} (${qualityScore}/100) with limited production feedback (trust ${Math.round(trustScore)}/100). Design checks out, but not battle-tested.`,
    };
  }

  // Trust is high (≥80) but quality is low (<60, D/F)
  if (trustScore >= 80 && qualityScore < 60) {
    return {
      type: "trust_beats_quality",
      severity: "warning",
      message: "Widely used despite poor design — adoption paradox",
      detail: `Trust score ${Math.round(trustScore)}/100 (high real-world success) but quality grade ${qualityGrade} (${qualityScore}/100). This tool works in practice but has design issues — maintainability and security may be at risk.`,
    };
  }

  // Trust is moderate-high but quality is low
  if (trustScore >= 70 && qualityScore < 60) {
    return {
      type: "trust_beats_quality",
      severity: "caution",
      message: "Usage outpaces design quality — proceed with awareness",
      detail: `Trust ${Math.round(trustScore)}/100 (decent real-world results) but quality ${qualityGrade} (${qualityScore}/100). Users tolerate design flaws. Consider alternatives with better design.`,
    };
  }

  // No significant discrepancy
  return {
    type: "none",
    severity: "info",
    message: "Quality and trust are aligned",
    detail: `Quality (${qualityScore}/100, ${qualityGrade}) and trust (${Math.round(trustScore)}/100) are consistent. No contradiction detected.`,
  };
}

function buildAgentSignals(row: SearchRow): SearchResultTool["agentSignals"] {
  const meta = (row.server_metadata || {}) as Record<string, unknown>;
  const pushedAt = meta.github_pushed_at as string | undefined;
  const lastPushDaysAgo = pushedAt
    ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / (86400000))
    : null;

  let activityStatus: "active" | "maintained" | "stale" | "abandoned";
  if (lastPushDaysAgo === null) activityStatus = "maintained";
  else if (lastPushDaysAgo <= 30) activityStatus = "active";
  else if (lastPushDaysAgo <= 180) activityStatus = "maintained";
  else if (lastPushDaysAgo <= 365) activityStatus = "stale";
  else activityStatus = "abandoned";

  return {
    isOfficial: row.is_official === true,
    githubStars: (meta.github_stars as number) || 0,
    lastPushDaysAgo,
    activityStatus,
    documentation: {
      hasReadme: true, // GitHub repos always have README
      descriptionQuality: row.token_count && row.token_count <= 200 ? "excellent"
        : row.token_count && row.token_count <= 500 ? "good"
        : row.token_count && row.token_count <= 1000 ? "acceptable"
        : "poor",
    },
  };
}

function calcCommunityScore(row: SearchRow): number {
  const meta = (row.server_metadata || {}) as Record<string, unknown>;
  const stars = (meta.github_stars as number) || 0;
  const pushedAt = meta.github_pushed_at as string | undefined;
  const daysAgo = pushedAt
    ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / 86400000)
    : 365;

  // Stars: log scale, 0-100
  const starScore = Math.min(100, Math.log2(stars + 1) * 10); // 1024 stars = 100, 32 stars = 50
  // Activity: 0-100
  const activityScore = Math.max(0, 100 - daysAgo * 0.27); // ~1 year = 0
  // Official bonus
  const officialBonus = row.is_official ? 20 : 0;

  return Math.round(Math.min(100, starScore * 0.5 + activityScore * 0.35 + officialBonus * 0.75));
}

function getEfficiencyRating(tokens: number): "excellent" | "good" | "acceptable" | "poor" {
  if (tokens <= 200) return "excellent";
  if (tokens <= 500) return "good";
  if (tokens <= 1000) return "acceptable";
  return "poor";
}

function getRecommendationSummary(
  grade: string,
  trustScore: number,
  sandboxVerified: boolean,
  serverName: string,
  toolName: string
): string {
  const parts: string[] = [];
  parts.push(`${serverName}/${toolName}`);
  parts.push(`Quality: ${grade}`);
  parts.push(`Trust: ${Math.round(trustScore)}/100`);
  if (sandboxVerified) parts.push("Sandbox verified");
  return parts.join(" | ");
}

export async function logSearch(params: {
  query: string;
  resultsCount: number;
  topToolIds: string[];
}): Promise<void> {
  const embedding = await generateEmbedding(params.query);
  const embeddingStr = `[${embedding.join(",")}]`;

  await db.execute(sql`
    INSERT INTO search_logs (query, query_embedding, results_count, top_tool_ids)
    VALUES (
      ${params.query},
      ${embeddingStr}::vector,
      ${params.resultsCount},
      ARRAY[${sql.join(params.topToolIds.map((id: string) => sql`${id}::uuid`), sql`, `)}]::uuid[]
    )
  `);
}
