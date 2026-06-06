// Debug: print 5 sample tools to find scoring bug
import { db } from "../src/db/index.js";
import { servers, tools, qualityScores } from "../src/db/schema.js";
import { scoreCompositeGrade, scoreCommunity, scoreTrust } from "../src/services/quality.js";
import { eq } from "drizzle-orm";

async function main() {
  const sample = await db
    .select({
      toolId: tools.id,
      toolName: tools.name,
      qualityOverall: qualityScores.overallScore,
      currentGrade: qualityScores.grade,
      serverName: servers.name,
      metadata: servers.metadata,
    })
    .from(tools)
    .innerJoin(servers, eq(tools.serverId, servers.id))
    .innerJoin(qualityScores, eq(tools.id, qualityScores.toolId))
    .limit(5);

  for (const row of sample) {
    const meta = row.metadata as Record<string, any> || {};
    const qualityScore = parseFloat(String(row.qualityOverall || "0")) || 0;
    const stars = meta?.stars || 0;
    const pushedAt = meta?.pushed_at;
    const lastPushDaysAgo = pushedAt
      ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / 86400000)
      : null;
    const isOfficial = meta?.is_official || false;
    const isVerifiedPublisher = meta?.is_verified_publisher || false;

    const communityScore = scoreCommunity(stars, lastPushDaysAgo, isOfficial, isVerifiedPublisher);
    const trustScore = scoreTrust(null, 0, null);
    const { composite, grade } = scoreCompositeGrade(qualityScore, communityScore, trustScore);

    console.log(`\n${row.serverName}/${row.toolName}:`);
    console.log(`  Quality: ${qualityScore}  Community: ${communityScore}  Trust: ${trustScore}`);
    console.log(`  Composite: ${composite} → Grade: ${grade}`);
    console.log(`  Stars: ${stars}  LastPush: ${lastPushDaysAgo}d  Official: ${isOfficial}`);
    console.log(`  Metadata keys: ${Object.keys(meta).slice(0, 5).join(", ")}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
