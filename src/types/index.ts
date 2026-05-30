import { z } from "zod";

// ── Canonical Tool ID ──
// Format: tool:{source}:{namespace}/{name}@{version}
// Sources: mcp, automine, composed, custom
export type ToolSource = "mcp" | "automine" | "composed" | "custom";

export function buildCanonicalId(
  source: ToolSource,
  namespace: string,
  name: string,
  version = "latest"
): string {
  return `tool:${source}:${namespace}/${name}@${version}`;
}

// ── MCP Server ──

export interface Server {
  id: string;
  name: string;
  canonicalId: string;
  displayName: string | null;
  description: string;
  repository: string | null;
  license: string | null;
  publisher: string | null;
  isOfficial: boolean;
  installCmd: string | null;
  installType: "npx" | "pip" | "docker" | "go" | null;
  websiteUrl: string | null;
  sourceRegistry: string | null;
  sourceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Tool ──

export interface Tool {
  id: string;
  serverId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  sideEffects: "read_only" | "destructive" | "idempotent";
  tokenCount: number | null;
  embedding: number[] | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Quality Score ──

export interface QualityScore {
  id: string;
  toolId: string;
  overallScore: number;
  grade: string;
  correctness: number;
  efficiency: number;
  descriptionQ: number;
  security: number;
  installRel: number;
  issuesFound: QualityIssue[];
  scoredAt: Date;
}

export interface QualityIssue {
  type: "correctness" | "efficiency" | "description" | "security" | "install";
  severity: "low" | "medium" | "high" | "critical";
  detail: string;
}

// ── Sandbox Result ──

export interface SandboxResult {
  id: string;
  toolId: string;
  passed: boolean;
  perToolResult: {
    toolName: string;
    passed: boolean;
    latencyMs: number;
    outputValid: boolean;
    error?: string;
  }[];
  totalTimeMs: number;
  errorLog: string | null;
  testedAt: Date;
}

// ── Feedback ──

export interface Feedback {
  id: string;
  toolId: string;
  searchId: string | null;
  result: "success" | "partial" | "failure";
  latencyMs: number | null;
  tokensUsed: number | null;
  rating: 1 | 2 | 3 | 4 | 5;
  notes: string | null;
  submittedAt: Date;
}

// ── API Schemas ──

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  minScore: z.number().min(0).max(100).optional(),
  maxResults: z.number().min(1).max(20).default(5),
  categories: z.array(z.string()).optional(),
  preferences: z
    .object({
      maxTokensPerCall: z.number().optional(),
      requireSandboxVerified: z.boolean().optional(),
      sideEffects: z.array(z.string()).optional(),
    })
    .optional(),
});

export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const FeedbackRequestSchema = z.object({
  searchId: z.string().optional(),
  toolId: z.string(), // UUID or canonical_id (e.g. tool:mcp:sirmews/mcp-pdf@latest)
  result: z.enum(["success", "partial", "failure"]),
  latencyMs: z.number().optional(),
  tokensUsed: z.number().optional(),
  rating: z.number().int().min(1).max(5),
  notes: z.string().max(500).optional(),
});

export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export interface SearchResultTool {
  rank: number;
  toolId: string;
  toolName: string;
  serverName: string;
  relevanceScore: number;
  quality: {
    overall: number;
    grade: string;
    breakdown: {
      correctness: number;
      efficiency: number;
      descriptionQ: number;
      security: number;
      installRel: number;
    };
  };
  trust: {
    score: number;
    successRate: string;
    totalCalls: number;
    last30Days: { success: number; fail: number };
    avgLatencyMs: number;
  };
  security: {
    grade: string;
    vulnerabilities: number;
    lastAudit: string;
  };
  efficiency: {
    toolDefinitionTokens: number;
    avgTokensPerCall: number;
    rating: "excellent" | "good" | "acceptable" | "poor";
  };
  install: {
    method: string;
    command: string;
  };
  sandboxVerified: boolean;
  lastSandboxTest: string;
  recommendationSummary: string;
  // Agent-native selection signals
  agentSignals?: {
    isOfficial: boolean;
    githubStars: number;
    lastPushDaysAgo: number | null;
    activityStatus: "active" | "maintained" | "stale" | "abandoned";
    documentation: {
      hasReadme: boolean;
      descriptionQuality: "excellent" | "good" | "acceptable" | "poor";
    };
  };
  // Community score (human-generated signals)
  communityScore: number;
  // Trust Tier: composite of quality + trust + activity + community
  trustTier: {
    tier: "premium" | "verified" | "reliable" | "emerging" | "caution" | "deprecated";
    label: string;
    icon: string;
    description: string;
  };
  // Flags quality-trust contradiction for agent & human awareness
  discrepancy?: {
    type: "quality_beats_trust" | "trust_beats_quality" | "none";
    severity: "warning" | "caution" | "info";
    message: string;
    detail: string;
  };
}

export interface SearchResponse {
  searchId: string;
  results: SearchResultTool[];
  topPick: {
    toolId: string;
    reason: string;
  } | null;
}
