import { db } from "../db/index.js";
import { servers, tools, qualityScores } from "../db/schema.js";
import { generateEmbedding } from "./embedding.js";
import { scoreToolQuality } from "./quality.js";
import { buildCanonicalId } from "../types/index.js";
import { eq, and, count } from "drizzle-orm";

// ── Types ──

interface ScrapedServer {
  name: string;
  displayName: string;
  description: string;
  repository?: string;
  publisher?: string;
  isOfficial: boolean;
  installCmd?: string;
  installType?: string;
  websiteUrl?: string;
  sourceRegistry: string;
  sourceUrl: string;
  categories?: string[];
  metadata?: {
    github_stars?: number;
    github_pushed_at?: string;
    github_open_issues?: number;
    github_topics?: string[];
    github_license?: string;
    npm_downloads_per_week?: number;
    npm_version?: string;
  };
}

// ── PulseMCP Scraper ──

export async function scrapePulseMCP(): Promise<ScrapedServer[]> {
  console.log("  🔍 Scraping PulseMCP...");

  try {
    // PulseMCP has a browseable directory
    // Their server listing is paginated, we grab the first few pages
    const results: ScrapedServer[] = [];

    // PulseMCP exposes server data via their website
    // We scrape the popular servers pages
    for (const page of [1, 2, 3]) {
      const url = `https://www.pulsemcp.com/servers?page=${page}&sort=popular`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "AgentToolIntel/0.1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) break;

      const html = await resp.text();

      // Extract server cards - each card contains name, description, link
      // Pattern: <a href="/servers/[slug]"> with title and description
      const cardRegex = /<a\s+href="\/servers\/([^"]+)"[^>]*>[\s\S]*?<h[23][^>]*>([^<]+)<\/h[23]>[\s\S]*?<p[^>]*>([^<]*)<\/p>/gi;
      let match;

      while ((match = cardRegex.exec(html)) !== null) {
        const slug = match[1]?.trim();
        const title = match[2]?.trim();
        const desc = match[3]?.trim();

        if (slug && title && desc && !slug.includes(" ")) {
          results.push({
            name: slug,
            displayName: title,
            description: desc.slice(0, 200),
            isOfficial: title.toLowerCase().includes("official"),
            sourceRegistry: "pulsemcp",
            sourceUrl: `https://www.pulsemcp.com/servers/${slug}`,
          });
        }
      }

      if (results.length >= 100) break; // Enough for MVP
    }

    console.log(`    → Found ${results.length} servers on PulseMCP`);
    return results;
  } catch (err) {
    console.log(`    ⚠️ PulseMCP scrape failed: ${(err as Error).message}`);
    return [];
  }
}

// ── MCP.so Scraper ──

export async function scrapeMcpSo(): Promise<ScrapedServer[]> {
  console.log("  🔍 Scraping MCP.so...");

  try {
    const results: ScrapedServer[] = [];

    // MCP.so lists servers, we can fetch their public API or scrape
    const resp = await fetch("https://mcp.so/servers", {
      headers: { "User-Agent": "AgentToolIntel/0.1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      console.log("    ⚠️ MCP.so returned", resp.status);
      return [];
    }

    const html = await resp.text();

    // MCP.so uses server cards with links
    const cardRegex = /<a\s+href="\/server\/([^"]+)"[^>]*>[\s\S]*?<h[23][^>]*>([^<]+)<\/h[23]>[\s\S]*?<p[^>]*>([^<]*)<\/p>/gi;
    let match;

    while ((match = cardRegex.exec(html)) !== null) {
      const slug = match[1]?.trim();
      const title = match[2]?.trim();
      const desc = match[3]?.trim();

      if (slug && title && desc) {
        results.push({
          name: slug,
          displayName: title,
          description: desc.slice(0, 200),
          isOfficial: false,
          sourceRegistry: "mcpsot",
          sourceUrl: `https://mcp.so/server/${slug}`,
        });
      }
    }

    console.log(`    → Found ${results.length} servers on MCP.so`);
    return results;
  } catch (err) {
    console.log(`    ⚠️ MCP.so scrape failed: ${(err as Error).message}`);
    return [];
  }
}

// ── GitHub MCP Topic Scraper (multi-page, multi-query) ──

const GITHUB_QUERIES = [
  // Topic-based (highest signal)
  // All MCP servers (no star filter — catch everything)
  "topic:mcp-server",
  "topic:model-context-protocol",
  "topic:mcp",
  "topic:mcp-tool",
  "topic:mcp-client",
  "topic:mcp-integration",
  // Keyword-based (long tail, no minimum stars)
  "mcp server in:description",
  "\"model context protocol\" in:description",
  "mcp in:name NOT topic:mcp-server NOT topic:model-context-protocol",
  // Language-specific
  "topic:mcp-server language:typescript",
  "topic:mcp-server language:python",
  "topic:mcp-server language:go",
  "topic:mcp-server language:rust",
  "topic:mcp-server language:java",
  "topic:mcp-server language:javascript",
  // Deep search: README mentions, config files, orgs
  "\"mcp server\" in:readme",
  "\"model context protocol\" in:readme",
  "mcp.json in:name",
  "filename:mcp.json",
  "org:modelcontextprotocol",
  "\"@modelcontextprotocol/sdk\" in:description",
  "\"mcp-server\" in:name",
  // No-star threshold (catch everything, extended date range)
  "topic:mcp-server pushed:>2024-01-01",
  "topic:model-context-protocol pushed:>2024-01-01",
  // npm-based discovery
  "npm install mcp-server in:readme",
  "npx mcp-server in:description",
  // New sources
  "mcp_server in:name",
  "\"MCP tool\" in:description",
  // Long tail: search README for MCP patterns
  "\"npm install\" mcp in:readme language:typescript stars:>0",
  "\"pip install\" mcp in:readme language:python stars:>0",
  "\"npx\" mcp in:readme stars:>1",
  // npm packages that mention MCP
  "\"modelcontextprotocol/sdk\" in:package.json",
  // Star-less: very new or niche
  "topic:mcp created:>2025-06-01",
];

// Filter: skip repos that are NOT real MCP servers
function isMcpServer(repo: { description?: string | null; topics?: string[]; name?: string }): boolean {
  const desc = (repo.description || "").toLowerCase();
  const topics = (repo.topics || []).map(t => t.toLowerCase());
  const name = (repo.name || "").toLowerCase();
  const fullText = desc + " " + topics.join(" ") + " " + name;

  // Skip: awesome lists, curated collections, templates, tools, platforms
  const nonMcpPatterns = [
    "awesome", "awesome-list", "curated list", "collection of",
    "awesome-mcp", "mcp-list", "mcp directory", "mcp registry",
    "template", "starter", "boilerplate",
    "not an mcp", "not a mcp",
    "mcp marketplace", "mcp aggregator", "mcp hub", "mcp catalog",
    "mcp index", "mcp explorer", "mcp search",
    "list of mcp", "mcp scanner", "mcp scoring", "mcp quality",
  ];
  for (const p of nonMcpPatterns) {
    if (fullText.includes(p)) return false;
  }

  // Skip: repos with zero MCP topics AND no MCP mention in description
  const hasMcpTopic = topics.some(t => t.includes("mcp") || t.includes("model-context-protocol"));
  const hasMcpInDesc = desc.includes("mcp") || desc.includes("model context protocol");
  if (!hasMcpTopic && !hasMcpInDesc) return false;

  // Must have at least one clear MCP indicator
  const mcpIndicators = [
    "mcp server", "mcp tool", "mcp client", "mcp integration",
    "model context protocol", "modelcontextprotocol",
  ];
  const hasStrongMcpSignal = mcpIndicators.some(i => fullText.includes(i));
  if (!hasStrongMcpSignal) return false;

  return true;
}

const MAX_PAGES_PER_QUERY = 25;
const PER_PAGE = 100;

export async function scrapeGitHubMCPTopic(): Promise<ScrapedServer[]> {
  console.log("  🔍 Searching GitHub for MCP servers...");
  const seen = new Set<string>();

  async function fetchPage(query: string, page: number): Promise<ScrapedServer[]> {
    const q = encodeURIComponent(query);
    const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${PER_PAGE}&page=${page}`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "AgentToolIntel/0.1.0",
        Accept: "application/vnd.github.v3+json",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) return [];

    const data = (await resp.json()) as {
      items?: Array<{
        full_name: string;
        description: string | null;
        html_url: string;
        stargazers_count: number;
        language: string | null;
        pushed_at: string;
        updated_at: string;
        open_issues_count: number;
        topics: string[];
        license: { spdx_id: string } | null;
        owner: { login: string; type: string };
      }>;
    };

    if (!data.items) return [];

    const results: ScrapedServer[] = [];
    for (const repo of data.items) {
      if (seen.has(repo.full_name)) continue;
      seen.add(repo.full_name);

      // Filter: skip non-MCP repos
      if (!isMcpServer({ description: repo.description, topics: repo.topics, name: repo.full_name })) continue;

      // Detect install method instead of defaulting to npx
      const desc = repo.description || `${repo.full_name} MCP server`;
      const lang = repo.language?.toLowerCase() || "";
      const descLower = desc.toLowerCase();
      const topicsLower = (repo.topics || []).map((t: string) => t.toLowerCase());

      let installCmd = `npx @${repo.full_name}`;
      let installType = "npx";

      if (topicsLower.includes("http-mcp") || topicsLower.includes("streamable-http") ||
          descLower.includes("streamable http") || descLower.includes("http mcp server") ||
          descLower.includes("remote mcp")) {
        installCmd = repo.html_url;
        installType = "http";
      } else if (lang === "python") {
        installCmd = `pip install ${repo.full_name.split("/")[1]}`;
        installType = "pip";
      } else if (lang === "go" || lang === "golang") {
        installCmd = `go install github.com/${repo.full_name}@latest`;
        installType = "go";
      } else if (lang === "rust") {
        installCmd = `cargo install ${repo.full_name.split("/")[1]}`;
        installType = "cargo";
      }
      const isOfficial =
        repo.owner.login === "modelcontextprotocol" ||
        repo.owner.login === "anthropics" ||
        repo.owner.login === "microsoft" ||
        repo.owner.login === "google" ||
        repo.owner.type === "Organization";

      results.push({
        name: repo.full_name,
        displayName: repo.full_name.split("/")[1] || repo.full_name,
        description: desc.slice(0, 200),
        repository: repo.html_url,
        publisher: repo.owner.login,
        isOfficial,
        installCmd: `npx @${repo.full_name}`,
        installType: "npx",
        sourceRegistry: "github",
        sourceUrl: repo.html_url,
        metadata: {
          github_stars: repo.stargazers_count,
          github_pushed_at: repo.pushed_at,
          github_open_issues: repo.open_issues_count,
          github_topics: repo.topics || [],
          github_license: repo.license?.spdx_id || undefined,
        },
      });
    }
    return results;
  }

  const allResults: ScrapedServer[] = [];
  for (const query of GITHUB_QUERIES) {
    for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
      const pageResults = await fetchPage(query, page);
      allResults.push(...pageResults);
      if (pageResults.length < PER_PAGE) break;
      // Rate limit: 10 req/min unauthenticated, 30 with token
      await new Promise((r) => setTimeout(r, process.env.GITHUB_TOKEN ? 1000 : 6000));
    }
  }

  console.log(`    → Found ${allResults.length} servers on GitHub`);
  return allResults;
}

// ── Official MCP Registry Scraper ──

export async function scrapeOfficialRegistry(): Promise<ScrapedServer[]> {
  console.log("  🔍 Fetching official MCP registry...");

  try {
    const url = "https://registry.modelcontextprotocol.io/api/servers?limit=100";
    const resp = await fetch(url, {
      headers: { "User-Agent": "AgentToolIntel/0.1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      console.log(`    ⚠️ Official registry returned ${resp.status}`);
      return [];
    }

    const data = (await resp.json()) as {
      servers?: Array<{
        name: string;
        title?: string;
        description: string;
        repository?: { url: string };
        websiteUrl?: string;
      }>;
    };

    if (!data.servers) return [];

    const results: ScrapedServer[] = data.servers.map((s) => ({
      name: s.name,
      displayName: s.title || s.name.split("/").pop() || s.name,
      description: (s.description || "").slice(0, 200),
      repository: s.repository?.url,
      isOfficial: true,
      websiteUrl: s.websiteUrl,
      sourceRegistry: "official",
      sourceUrl: `https://registry.modelcontextprotocol.io/servers/${s.name}`,
    }));

    console.log(`    → Found ${results.length} servers in official registry`);
    return results;
  } catch (err) {
    console.log(`    ⚠️ Official registry failed: ${(err as Error).message}`);
    return [];
  }
}

// ── npm Registry Scraper ──

export async function scrapeNpmMcp(): Promise<ScrapedServer[]> {
  console.log("  🔍 Searching npm for MCP servers...");

  try {
    const results: ScrapedServer[] = [];
    const keywords = ["mcp-server", "modelcontextprotocol", "mcp-tool", "mcp-client"];

    for (const kw of keywords) {
      const url = `https://registry.npmjs.org/-/v1/search?text=keywords:${kw}&size=50`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "AgentToolIntel/0.1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) continue;

      const data = (await resp.json()) as {
        objects?: Array<{
          package: {
            name: string;
            description?: string;
            links: { npm: string; repository?: string };
            version: string;
          };
        }>;
      };

      if (!data.objects) continue;

      for (const obj of data.objects) {
        const pkg = obj.package;
        if (!pkg.description?.toLowerCase().includes("mcp")) continue;

        results.push({
          name: `npm:${pkg.name}`,
          displayName: pkg.name,
          description: (pkg.description || "").slice(0, 200),
          repository: pkg.links.repository,
          publisher: pkg.name.split("/")[0] || "npm",
          isOfficial: false,
          installCmd: `npx ${pkg.name}`,
          installType: "npx",
          sourceRegistry: "npm",
          sourceUrl: pkg.links.npm,
        });
      }
    }

    console.log(`    → Found ${results.length} servers on npm`);
    return results;
  } catch (err) {
    console.log(`    ⚠️ npm scrape failed: ${(err as Error).message}`);
    return [];
  }
}

// ── PyPI Scraper ──

export async function scrapePyPiMcp(): Promise<ScrapedServer[]> {
  console.log("  🔍 Searching PyPI for MCP servers...");

  try {
    const results: ScrapedServer[] = [];
    const searches = ["mcp-server", "modelcontextprotocol", "mcp"];

    for (const term of searches) {
      const url = `https://pypi.org/search/?q=${term}&o=&page=1`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "AgentToolIntel/0.1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) continue;

      const html = await resp.text();

      // Parse PyPI search results (server-rendered HTML)
      const pkgRegex = /<a\s+class="package-snippet__name"[^>]*href="\/project\/([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<p[^>]*>([^<]*)<\/p>/gi;
      let match;
      while ((match = pkgRegex.exec(html)) !== null) {
        const pkgName = match[1]?.trim();
        const displayName = match[2]?.trim();
        const desc = match[3]?.trim();

        if (pkgName && desc?.toLowerCase().includes("mcp")) {
          results.push({
            name: `pypi:${pkgName}`,
            displayName: displayName || pkgName,
            description: desc.slice(0, 200),
            publisher: pkgName.split("-")[0] || "pypi",
            isOfficial: false,
            installCmd: `pip install ${pkgName}`,
            installType: "pip",
            sourceRegistry: "pypi",
            sourceUrl: `https://pypi.org/project/${pkgName}/`,
          });
        }
      }
    }

    console.log(`    → Found ${results.length} servers on PyPI`);
    return results;
  } catch (err) {
    console.log(`    ⚠️ PyPI scrape failed: ${(err as Error).message}`);
    return [];
  }
}

// ── Main Ingestion Pipeline ──

export async function runIngestion(): Promise<{
  newServers: number;
  newTools: number;
  totalServers: number;
  totalTools: number;
}> {
  console.log("📥 Starting data ingestion...");

  // 1. Scrape all sources (PulseMCP + MCP.so blocked by Cloudflare/client-render)
  const [github, official, npm, pypi] = await Promise.all([
    scrapeGitHubMCPTopic(),
    scrapeOfficialRegistry(),
    scrapeNpmMcp(),
    scrapePyPiMcp(),
  ]);

  // 2. Merge and deduplicate by name
  const allServers = new Map<string, ScrapedServer>();

  // Priority: Official > GitHub
  for (const s of [...pypi, ...npm, ...github, ...official]) {
    const key = s.name.toLowerCase();
    if (!allServers.has(key)) {
      allServers.set(key, s);
    } else if (s.repository) {
      // Prefer entries with repository URLs
      const existing = allServers.get(key)!;
      if (!existing.repository) {
        allServers.set(key, { ...existing, ...s });
      }
    }
  }

  console.log(`  📊 Total unique servers: ${allServers.size}`);

  // 3. Insert into database
  let newServers = 0;
  let newTools = 0;

  for (const [_, server] of allServers) {
    try {
      // Check if server already exists
      const existing = await db
        .select({ id: servers.id })
        .from(servers)
        .where(eq(servers.name, server.name))
        .limit(1);

      let serverId: string;

      if (existing.length > 0) {
        serverId = existing[0]!.id;
      } else {
        // Generate canonical ID
        const parts = server.name.split("/");
        const ns = parts.length > 1 ? parts[0]! : "unknown";
        const nm = parts.length > 1 ? parts[1]! : server.name;
        const canonicalId = buildCanonicalId(
          server.sourceRegistry === "official" ? "mcp" : "mcp",
          ns,
          nm
        );

        const [inserted] = await db
          .insert(servers)
          .values({
            name: server.name,
            canonicalId,
            displayName: server.displayName,
            description: server.description,
            repository: server.repository ?? null,
            publisher: server.publisher ?? null,
            isOfficial: server.isOfficial,
            installCmd: server.installCmd ?? null,
            installType: server.installType ?? null,
            websiteUrl: server.websiteUrl ?? null,
            sourceRegistry: server.sourceRegistry,
            sourceUrl: server.sourceUrl,
            metadata: server.metadata || {},
          })
          .returning({ id: servers.id });

        if (!inserted) continue;
        serverId = inserted.id;
        newServers++;
      }

      // Create tool entries for this server
      // For MVP: create one "default" tool per server representing its primary capability
      const toolName = inferToolName(server);
      const toolDescription = inferToolDescription(server);

      // Check if tool already exists for this server
      const existingTool = await db
        .select({ id: tools.id })
        .from(tools)
        .where(
          and(eq(tools.serverId, serverId), eq(tools.name, toolName))
        )
        .limit(1);

      if (existingTool.length > 0) continue;

      // Generate embedding for tool
      const embeddingText = `${server.description}. Tool: ${toolDescription}`;
      const embedding = await generateEmbedding(embeddingText);

      const toolDesc = toolDescription.slice(0, 300);
      const toolTokenCount = embeddingText.length;

      const [insertedTool] = await db
        .insert(tools)
        .values({
          serverId,
          name: toolName,
          description: toolDesc,
          sideEffects: detectSideEffects(toolDescription),
          tokenCount: toolTokenCount,
          embedding: embedding as any,
        })
        .returning({ id: tools.id });

      if (insertedTool) {
        newTools++;

        // Score quality
        const quality = scoreToolQuality({
          id: insertedTool.id,
          name: toolName,
          description: toolDesc,
          inputSchema: null,
          tokenCount: toolTokenCount,
        });

        await db.insert(qualityScores).values(quality as any);
      }
    } catch (err) {
      // Skip individual failures, continue with next server
      console.log(`    ⚠️ Failed to ingest ${server.name}: ${(err as Error).message}`);
    }
  }

  // 4. Get totals
  const [totalServersCount, totalToolsCount] = await Promise.all([
    db.select({ total: count() }).from(servers),
    db.select({ total: count() }).from(tools),
  ]);

  const totalServers = Number(totalServersCount[0]?.total ?? 0);
  const totalTools = Number(totalToolsCount[0]?.total ?? 0);

  console.log(`✅ Ingestion complete: +${newServers} servers, +${newTools} tools`);
  console.log(`   Total: ${totalServers} servers, ${totalTools} tools`);

  return {
    newServers,
    newTools,
    totalServers,
    totalTools,
  };
}

// ── Helpers ──

function inferToolName(server: ScrapedServer): string {
  const name = server.displayName || server.name;
  // Convert display name to snake_case tool name
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 50);
}

function inferToolDescription(server: ScrapedServer): string {
  // Use the server description as the tool description
  // Add context about what the tool does
  const base = server.description || `${server.name} MCP server`;
  return base.slice(0, 300);
}

function detectSideEffects(description: string): "read_only" | "destructive" | "idempotent" {
  const desc = description.toLowerCase();
  const destructive = [
    "write", "delete", "remove", "create", "update", "modify",
    "deploy", "execute", "send", "post", "push",
  ];
  const idempotent = ["set", "put", "upsert", "ensure"];

  if (destructive.some((w) => desc.includes(w))) return "destructive";
  if (idempotent.some((w) => desc.includes(w))) return "idempotent";
  return "read_only";
}
