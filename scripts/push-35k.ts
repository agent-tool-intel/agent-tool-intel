// Push data past 35K — aggressive npm + GitLab deep search
import { db } from "../src/db/index.js";
import { servers } from "../src/db/schema.js";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

const POOL = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });

async function getExisting(): Promise<Set<string>> {
  const r = await POOL.query("SELECT name FROM servers");
  return new Set(r.rows.map((r: any) => r.name));
}

async function insertServer(data: Record<string, any>) {
  try {
    await POOL.query(
      "INSERT INTO servers (name, canonical_id, display_name, description, repository, publisher, is_official, install_cmd, install_type, source_registry, source_url, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (name) DO NOTHING",
      [data.name, data.canonicalId, data.displayName, data.description, data.repository, data.publisher, data.isOfficial, data.installCmd, data.installType, data.sourceRegistry, data.sourceUrl, JSON.stringify(data.metadata || {})]
    );
    return true;
  } catch { return false; }
}

async function main() {
  const existing = await getExisting();
  console.log(`Starting: ${existing.size} | Need: ${35000 - existing.size}\n`);

  let totalNew = 0;

  // npm: aggressive search with 30+ terms, deeper pages
  const npmTerms = [
    "mcp", "mcp-server", "mcp-tool", "mcp-client", "mcp-bridge", "mcp-connector",
    "mcp-hub", "mcp-proxy", "mcp-gateway", "mcp-registry", "mcp-plugin", "mcp-extension",
    "mcp-agent", "mcp-sdk", "mcp-wrapper", "mcp-integration", "mcp-module",
    "modelcontextprotocol", "mcp framework", "mcp provider", "mcp adapter",
    "mcp driver", "mcp handler", "mcp middleware", "mcp transport",
  ];

  for (const term of npmTerms) {
    for (let from = 0; from < 3000; from += 250) {
      try {
        const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(term)}&size=250&from=${from}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) break;
        const data = await resp.json();
        const results = data.objects || [];
        if (results.length === 0) break;

        for (const obj of results) {
          const pkg = obj.package;
          if (!pkg || existing.has(`npm:${pkg.name}`)) continue;
          const d = (pkg.description || "").toLowerCase();
          const nm = pkg.name.toLowerCase();
          if (!d.includes("mcp") && !nm.includes("mcp") && !d.includes("model context")) continue;

          const inserted = await insertServer({
            name: `npm:${pkg.name}`,
            canonicalId: `tool:mcp:npm/${pkg.name}@latest`,
            displayName: pkg.name,
            description: (pkg.description || "").slice(0, 200),
            repository: pkg.links?.repository,
            publisher: (pkg.name.split("/")[0] || "npm"),
            isOfficial: false,
            installCmd: `npm install ${pkg.name}`,
            installType: "npm",
            sourceRegistry: "npm",
            sourceUrl: pkg.links?.npm,
            metadata: { npm_version: pkg.version, npm_downloads_per_week: 0 },
          });
          if (inserted) { totalNew++; existing.add(`npm:${pkg.name}`); }
        }
        if (results.length < 250) break;
      } catch { break; }
    }
    if (existing.size >= 35000) break;
  }
  console.log(`npm: +${totalNew} → ${existing.size}`);

  // GitLab deeper
  if (existing.size < 35000) {
    const glTerms = ["mcp", "mcp server", "mcp tool", "mcp client", "mcp bridge", "model context protocol", "mcp integration", "mcp sdk", "mcp wrapper", "mcp extension", "mcp agent", "mcp module"];
    for (const term of glTerms) {
      for (let p = 1; p <= 10; p++) {
        try {
          const url = `https://gitlab.com/api/v4/projects?search=${encodeURIComponent(term)}&per_page=100&page=${p}`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!resp.ok) break;
          const data = await resp.json();
          if (!data.length) break;
          for (const r of data) {
            const nm = `gitlab:${r.path_with_namespace}`;
            if (existing.has(nm)) continue;
            const desc = (r.description || "").toLowerCase();
            if (!desc.includes("mcp") && !(r.topics || []).some((t: string) => t.toLowerCase().includes("mcp"))) continue;
            const inserted = await insertServer({
              name: nm,
              canonicalId: `tool:mcp:gitlab/${r.path_with_namespace}@latest`,
              displayName: r.name,
              description: (r.description || "").slice(0, 200),
              repository: r.web_url,
              publisher: r.namespace?.name || "gitlab",
              isOfficial: false,
              installCmd: null,
              installType: null,
              sourceRegistry: "gitlab",
              sourceUrl: r.web_url,
              metadata: { stars: r.star_count || 0 },
            });
            if (inserted) { totalNew++; existing.add(nm); }
          }
          if (data.length < 100) break;
        } catch { break; }
      }
      if (existing.size >= 35000) break;
    }
  }

  console.log(`\nFinal: ${existing.size} (+${totalNew})`);
  console.log(existing.size >= 35000 ? "🔥 35K!" : `Need ${35000 - existing.size} more`);
  await POOL.end();
}

main().catch(e => { console.error(e.message); POOL.end(); });
