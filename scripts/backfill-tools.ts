// Backfill: create tools for servers that don't have any
import { db } from "../src/db/index.js";
import { servers, tools, qualityScores } from "../src/db/schema.js";
import { generateEmbedding } from "../src/services/embedding.js";
import { scoreToolQuality } from "../src/services/quality.js";
import { eq, sql } from "drizzle-orm";

async function backfill() {
  // Find servers without tools
  const missing = await db.execute(sql`
    SELECT s.id, s.name, s.description, s.install_cmd, s.install_type
    FROM servers s
    LEFT JOIN tools t ON t.server_id = s.id
    WHERE t.id IS NULL
    LIMIT 2000
  `);

  const rows = missing.rows as any[];
  console.log(`Found ${rows.length} servers without tools\n`);

  let count = 0;
  for (const row of rows) {
    try {
      const parts = (row.name as string).split("/");
      const toolName = (parts[1] || row.name).replace(/[^a-z0-9_]/gi, "_").toLowerCase().slice(0, 50);
      const desc = (row.description || row.name).slice(0, 300);
      const embeddingText = `${desc}. Tool for ${toolName}`;
      const embedding = await generateEmbedding(embeddingText);

      const sideEffects = /write|delete|create|update|execute|deploy|send/i.test(desc) ? "destructive" : "read_only";

      const [t] = await db.insert(tools).values({
        serverId: row.id,
        name: toolName,
        description: desc,
        sideEffects: sideEffects as any,
        tokenCount: embeddingText.length,
        embedding: embedding as any,
      }).returning({ id: tools.id });

      if (t) {
        const quality = scoreToolQuality({
          id: t.id,
          name: toolName,
          description: desc,
          inputSchema: null,
          tokenCount: embeddingText.length,
        });
        await db.insert(qualityScores).values(quality as any);
        count++;
        if (count % 100 === 0) console.log(`  ${count} tools created...`);
      }
    } catch(e) { continue; }
  }

  console.log(`\n✅ Backfill complete: ${count} tools created`);
  const [totalTools] = await db.select({ count: sql<number>`count(*)` }).from(tools);
  console.log(`Total tools: ${totalTools?.count}`);
}

backfill();
