import { db } from "../src/db/index.js";
import { servers } from "../src/db/schema.js";
import { sql } from "drizzle-orm";

async function check() {
  // Distribution by stars and activity
  const dist = await db.execute(sql`
    SELECT
      CASE
        WHEN (metadata->>'github_stars')::int >= 50 THEN '50+ stars'
        WHEN (metadata->>'github_stars')::int >= 10 THEN '10-49 stars'
        WHEN (metadata->>'github_stars')::int >= 1 THEN '1-9 stars'
        ELSE '0 stars'
      END as star_bucket,
      CASE
        WHEN (metadata->>'github_pushed_at')::timestamp > now() - interval '30 days' THEN 'active'
        WHEN (metadata->>'github_pushed_at')::timestamp > now() - interval '180 days' THEN 'maintained'
        WHEN (metadata->>'github_pushed_at')::timestamp > now() - interval '365 days' THEN 'stale'
        ELSE 'abandoned'
      END as activity,
      COUNT(*)::int as cnt
    FROM servers
    GROUP BY 1, 2
    ORDER BY 1, 3 DESC
  `);

  console.log("Quality Distribution (stars × activity):");
  dist.rows.forEach((r: any) =>
    console.log(`  ${r.star_bucket}\t${r.activity}\t${r.cnt}`)
  );

  // Garbage check
  const garbage = await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM servers
    WHERE (metadata->>'github_stars')::int <= 1
    AND (description IS NULL OR length(description) < 30)
  `);
  console.log("\nLow quality (≤1 star + short desc):", garbage.rows[0]?.cnt);

  // Total
  const total = await db.select({ count: sql<number>`count(*)` }).from(servers);
  console.log("Total servers:", Number(total[0]?.count ?? 0));
}

check();
