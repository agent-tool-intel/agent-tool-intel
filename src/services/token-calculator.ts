// Token Calculator — Phase 3A Feature #4, #20
// Calculates token savings: platform-optimized vs DIY

interface TokenEstimate {
  search: number;      // tokens to find the tool
  understand: number;  // tokens to read docs + schema
  execute: number;     // tokens for the actual call
  errorRetry: number;  // tokens wasted on failed attempts + retries
}

interface TokenComparison {
  diy: TokenEstimate;
  taas: TokenEstimate;
  savings: {
    totalTokens: number;
    pctSaved: number;
    costSaved: number;        // USD
    annualProjection: number; // for 1000 execs/month
  };
}

const AVG_TOKEN_COST = 0.000015; // $15 per 1M tokens (Claude Sonnet pricing)

export function calculateTokenSavings(
  monthlyExecutions: number,
  avgSuccessRate: number, // 0-100
): TokenComparison {
  const diy = estimateDiyTokens(avgSuccessRate);
  const taas = estimateTaasTokens();

  const diyTotal = diy.search + diy.understand + diy.execute + diy.errorRetry;
  const taasTotal = taas.search + taas.understand + taas.execute + taas.errorRetry;
  const savedPerExec = diyTotal - taasTotal;
  const totalSaved = savedPerExec * monthlyExecutions;
  const costPerExec = totalSaved * AVG_TOKEN_COST;

  return {
    diy,
    taas,
    savings: {
      totalTokens: totalSaved,
      pctSaved: Math.round((savedPerExec / diyTotal) * 100),
      costSaved: Math.round(costPerExec * 100) / 100,
      annualProjection: Math.round(costPerExec * 12 * 100) / 100,
    },
  };
}

function estimateDiyTokens(successRate: number): TokenEstimate {
  // Agent DIY: search → read docs → call → retry if fail
  const baseRetry = Math.max(0, (100 - successRate) / 100 * 2); // avg ~2 retries at low success

  return {
    search: 200,       // Web Search + GitHub scan
    understand: 800,   // Read README, schema, examples
    execute: 500,      // Build + execute the call
    errorRetry: Math.round(baseRetry * 660), // Retry = execute + debug
  };
}

function estimateTaasTokens(): TokenEstimate {
  // Platform: POST /search → POST /execute → result
  return {
    search: 15,        // API call: query embedding
    understand: 0,     // Platform handles this
    execute: 35,       // API call: execute + return
    errorRetry: 0,     // Platform handles retry internally
  };
}

export function renderTokenSavingsMd(comparison: TokenComparison, monthlyExecutions: number): string {
  const { diy, taas, savings } = comparison;

  return `## ⚡ Token Efficiency

| Metric | Agent DIY | Platform |
|--------|:---:|:---:|
| Search | ${diy.search} tokens | ${taas.search} tokens |
| Understand tool | ${diy.understand} tokens | ${taas.understand} tokens |
| Execute | ${diy.execute} tokens | ${taas.execute} tokens |
| Error/Retry (avg) | ~${diy.errorRetry} tokens | ${taas.errorRetry} tokens |
| **Total per execution** | **~${diy.search + diy.understand + diy.execute + diy.errorRetry} tokens** | **~${taas.search + taas.understand + taas.execute + taas.errorRetry} tokens** |

### 💰 Savings

| Metric | Value |
|--------|-------|
| Tokens saved per execution | **${savings.totalTokens}** (${savings.pctSaved}%) |
| Cost saved per execution | **$${savings.costSaved}** |
| Annual savings (@ ${monthlyExecutions.toLocaleString()} execs/month) | **$${savings.annualProjection.toLocaleString()}** |
`;
}

export function renderToolTokenEfficiency(
  toolName: string,
  tokenCount: number | null,
  avgLatencyMs: number | null,
): { tier: string; emoji: string; label: string } {
  if (!tokenCount) return { tier: "unknown", emoji: "⚪", label: "Not benchmarked" };

  if (tokenCount <= 30) return { tier: "elite", emoji: "🥇", label: "Elite (≤30 tokens)" };
  if (tokenCount <= 60) return { tier: "excellent", emoji: "🥈", label: "Excellent (≤60 tokens)" };
  if (tokenCount <= 100) return { tier: "good", emoji: "🥉", label: "Good (≤100 tokens)" };
  if (tokenCount <= 200) return { tier: "fair", emoji: "⚪", label: "Fair (≤200 tokens)" };
  return { tier: "poor", emoji: "🔴", label: "Needs optimization (>200 tokens)" };
}
