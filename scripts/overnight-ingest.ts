// Overnight ingestion — maximize data while humans sleep
// Run: npx tsx --env-file=.env scripts/overnight-ingest.ts
// Strategy: remove star thresholds, broad date ranges, code search

import { runIngestion } from "../src/services/ingestion.js";
import { db } from "../src/db/index.js";
import { servers, tools, qualityScores } from "../src/db/schema.js";
import { generateEmbedding } from "../src/services/embedding.js";
import { scoreToolQuality } from "../src/services/quality.js";
import { buildCanonicalId } from "../src/types/index.js";
import { eq, and, count, sql } from "drizzle-orm";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const BASE = "https://api.github.com";

interface GhRepo {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  pushed_at: string;
  open_issues_count: number;
  topics: string[];
  license: { spdx_id: string } | null;
  owner: { login: string; type: string };
}

async function searchGitHub(query: string, page: number): Promise<GhRepo[]> {
  const url = `${BASE}/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100&page=${page}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "AgentToolIntel/0.1.0",
      Accept: "application/vnd.github.v3+json",
      ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) return [];
  const data = await resp.json() as { items?: GhRepo[] };
  return data.items || [];
}

async function ingestRepo(repo: GhRepo, source: string) {
  const existing = await db.select({ id: servers.id }).from(servers).where(eq(servers.name, repo.full_name)).limit(1);
  if (existing.length > 0) return null;

  const desc = repo.description || `${repo.full_name} MCP server`;
  const isOfficial = ["modelcontextprotocol","anthropics","microsoft","google"].includes(repo.owner.login) || repo.owner.type === "Organization";
  const parts = repo.full_name.split("/");
  const canonicalId = buildCanonicalId("mcp", parts[0]!, parts[1]!);

  const [inserted] = await db.insert(servers).values({
    name: repo.full_name,
    canonicalId,
    displayName: parts[1],
    description: desc.slice(0, 200),
    repository: repo.html_url,
    publisher: repo.owner.login,
    isOfficial,
    installCmd: `npx @${repo.full_name}`,
    installType: "npx",
    sourceRegistry: source,
    sourceUrl: repo.html_url,
    metadata: {
      github_stars: repo.stargazers_count,
      github_pushed_at: repo.pushed_at,
      github_open_issues: repo.open_issues_count,
      github_topics: repo.topics || [],
      github_license: repo.license?.spdx_id || null,
    },
  }).returning({ id: servers.id });

  if (!inserted) return null;

  const toolName = parts[1]!.replace(/[^a-z0-9_]/gi, "_").toLowerCase().slice(0, 50);
  const embeddingText = `${desc}. Tool for ${toolName}`;
  const embedding = await generateEmbedding(embeddingText);

  const [insertedTool] = await db.insert(tools).values({
    serverId: inserted.id,
    name: toolName,
    description: desc.slice(0, 300),
    sideEffects: /write|delete|create|update|execute|deploy|send/i.test(desc) ? "destructive" : "read_only",
    tokenCount: embeddingText.length,
    embedding: embedding as any,
  }).returning({ id: tools.id });

  if (insertedTool) {
    const quality = scoreToolQuality({ id: insertedTool.id, name: toolName, description: desc.slice(0, 300), inputSchema: null, tokenCount: embeddingText.length });
    await db.insert(qualityScores).values(quality as any);
  }

  return inserted?.id || null;
}

async function overnightRun() {
  console.log(`🌙 Overnight ingestion — ${new Date().toISOString()}`);
  const startTotal = (await db.select({ count: sql<number>`count(*)` }).from(servers))[0]?.count || 0;
  console.log(`   Starting from: ${startTotal} servers\n`);

  // Strategy: broad queries, no star threshold, sorted by recently updated
  const queries = [
    // Date-range batches (catch everything, no star filter)
    'topic:mcp-server pushed:>2024-01-01',
    'topic:model-context-protocol pushed:>2024-01-01',
    'topic:mcp pushed:>2024-01-01',
    // Language-specific broad
    'topic:mcp-server language:typescript',
    'topic:mcp-server language:python',
    'topic:mcp-server language:javascript',
    'topic:mcp-server language:go',
    'topic:mcp-server language:rust',
    // Keyword in description (no topic requirement)
    '"mcp server" in:description',
    '"model context protocol" in:description',
    '"MCP" in:name NOT topic:mcp-server NOT topic:mcp',
    // npm packages
    '"@modelcontextprotocol/sdk"',
    // README mentions
    '"mcp server" in:readme',
    '"MCP tool" in:readme',
    // Newly created
    'topic:mcp-server created:>2025-12-01',
    'topic:mcp created:>2025-12-01',
    // Forks with activity
    'topic:mcp-server fork:true pushed:>2025-06-01',
  ];

  let totalNew = 0;
  const seen = new Set<string>();

  for (const query of queries) {
    console.log(`  🔍 "${query}"`);
    let queryNew = 0;

    for (let page = 1; page <= 10; page++) {
      const repos = await searchGitHub(query, page);
      if (repos.length === 0) break;

      for (const repo of repos) {
        if (seen.has(repo.full_name)) continue;
        seen.add(repo.full_name);

        try {
          const id = await ingestRepo(repo, "github");
          if (id) { totalNew++; queryNew++; }
        } catch (e) {
          // Skip failures, continue
        }
      }

      if (repos.length < 100) break;
      await new Promise(r => setTimeout(r, 800)); // Rate limit respect
    }

    console.log(`    → ${queryNew} new (${totalNew} total new this run)`);
  }

  const endTotal = (await db.select({ count: sql<number>`count(*)` }).from(servers))[0]?.count || 0;
  console.log(`\n✅ Overnight done: +${totalNew} new servers`);
  console.log(`   ${startTotal} → ${endTotal} total`);
}

overnightRun().catch(err => { console.error("❌", err); process.exit(1); });
