import { pgTable, uuid, text, boolean, integer, decimal, timestamp, jsonb, vector, uniqueIndex } from "drizzle-orm/pg-core";

// ── 1. Servers ──

export const servers = pgTable("servers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  canonicalId: text("canonical_id").notNull().unique(),
  displayName: text("display_name"),
  description: text("description").notNull(),
  repository: text("repository"),
  license: text("license"),
  publisher: text("publisher"),
  isOfficial: boolean("is_official").default(false),
  installCmd: text("install_cmd"),
  installType: text("install_type"),
  websiteUrl: text("website_url"),
  sourceRegistry: text("source_registry"),
  sourceUrl: text("source_url"),
  metadata: jsonb("metadata").default({}),    // {stars, downloads, pushed_at, topics, license...}
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ── 2. Tools ──

export const tools = pgTable(
  "tools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id")
      .references(() => servers.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    inputSchema: jsonb("input_schema"),
    outputSchema: jsonb("output_schema"),
    sideEffects: text("side_effects").default("read_only"),
    tokenCount: integer("token_count"),
    embedding: vector("embedding", { dimensions: 1024 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    serverTool: uniqueIndex("server_tool_idx").on(table.serverId, table.name),
  })
);

// ── 3. Quality Scores ──

export const qualityScores = pgTable("quality_scores", {
  id: uuid("id").defaultRandom().primaryKey(),
  toolId: uuid("tool_id")
    .references(() => tools.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  overallScore: decimal("overall_score", { precision: 5, scale: 2 }),
  grade: text("grade"),
  correctness: decimal("correctness", { precision: 5, scale: 2 }),
  efficiency: decimal("efficiency", { precision: 5, scale: 2 }),
  descriptionQ: decimal("description_q", { precision: 5, scale: 2 }),
  security: decimal("security", { precision: 5, scale: 2 }),
  installRel: decimal("install_rel", { precision: 5, scale: 2 }),
  issuesFound: jsonb("issues_found"),
  scoredAt: timestamp("scored_at", { withTimezone: true }).defaultNow(),
});

// ── 4. Sandbox Results ──

export const sandboxResults = pgTable("sandbox_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  toolId: uuid("tool_id")
    .references(() => tools.id, { onDelete: "cascade" })
    .notNull(),
  passed: boolean("passed").notNull(),
  perToolResult: jsonb("per_tool_result"),
  totalTimeMs: integer("total_time_ms"),
  errorLog: text("error_log"),
  testedAt: timestamp("tested_at", { withTimezone: true }).defaultNow(),
});

// ── 5. Feedback ──

export const feedback = pgTable("feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  toolId: text("tool_id").notNull(), // canonical_id or UUID
  searchId: text("search_id"),
  result: text("result").notNull(),
  latencyMs: integer("latency_ms"),
  tokensUsed: integer("tokens_used"),
  rating: integer("rating"),
  notes: text("notes"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow(),
});

// ── 6. Search Logs ──

export const searchLogs = pgTable("search_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  query: text("query").notNull(),
  queryEmbedding: vector("query_embedding", { dimensions: 1024 }),
  resultsCount: integer("results_count"),
  topToolIds: uuid("top_tool_ids").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
