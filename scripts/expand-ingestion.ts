// Quick ingestion run — fetch new MCP tools to reach 50K+
import { scrapeGitHubMcpTopic } from "../src/services/ingestion.js";

async function main() {
  console.log("Starting expanded ingestion...\n");
  const servers = await scrapeGitHubMcpTopic();
  console.log(`\nFetched ${servers.length} new servers`);
  console.log("Dedup + insert handled by ingestion service");
}

main().catch(e => { console.error(e); process.exit(1); });
