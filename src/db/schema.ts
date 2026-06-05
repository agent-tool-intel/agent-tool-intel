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

// ── 6. Outreach Log（防止重复发送）──

export const outreachLog = pgTable("outreach_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  owner: text("owner").notNull(),           // GitHub owner login（小写）
  repo: text("repo").notNull(),             // full repo name
  issueUrl: text("issue_url"),              // created issue URL
  status: text("status").notNull().default("sent"), // sent / accepted / rejected / spam
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow(),
});

// ── 7. Search Logs ──

export const searchLogs = pgTable("search_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  query: text("query").notNull(),
  queryEmbedding: vector("query_embedding", { dimensions: 1024 }),
  resultsCount: integer("results_count"),
  topToolIds: uuid("top_tool_ids").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── 8. Execution Events（Phase 3A）──

export const executionEvents = pgTable("execution_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  toolId: uuid("tool_id")
    .references(() => tools.id, { onDelete: "cascade" })
    .notNull(),
  success: boolean("success").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  tokensConsumed: integer("tokens_consumed"),
  errorMessage: text("error_message"),
  agentId: text("agent_id"),
  partnerSource: text("partner_source"), // "aigen" | "agentpilot" | "self"
  executedAt: timestamp("executed_at", { withTimezone: true }).defaultNow(),
});

// ── 9. Execution Stats（daily rollup, Phase 3A）──

export const executionStats = pgTable("execution_stats", {
  id: uuid("id").defaultRandom().primaryKey(),
  toolId: uuid("tool_id")
    .references(() => tools.id, { onDelete: "cascade" })
    .notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  totalExecutions: integer("total_executions").default(0).notNull(),
  successCount: integer("success_count").default(0).notNull(),
  failCount: integer("fail_count").default(0).notNull(),
  avgLatencyMs: decimal("avg_latency_ms", { precision: 10, scale: 2 }),
  totalTokens: integer("total_tokens").default(0),
  uniqueAgents: integer("unique_agents").default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  toolDateIdx: uniqueIndex("exec_stats_tool_date_idx").on(table.toolId, table.date),
}));

// ── 10. Builder Accounts（Phase 3C）──

export const builderAccounts = pgTable("builder_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  githubUserId: text("github_user_id").unique(),
  githubUsername: text("github_username").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastLogin: timestamp("last_login", { withTimezone: true }),
});

// ── 11. Tool Claims（Phase 3C）──

export const toolClaims = pgTable("tool_claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  builderId: uuid("builder_id")
    .references(() => builderAccounts.id, { onDelete: "cascade" })
    .notNull(),
  serverId: uuid("server_id")
    .references(() => servers.id, { onDelete: "cascade" })
    .notNull(),
  verificationMethod: text("verification_method").default("github_oauth"),
  verified: boolean("verified").default(false),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  oneClaimPerServer: uniqueIndex("one_claim_per_server_idx").on(table.serverId),
}));

// ── 12. Governance Policies（Phase 3C）──

export const governancePolicies = pgTable("governance_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgName: text("org_name").notNull(),
  defaultPolicy: text("default_policy").notNull().default("allow_verified_only"),
  // "allow_all" | "allow_verified_only" | "block_all"
  monthlyBudgetCap: decimal("monthly_budget_cap", { precision: 12, scale: 2 }),
  createdBy: uuid("created_by")
    .references(() => builderAccounts.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ── 13. Tool Allowlist/Blocklist（Phase 3C）──

export const governanceList = pgTable("governance_list", {
  id: uuid("id").defaultRandom().primaryKey(),
  policyId: uuid("policy_id")
    .references(() => governancePolicies.id, { onDelete: "cascade" })
    .notNull(),
  toolId: uuid("tool_id")
    .references(() => tools.id, { onDelete: "cascade" })
    .notNull(),
  listType: text("list_type").notNull(), // "allow" | "block"
  reason: text("reason"),
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  oneEntryPerTool: uniqueIndex("gov_list_tool_policy_idx").on(table.policyId, table.toolId),
}));
