import { db } from "../src/db/index.js";
import { servers, tools, qualityScores } from "../src/db/schema.js";
import { scoreCompositeGrade, scoreCommunity, scoreTrust } from "../src/services/quality.js";
import { eq } from "drizzle-orm";

const r = await db
  .select({ q: qualityScores.overallScore, s: servers.metadata, t: tools.name, n: servers.name, g: qualityScores.grade })
  .from(tools).innerJoin(servers, eq(tools.serverId, servers.id)).innerJoin(qualityScores, eq(tools.id, qualityScores.toolId))
  .limit(5);

for (const x of r) {
  const m = (x.s || {}) as Record<string, any>;
  const stars = m?.stars || 0;
  const pushedAt = m?.pushed_at;
  const lastPush = pushedAt ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / 86400000) : null;
  const isOfficial = m?.is_official || false;
  const isVerified = m?.is_verified_publisher || false;

  const q = parseFloat(String(x.q || "0")) || 0;
  const c = scoreCommunity(stars, lastPush, isOfficial, isVerified);
  const t = scoreTrust(null, 0, null);
  const { composite, grade } = scoreCompositeGrade(q, c, t);

  console.log(`${x.n}/${x.t}: Q=${q} C=${c} T=${t} → ${composite} (${grade}) stars=${stars} push=${lastPush}d oldGrade=${x.g}`);
}

process.exit(0);
