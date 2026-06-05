// HTTP Proxy Executor — Phase 3B
// Executes MCP tools via HTTP proxy（no Docker needed）
// Agent → Intel API → tool's HTTP endpoint → result

import { recordExecution } from "./execution-tracker.js";

interface ProxyExecuteInput {
  toolId: string;
  toolName: string;
  endpoint: string;         // tool's HTTP endpoint URL
  method?: string;          // GET | POST（default POST）
  params?: Record<string, unknown>;
  apiKey?: string;          // optional: tool's API key
  timeoutMs?: number;       // default 15000
  agentId?: string;
  partnerSource?: string;
}

interface ProxyExecuteResult {
  success: boolean;
  result: unknown;
  latencyMs: number;
  tokensConsumed: number;
  error?: string;
}

export async function proxyExecute(input: ProxyExecuteInput): Promise<ProxyExecuteResult> {
  const startTime = Date.now();
  const timeout = input.timeoutMs || 15000;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Agent-Tool-Intel/0.2.0",
    };

    if (input.apiKey) {
      headers["Authorization"] = "Bearer " + input.apiKey;
    }

    const method = input.method || "POST";
    const body = method !== "GET" ? JSON.stringify(input.params || {}) : undefined;

    const response = await fetch(input.endpoint, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;
    let result: unknown;

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("json")) {
      result = await response.json();
    } else {
      result = await response.text();
    }

    const success = response.ok;
    const tokensConsumed = estimateTokens(JSON.stringify(input.params || {}), JSON.stringify(result));

    // Record execution
    await recordExecution({
      toolId: input.toolId,
      success,
      latencyMs,
      tokensConsumed,
      errorMessage: success ? undefined : "HTTP " + response.status + ": " + JSON.stringify(result).slice(0, 200),
      agentId: input.agentId,
      partnerSource: input.partnerSource,
    }).catch(() => { /* non-blocking */ });

    return {
      success,
      result,
      latencyMs,
      tokensConsumed,
      error: success ? undefined : "HTTP " + response.status,
    };
  } catch (e: any) {
    const latencyMs = Date.now() - startTime;

    await recordExecution({
      toolId: input.toolId,
      success: false,
      latencyMs,
      tokensConsumed: 0,
      errorMessage: e.message || "Unknown error",
      agentId: input.agentId,
      partnerSource: input.partnerSource,
    }).catch(() => {});

    return {
      success: false,
      result: null,
      latencyMs,
      tokensConsumed: 0,
      error: e.name === "AbortError" ? "Timeout after " + timeout + "ms" : e.message,
    };
  }
}

function estimateTokens(input: string, output: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil((input.length + output.length) / 4);
}

// ── Execution Gateway Route Handler ──

import { db } from "../db/index.js";
import { servers, tools as toolsTable, qualityScores } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function executeToolById(toolId: string, params?: Record<string, unknown>, agentId?: string): Promise<ProxyExecuteResult> {
  // Lookup tool info
  const rows = await db
    .select({
      toolName: toolsTable.name,
      serverName: servers.name,
      endpoint: servers.sourceUrl,
      grade: qualityScores.grade,
    })
    .from(toolsTable)
    .innerJoin(servers, eq(toolsTable.serverId, servers.id))
    .leftJoin(qualityScores, eq(toolsTable.id, qualityScores.toolId))
    .where(eq(toolsTable.id, toolId))
    .limit(1);

  const row = rows[0];
  if (!row || !row.endpoint) {
    return {
      success: false,
      result: null,
      latencyMs: 0,
      tokensConsumed: 0,
      error: "Tool not found or has no HTTP endpoint",
    };
  }

  return proxyExecute({
    toolId,
    toolName: row.toolName,
    endpoint: row.endpoint,
    params,
    agentId,
    partnerSource: "direct",
    timeoutMs: 15000,
  });
}

// Multi-tool routing: same query, multiple tools → pick best
export async function qualityDrivenExecute(
  query: string,
  params?: Record<string, unknown>,
  agentId?: string
): Promise<ProxyExecuteResult & { toolPicked: string | null }> {
  // Search for matching tools, pick highest quality + trust
  const { searchTools } = await import("./search.js");
  const searchResult = await searchTools({ query, maxResults: 3, minScore: 70 });

  if (!searchResult.results || searchResult.results.length === 0) {
    return {
      success: false,
      result: null,
      latencyMs: 0,
      tokensConsumed: 0,
      toolPicked: null,
      error: "No qualified tool found for: " + query,
    };
  }

  // Pick best by quality score
  const best = searchResult.results[0]!;
  const toolId = best.toolId;

  const execResult = await executeToolById(toolId, params, agentId);
  return { ...execResult, toolPicked: best.toolName };
}
