// Enrich npm + GitLab metadata
import { db } from "../src/db/index.js";
import { servers } from "../src/db/schema.js";
import { sql, eq, isNull } from "drizzle-orm";

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error("GITHUB_TOKEN not set"); process.exit(1); }

async function main() {
  // Enrich npm packages
  let npmEnriched = 0;
  for (let round = 1; round <= 10; round++) {
    const rows = await db.select({ name: servers.name, displayName: servers.displayName })
      .from(servers)
      .where(sql`source_registry = 'npm' AND (metadata->>'github_stars') IS NULL`)
      .limit(200);
    if (rows.length === 0) break;

    for (const r of rows) {
      try {
        const pkgName = r.displayName || r.name.replace("npm:", "");
        const resp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}`, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) continue;
        const data = await resp.json();

        if (data.downloads?.weekly > 0) {
          await db.execute(sql`UPDATE servers SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{npm_downloads_per_week}', to_jsonb(${data.downloads.weekly}::int)) WHERE name = ${r.name}`);
        }

        const repoUrl = data.repository?.url;
        if (repoUrl) {
          const clean = repoUrl.replace(/^git\+/, "").replace(/\.git$/, "");
          const ghMatch = clean.match(/github\.com[:/]([^/]+\/[^/]+?)$/i);
          if (ghMatch) {
            try {
              const gh = await fetch(`https://api.github.com/repos/${ghMatch[1]}`, { headers: { "User-Agent": "ATI", Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(5000) });
              if (gh.ok) {
                const ghData = await gh.json() as any;
                await db.execute(sql`UPDATE servers SET metadata = jsonb_set(jsonb_set(COALESCE(metadata, '{}'), '{github_stars}', to_jsonb(${ghData.stargazers_count || 0}::int)), '{github_pushed_at}', to_jsonb(${ghData.pushed_at || null}::text)) WHERE name = ${r.name}`);
                npmEnriched++;
              }
            } catch {}
          }
          await db.execute(sql`UPDATE servers SET repository = ${repoUrl} WHERE name = ${r.name} AND repository IS NULL`);
        }
        await new Promise(r => setTimeout(r, 200));
      } catch {}
    }
    console.log(`npm round ${round}: ${npmEnriched} enriched`);
  }

  // Enrich GitLab
  let glEnriched = 0;
  for (let round = 1; round <= 5; round++) {
    const rows = await db.select({ name: servers.name, displayName: servers.displayName })
      .from(servers)
      .where(sql`source_registry = 'gitlab' AND (metadata->>'github_stars') IS NULL`)
      .limit(200);
    if (rows.length === 0) break;

    for (const r of rows) {
      try {
        const path = encodeURIComponent(r.displayName || r.name.replace("gitlab:", ""));
        const resp = await fetch(`https://gitlab.com/api/v4/projects/${path}`, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) continue;
        const data = await resp.json() as any;
        if (data.star_count || data.last_activity_at) {
          await db.execute(sql`UPDATE servers SET metadata = jsonb_set(jsonb_set(COALESCE(metadata, '{}'), '{github_stars}', to_jsonb(${data.star_count || 0}::int)), '{github_pushed_at}', to_jsonb(${data.last_activity_at || null}::text)) WHERE name = ${r.name}`);
          glEnriched++;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    console.log(`gitlab round ${round}: ${glEnriched} enriched`);
  }

  const total = await db.select({ count: sql<number>`count(*)` }).from(servers);
  const withStars = await db.select({ count: sql<number>`count(*)` }).from(servers).where(sql`(metadata->>'github_stars') IS NOT NULL`);
  console.log(`\nDone: npm=${npmEnriched}, gitlab=${glEnriched}`);
  console.log(`Total: ${total[0]?.count}, With stars: ${withStars[0]?.count}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
