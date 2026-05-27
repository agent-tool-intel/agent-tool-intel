// Run ingestion pipeline from CLI
// Usage: npx tsx --env-file=.env scripts/ingest.ts

import { runIngestion } from "../src/services/ingestion.js";

console.log("🔄 Agent Tool Intel — Data Ingestion\n");

const result = await runIngestion();

console.log("\n📊 Final Stats:");
console.log(`   Servers: ${result.totalServers} (${result.newServers} new)`);
console.log(`   Tools:   ${result.totalTools} (${result.newTools} new)`);
console.log("\n✅ Done.");
