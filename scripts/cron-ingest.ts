// Periodic ingestion cron — run every 6 hours
// Usage: npx tsx --env-file=.env scripts/cron-ingest.ts
// Set up as cron: 0 */6 * * *

import { runIngestion } from "../src/services/ingestion.js";
import { db } from "../src/db/index.js";
import { servers, tools, feedback } from "../src/db/schema.js";
import { sql } from "drizzle-orm";

const start = Date.now();
console.log(`🔄 Cron ingestion — ${new Date().toISOString()}`);

const result = await runIngestion();

// Log stats
const [serverCount, toolCount, fbCount] = await Promise.all([
  db.select({ count: sql<number>`count(*)` }).from(servers),
  db.select({ count: sql<number>`count(*)` }).from(tools),
  db.select({ count: sql<number>`count(*)` }).from(feedback),
]);

const duration = ((Date.now() - start) / 1000).toFixed(1);
console.log(`✅ Cron done in ${duration}s | ${result.newServers} new servers, ${result.newTools} new tools`);
console.log(`   Total: ${Number(serverCount[0]?.count ?? 0)} servers, ${Number(toolCount[0]?.count ?? 0)} tools, ${Number(fbCount[0]?.count ?? 0)} feedback`);
