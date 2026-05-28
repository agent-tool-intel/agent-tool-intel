// Seed script: populates database with initial MCP server + tool data
// Run: npx tsx scripts/seed.ts

import { db } from "../src/db/index.js";
import { servers, tools, qualityScores } from "../src/db/schema.js";
import { generateEmbedding } from "../src/services/embedding.js";
import { scoreToolQuality } from "../src/services/quality.js";
import { buildCanonicalId } from "../src/types/index.js";

const SEED_SERVERS = [
  {
    name: "modelcontextprotocol/servers",
    displayName: "MCP Official Servers",
    description: "Official MCP server implementations by Anthropic — filesystem, fetch, memory, and more",
    isOfficial: true,
    sourceRegistry: "official",
  },
  {
    name: "sirmews/mcp-pdf",
    displayName: "PDF Tools MCP",
    description: "Read and extract text from PDF documents using MCP",
    isOfficial: false,
    sourceRegistry: "github",
  },
  {
    name: "bskimball/mcp-postgres",
    displayName: "PostgreSQL MCP",
    description: "Query PostgreSQL databases via MCP — execute SQL, list schemas, explore tables",
    isOfficial: false,
    sourceRegistry: "github",
  },
  {
    name: "dsmurl/mcp-sqlite",
    displayName: "SQLite MCP",
    description: "Query SQLite databases via MCP with read and write operations",
    isOfficial: false,
    sourceRegistry: "github",
  },
  {
    name: "zaddyio/mcp-brave-search",
    displayName: "Brave Search MCP",
    description: "Search the web using Brave Search API via MCP",
    isOfficial: false,
    sourceRegistry: "github",
  },
];

const SEED_TOOLS: Record<string, { name: string; description: string }[]> = {
  "modelcontextprotocol/servers": [
    { name: "read_file", description: "Read contents of a file from the filesystem with optional offset and limit" },
    { name: "write_file", description: "Write content to a file on the filesystem" },
    { name: "list_directory", description: "List files and directories at a given path" },
    { name: "fetch_url", description: "Fetch content from a URL and return as markdown" },
  ],
  "sirmews/mcp-pdf": [
    { name: "extract_text", description: "Extract plain text content from a PDF document" },
    { name: "extract_tables", description: "Extract tabular data from PDF pages into structured JSON" },
    { name: "get_metadata", description: "Read PDF document metadata including title, author, page count" },
  ],
  "bskimball/mcp-postgres": [
    { name: "execute_sql", description: "Execute a SQL query against the connected PostgreSQL database" },
    { name: "list_tables", description: "List all tables in the connected database schema" },
    { name: "describe_table", description: "Get column names, types, and constraints for a table" },
  ],
  "dsmurl/mcp-sqlite": [
    { name: "query", description: "Run a SQL query on the connected SQLite database" },
    { name: "list_tables", description: "List all tables in the SQLite database" },
  ],
  "zaddyio/mcp-brave-search": [
    { name: "web_search", description: "Search the web for information using Brave Search" },
    { name: "local_search", description: "Search for local businesses and places near a location" },
  ],
};

async function seed() {
  console.log("🌱 Starting seed...");

  for (const server of SEED_SERVERS) {
    console.log(`  → Creating server: ${server.name}`);

    const parts = server.name.split("/");
    const canonicalId = buildCanonicalId(
      "mcp",
      parts.length > 1 ? parts[0]! : "unknown",
      parts.length > 1 ? parts[1]! : server.name
    );

    const [inserted] = await db
      .insert(servers)
      .values({
        name: server.name,
        canonicalId,
        displayName: server.displayName,
        description: server.description,
        isOfficial: server.isOfficial,
        sourceRegistry: server.sourceRegistry,
        installCmd: "npx",
      })
      .returning({ id: servers.id });

    if (!inserted) continue;

    const serverTools = SEED_TOOLS[server.name];
    if (!serverTools) continue;

    for (const tool of serverTools) {
      const toolDescription = `${server.description}. Tool: ${tool.description}`;
      const embedding = await generateEmbedding(toolDescription);

      const [insertedTool] = await db
        .insert(tools)
        .values({
          serverId: inserted.id,
          name: tool.name,
          description: tool.description,
          sideEffects: tool.name.includes("write") || tool.name.includes("execute")
            ? "destructive"
            : "read_only",
          tokenCount: toolDescription.length,
          embedding: embedding as any,
        })
        .returning({ id: tools.id });

      if (insertedTool) {
        // Score quality
        const quality = scoreToolQuality({
          id: insertedTool.id,
          name: tool.name,
          description: tool.description,
          inputSchema: null,
          tokenCount: toolDescription.length,
        });

        await db.insert(qualityScores).values(quality as any);
      }
    }
  }

  console.log("✅ Seed complete!");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
