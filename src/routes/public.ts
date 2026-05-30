import { Hono } from "hono";
import { db } from "../db/index.js";
import { servers, tools, qualityScores, feedback } from "../db/schema.js";
import { eq, desc, sql } from "drizzle-orm";

export const publicRoute = new Hono();

// ── API Docs page ──

publicRoute.get("/docs", (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>API Docs — Agent Tool Intelligence</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a0f; color: #e0e0e0; line-height:1.6; padding:40px 20px; }
.container { max-width:800px; margin:0 auto; }
h1 { font-size:1.8em; margin-bottom:8px; background: linear-gradient(135deg, #7c9ff5, #a78bfa); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
h2 { font-size:1.2em; margin:32px 0 12px; color:#e0e0e0; }
.endpoint { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:20px; margin-bottom:16px; }
.method { display:inline-block; padding:3px 10px; border-radius:4px; font-weight:700; font-size:0.8em; margin-right:10px; }
.method.post { background:rgba(40,167,69,0.2); color:#28a745; }
.method.get { background:rgba(108,117,227,0.2); color:#6c75e3; }
.endpoint .path { font-family:monospace; color:#7c9ff5; font-size:1.05em; }
.endpoint .desc { color:#8b949e; margin-top:8px; font-size:0.9em; }
.endpoint code { display:block; background:#0d1117; border:1px solid #30363d; border-radius:6px; padding:12px 16px; font-size:0.82em; margin:12px 0; overflow-x:auto; color:#e0e0e0; white-space:pre-wrap; word-break:break-all; }
.back { color:#7c9ff5; text-decoration:none; font-size:0.9em; }
.back:hover { color:#a0b8ff; }
</style>
</head>
<body>
<div class="container">
<a href="/" class="back">← Back to Leaderboard</a>
<h1>API Documentation</h1>
<p style="color:#8b949e;margin-bottom:24px">Base URL: <code style="color:#7c9ff5;background:#161b22;padding:2px 8px;border-radius:4px">https://agent-tool-intel-production.up.railway.app</code></p>

<h2>Search Tools</h2>
<div class="endpoint">
  <span class="method post">POST</span><span class="path">/api/v1/search</span>
  <div class="desc">Semantic search with agent signals, quality scores, and community data.</div>
  <code>curl -X POST https://agent-tool-intel-production.up.railway.app/api/v1/search \\
  -H "Content-Type: application/json" \\
  -d '{"query":"extract tables from PDF","maxResults":3}'</code>
</div>

<h2>Get Tool Detail</h2>
<div class="endpoint">
  <span class="method get">GET</span><span class="path">/api/v1/tools/:id</span>
  <div class="desc">Full tool details with quality, trust, sandbox results.</div>
  <code>curl https://agent-tool-intel-production.up.railway.app/api/v1/tools/{tool_id}</code>
</div>

<h2>Sandbox Test</h2>
<div class="endpoint">
  <span class="method post">POST</span><span class="path">/api/v1/tools/:id/test</span>
  <div class="desc">Run automated validation checks on a tool.</div>
  <code>curl -X POST https://agent-tool-intel-production.up.railway.app/api/v1/tools/{tool_id}/test</code>
</div>

<h2>Submit Feedback</h2>
<div class="endpoint">
  <span class="method post">POST</span><span class="path">/api/v1/feedback</span>
  <div class="desc">Submit agent usage feedback to improve trust scores.</div>
  <code>curl -X POST https://agent-tool-intel-production.up.railway.app/api/v1/feedback \\
  -H "Content-Type: application/json" \\
  -d '{"toolId":"tool:mcp:puppeteer/puppeteer@latest","result":"success","rating":5}'</code>
</div>

<h2>Grade Badge</h2>
<div class="endpoint">
  <span class="method get">GET</span><span class="path">/badge/:server_name</span>
  <div class="desc">Dynamic SVG badge showing tool quality grade.</div>
  <code>https://agent-tool-intel-production.up.railway.app/badge/puppeteer%2Fpuppeteer</code>
</div>

<h2>Health Check</h2>
<div class="endpoint">
  <span class="method get">GET</span><span class="path">/health</span>
  <div class="desc">Service health status.</div>
  <code>curl https://agent-tool-intel-production.up.railway.app/health</code>
</div>

</div>
</body>
</html>`;
  return c.html(html);
});

// ── Scoring Methodology page ──

publicRoute.get("/scoring/methodology", async (c) => {
  // Get current grade distribution
  const gradeDist = await db
    .select({ grade: qualityScores.grade, cnt: sql<number>`count(*)` })
    .from(qualityScores)
    .groupBy(qualityScores.grade)
    .orderBy(qualityScores.grade);
  const total = gradeDist.reduce((s, g) => s + Number(g.cnt), 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Scoring Methodology — Agent Tool Intelligence</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a0f; color: #e0e0e0; line-height:1.7; padding:40px 20px; }
.container { max-width:800px; margin:0 auto; }
h1 { font-size:1.8em; background: linear-gradient(135deg, #7c9ff5, #a78bfa); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
h2 { font-size:1.2em; margin:32px 0 12px; color:#e0e0e0; border-bottom:1px solid #21262d; padding-bottom:8px; }
h3 { font-size:1em; margin:16px 0 8px; color:#c0c0c0; }
p, li { color:#8b949e; margin-bottom:10px; }
table { width:100%; border-collapse:collapse; margin:12px 0 20px; }
th, td { padding:10px 14px; text-align:left; border-bottom:1px solid #21262d; }
th { color:#c0c0c0; font-weight:600; font-size:0.85em; }
td { font-size:0.9em; }
code { background:#161b22; border:1px solid #30363d; border-radius:4px; padding:2px 6px; font-size:0.85em; color:#7c9ff5; }
.back { color:#7c9ff5; text-decoration:none; font-size:0.9em; }
.bar { display:inline-block; height:14px; border-radius:3px; margin-right:8px; vertical-align:middle; }
.green { background:#28a745; } .purple { background:#6c75e3; } .orange { background:#ffab00; } .red { background:#dc3545; }
</style>
</head>
<body>
<div class="container">
<a href="/" class="back">← Back to Leaderboard</a>
<h1>Scoring Methodology</h1>
<p>How we evaluate MCP tools — transparent for builders, actionable for agents.</p>

<h2>Current Grade Distribution</h2>
<table>
<tr><th>Grade</th><th>Count</th><th>%</th><th>Distribution</th></tr>
${gradeDist.map(g => {
  const pct = ((Number(g.cnt) / total) * 100).toFixed(1);
  const grade = g.grade || "?";
  const color = grade.includes("A") ? "green" : grade.includes("B") ? "purple" : grade.includes("C") ? "orange" : "red";
  return `<tr><td><strong>${grade}</strong></td><td>${Number(g.cnt).toLocaleString()}</td><td>${pct}%</td><td><span class="bar ${color}" style="width:${Math.max(1, Number(pct)) * 3}px"></span></td></tr>`;
}).join("")}
</table>
<p style="color:#8b949e;font-size:0.85em">Total tools scored: ${total.toLocaleString()}</p>

<h2>1. Quality Score (Static Analysis)</h2>
<p>Five dimensions, automatically evaluated from the tool definition. Weighted composite: 0-100.</p>
<table>
<tr><th>Dimension</th><th>Weight</th><th>What we measure</th></tr>
<tr><td>Schema Correctness</td><td>30%</td><td>Does the tool have a valid input/output schema? JSON Schema structure, type field, properties, required fields.</td></tr>
<tr><td>Token Efficiency</td><td>25%</td><td>How many tokens does the tool definition consume? Every token counts against the agent's context window. ≤80 tokens = optimal.</td></tr>
<tr><td>Description Quality</td><td>20%</td><td>Is the description clear, concise, and actionable? Length (50-200 chars optimal), action verbs, naming conventions.</td></tr>
<tr><td>Security</td><td>15%</td><td>Prompt injection patterns, suspicious language, security keywords. No runtime sandbox yet.</td></tr>
<tr><td>Install Reliability</td><td>10%</td><td>Can we detect the install method? HTTP endpoint vs npm/pip/go/cargo. Clear install instructions help.</td></tr>
</table>

<h3>Grade Mapping</h3>
<table>
<tr><th>Score Range</th><th>Grade</th><th>Interpretation</th></tr>
<tr><td>92-100</td><td>A+</td><td>Exceptional quality across all dimensions</td></tr>
<tr><td>82-91</td><td>A</td><td>Strong quality, minor improvements possible</td></tr>
<tr><td>74-81</td><td>B+</td><td>Good quality, some dimensions need attention</td></tr>
<tr><td>66-73</td><td>B</td><td>Solid, with clear improvement areas</td></tr>
<tr><td>55-65</td><td>C</td><td>Average — functional but needs work</td></tr>
<tr><td>40-54</td><td>D</td><td>Below average — significant issues</td></tr>
<tr><td>0-39</td><td>F</td><td>Critical issues — not recommended for agents</td></tr>
</table>

<h2>2. Trust Score (Real-World Performance)</h2>
<p>Derived from actual agent usage. Starts at 50 (neutral baseline) and improves as agents report success.</p>
<table>
<tr><th>Signal</th><th>Weight</th><th>Source</th></tr>
<tr><td>Success Rate</td><td>40%</td><td>Reported success/failure from agent calls</td></tr>
<tr><td>Recency</td><td>25%</td><td>How recently was the tool used? Active tools score higher.</td></tr>
<tr><td>Consistency</td><td>20%</td><td>Stability of success rate + user ratings</td></tr>
<tr><td>Community</td><td>15%</td><td>Usage volume + GitHub engagement</td></tr>
</table>

<h2>3. Agent Signals (Discovery Metadata)</h2>
<p>Signals that help agents decide whether to trust a tool before calling it.</p>
<table>
<tr><th>Signal</th><th>What it means</th></tr>
<tr><td>Is Official</td><td>Maintained by the service provider or platform organization</td></tr>
<tr><td>GitHub Stars</td><td>Community endorsement (log-scale scoring)</td></tr>
<tr><td>Activity Status</td><td>Active (≤30d), Maintained (≤180d), Stale (≤365d), Abandoned (>365d)</td></tr>
<tr><td>Community Score</td><td>Composite: stars (50%) + activity (35%) + official bonus (15%)</td></tr>
</table>

<h2>4. Discrepancy Flag</h2>
<p>When quality and trust contradict each other, we flag it:</p>
<ul>
<li><strong>Quality > Trust</strong>: Well-designed but unverified in production. Caution: may work on paper but not battle-tested.</li>
<li><strong>Trust > Quality</strong>: Widely used despite design issues. Adoption paradox — works in practice but may have maintainability risks.</li>
</ul>

<h2>5. Continuous Improvement</h2>
<p>Scores are recalculated periodically. Improving your tool's schemas, descriptions, or install documentation directly improves your Quality Score. Real-world agent usage improves your Trust Score. We're actively calibrating based on ecosystem feedback.</p>

<p style="color:#8b949e;font-size:0.85em;margin-top:30px;">Last updated: ${new Date().toISOString().slice(0, 10)} · <a href="/docs" style="color:#7c9ff5">API Docs</a> · <a href="https://github.com/HMCHENGGH/agent-tool-intel" style="color:#7c9ff5">GitHub</a></p>
</div>
</body>
</html>`;
  return c.html(html);
});

// ── Public Roadmap ──

publicRoute.get("/roadmap", (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Roadmap — Agent Tool Intelligence</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a0f; color: #e0e0e0; line-height:1.7; padding:40px 20px; }
.container { max-width:800px; margin:0 auto; }
h1 { font-size:1.8em; background: linear-gradient(135deg, #7c9ff5, #a78bfa); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
h2 { font-size:1.2em; margin:32px 0 12px; border-bottom:1px solid #21262d; padding-bottom:8px; }
.phase { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:20px; margin-bottom:16px; }
.phase h3 { margin-bottom:8px; }
.done { color:#28a745; } .wip { color:#ffab00; } .planned { color:#6c75e3; }
.check { color:#28a745; margin-right:8px; }
ul { list-style:none; padding:0; }
li { color:#8b949e; padding:4px 0; font-size:0.9em; }
.back { color:#7c9ff5; text-decoration:none; font-size:0.9em; }
</style>
</head>
<body>
<div class="container">
<a href="/" class="back">← Back</a>
<h1>Public Roadmap</h1>
<p style="color:#8b949e;margin-bottom:24px">What we're building and when. Updated as we ship.</p>

<div class="phase">
<h3 class="done">✅ Phase 1 — Foundation (Complete)</h3>
<ul>
<li><span class="check">✓</span>Semantic search across MCP ecosystem</li>
<li><span class="check">✓</span>Automated quality scoring (5 dimensions)</li>
<li><span class="check">✓</span>Trust engine with feedback loop</li>
<li><span class="check">✓</span>Grade badges for GitHub README</li>
<li><span class="check">✓</span>Public API + documentation</li>
<li><span class="check">✓</span>19,000+ MCP servers indexed</li>
</ul>
</div>

<div class="phase">
<h3 class="wip">🔧 Phase A — Build Trust (In Progress)</h3>
<ul>
<li><span class="check">✓</span>Scoring calibration (meaningful distribution)</li>
<li><span class="check">✓</span>Methodology page (transparent scoring docs)</li>
<li><span class="check">✓</span>Trust Tier System (Premium/Verified/Reliable/Emerging/Caution/Deprecated)</li>
<li><span class="check">✓</span>Data Provenance (real vs simulated vs baseline)</li>
<li><span class="check">✓</span>Self-Check Tool (paste URL → instant grade)</li>
<li><span class="check">✓</span>Outreach Guard (zero duplicates)</li>
<li>Activity Transparency on tool pages</li>
<li>Verified Maintainer Badge</li>
<li>Tool Health Dashboard for builders</li>
<li>Featured Weekly (curated picks)</li>
</ul>
</div>

<div class="phase">
<h3 class="planned">📋 Phase B — Spread (Planned)</h3>
<ul>
<li>GitHub Action (auto-grade on push/release)</li>
<li>Weekly Top 10 MCP Tools content</li>
<li>npm badge auto-display</li>
<li>VS Code Extension (grade in editor)</li>
<li>Deepen partner network (5-10 Aigen-level partners)</li>
</ul>
</div>

<div class="phase">
<h3 class="planned">🚀 Phase 3 — TaaS: Tool-as-a-Service</h3>
<ul>
<li>Execution Gateway (platform runs tools for agents)</li>
<li>Sandbox execution with security isolation</li>
<li>Result caching for common operations</li>
<li>Trust score from real execution data</li>
</ul>
</div>

<div class="phase">
<h3 class="planned">💎 Phase 4 — Marketplace</h3>
<ul>
<li>Per-call billing for tool execution</li>
<li>Builder revenue share (platform takes %)</li>
<li>Agent spending budgets</li>
<li>Public tool marketplace</li>
</ul>
</div>

<p style="color:#8b949e;font-size:0.85em;margin-top:30px;">Last updated: ${new Date().toISOString().slice(0, 10)} · Built in the open · <a href="https://github.com/HMCHENGGH/agent-tool-intel" style="color:#7c9ff5">GitHub</a></p>
</div>
</body>
</html>`;
  return c.html(html);
});

// ── Homepage: Leaderboard ──

publicRoute.get("/", async (c) => {
  // Get top 20 tools by quality score
  const topTools = await db
    .select({
      toolName: tools.name,
      serverName: servers.name,
      canonicalId: servers.canonicalId,
      description: tools.description,
      qualityGrade: qualityScores.grade,
      qualityScore: qualityScores.overallScore,
      installCmd: servers.installCmd,
    })
    .from(tools)
    .innerJoin(servers, eq(tools.serverId, servers.id))
    .innerJoin(qualityScores, eq(tools.id, qualityScores.toolId))
    .orderBy(desc(qualityScores.overallScore))
    .limit(20);

  // Get stats
  const [serverCount, toolCount, feedbackCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(servers),
    db.select({ count: sql<number>`count(*)` }).from(tools),
    db.select({ count: sql<number>`count(*)` }).from(feedback),
  ]);

  const totalServers = Number(serverCount[0]?.count ?? 0);
  const totalTools = Number(toolCount[0]?.count ?? 0);
  const totalFeedback = Number(feedbackCount[0]?.count ?? 0);

  // Grade distribution
  const gradeDist = await db
    .select({
      grade: qualityScores.grade,
      count: sql<number>`count(*)`,
    })
    .from(qualityScores)
    .groupBy(qualityScores.grade)
    .orderBy(qualityScores.grade);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Tool Intelligence — Quality Scores for AI Agent Tools</title>
<meta name="description" content="AI agent discovers, evaluates, and selects tools autonomously. Quality scoring, trust engine, sandbox testing for MCP servers.">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a0f; color: #e0e0e0; line-height:1.6; }
a { color: #7c9ff5; text-decoration:none; }
a:hover { color: #a0b8ff; }

/* Header */
.hero { background: linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%); border-bottom: 1px solid #30363d; padding: 60px 20px; text-align:center; }
.hero h1 { font-size: 2.4em; font-weight:800; background: linear-gradient(135deg, #7c9ff5, #a78bfa); -webkit-background-clip:text; -webkit-text-fill-color:transparent; margin-bottom:12px; }
.hero p { color: #8b949e; font-size:1.15em; max-width:600px; margin:0 auto 24px; }
.hero .api-url { display:inline-block; background:#161b22; border:1px solid #30363d; border-radius:6px; padding:8px 20px; font-family:monospace; color:#7c9ff5; font-size:0.9em; }

/* Stats bar */
.stats { display:flex; justify-content:center; gap:40px; padding:32px 20px; background:#0d1117; border-bottom:1px solid #21262d; flex-wrap:wrap; }
.stat { text-align:center; }
.stat .num { font-size:2em; font-weight:800; color:#e0e0e0; }
.stat .label { color:#8b949e; font-size:0.85em; margin-top:4px; }

/* Container */
.container { max-width:960px; margin:0 auto; padding:24px 20px; }

/* Search */
.search-box { display:flex; gap:10px; margin-bottom:32px; }
.search-box input { flex:1; background:#161b22; border:1px solid #30363d; border-radius:8px; padding:12px 18px; color:#e0e0e0; font-size:1.05em; outline:none; }
.search-box input:focus { border-color:#7c9ff5; }
.search-box button { background:#7c9ff5; border:none; border-radius:8px; padding:12px 24px; color:#fff; font-weight:600; cursor:pointer; font-size:1.05em; }
.search-box button:hover { background:#8aa8ff; }
#search-results { background:#161b22; border:1px solid #30363d; border-radius:8px; display:none; padding:20px; }
#search-results.loading { display:block; text-align:center; padding:40px; color:#8b949e; }

/* Leaderboard */
.leaderboard { margin-top:8px; }
.leaderboard h2 { font-size:1.3em; margin-bottom:16px; color:#e0e0e0; }
.tool-card { background:#161b22; border:1px solid #21262d; border-radius:8px; padding:16px 20px; margin-bottom:10px; transition:border-color 0.15s; }
.tool-card:hover { border-color:#30363d; }
.tool-card .row1 { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; }
.tool-card .name { font-weight:700; font-size:1.05em; }
.tool-card .server { color:#8b949e; font-size:0.85em; margin-top:4px; }
.tool-card .desc { color:#8b949e; font-size:0.9em; margin-top:6px; }
.badge-grade { display:inline-block; padding:4px 12px; border-radius:12px; font-weight:800; font-size:0.85em; }
.grade-A-plus, .grade-A { background:rgba(40,167,69,0.15); color:#28a745; }
.grade-B-plus, .grade-B { background:rgba(108,117,227,0.15); color:#6c75e3; }
.grade-C { background:rgba(255,171,0,0.15); color:#ffab00; }
.grade-D, .grade-F { background:rgba(220,53,69,0.15); color:#dc3545; }

/* Grade Distribution */
.grade-dist { display:flex; gap:8px; margin:24px 0; flex-wrap:wrap; }
.grade-bar { flex:1; min-width:60px; text-align:center; background:#161b22; border-radius:8px; padding:12px 8px; border:1px solid #21262d; }
.grade-bar .grade { font-weight:800; font-size:1.1em; }
.grade-bar .count { color:#8b949e; font-size:0.8em; margin-top:2px; }

/* Badge Section */
.badge-section { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:24px; margin-top:32px; }
.badge-section h3 { margin-bottom:12px; }
.badge-section code { display:block; background:#0d1117; border:1px solid #30363d; border-radius:6px; padding:12px 16px; font-size:0.85em; margin:12px 0; overflow-x:auto; color:#7c9ff5; }
.badge-preview { display:flex; align-items:center; gap:10px; margin:12px 0; }
.badge-preview img { border-radius:4px; }

/* Footer */
footer { text-align:center; padding:40px 20px; color:#484f58; font-size:0.85em; border-top:1px solid #21262d; margin-top:40px; }

/* Tool detail */
.tool-detail { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:32px; margin-top:20px; }
.tool-detail h2 { font-size:1.5em; margin-bottom:8px; }
.scores-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px,1fr)); gap:12px; margin:20px 0; }
.score-item { background:#0d1117; border-radius:8px; padding:14px; text-align:center; }
.score-item .value { font-size:1.5em; font-weight:800; }
.score-item .label { color:#8b949e; font-size:0.8em; margin-top:2px; }
</style>
</head>
<body>

<div class="hero">
  <h1>Agent Tool Intelligence</h1>
  <p>The quality standard for MCP tools. <strong>${totalServers.toLocaleString()}</strong> servers indexed. Semantic search, quality scoring, trust engine, agent-native signals — built for agents, transparent for builders.</p>
  <span class="api-url">agent-tool-intel-production.up.railway.app</span>
</div>

<div class="stats">
  <div class="stat"><div class="num">${totalServers}</div><div class="label">Servers Indexed</div></div>
  <div class="stat"><div class="num">${totalTools}</div><div class="label">Tools Scored</div></div>
  <div class="stat"><div class="num">${totalFeedback}</div><div class="label">Agent Feedback Events</div></div>
</div>

<div class="container">
  <!-- Search -->
  <h2 style="margin-bottom:12px">Search Tools</h2>
  <div class="search-box">
    <input type="text" id="search-input" placeholder="What does your agent need? e.g. extract tables from PDF documents" onkeydown="if(event.key==='Enter')doSearch()">
    <button onclick="doSearch()">Search</button>
  </div>
  <div id="search-results"></div>

  <!-- Grade Distribution -->
  <h2 style="margin-top:32px;margin-bottom:12px">Quality Grade Distribution</h2>
  <div class="grade-dist">
    ${gradeDist.map(g => `
      <div class="grade-bar">
        <div class="grade grade-${(g.grade || '').replace('+','-plus')}">${g.grade || '?'}</div>
        <div class="count">${g.count}</div>
      </div>
    `).join('')}
  </div>

  <!-- Featured Weekly -->
  ${(() => {
    // Pick featured: top quality + active, hidden gem, most improved
    const featured: string[] = [];
    if (topTools[0]) featured.push(`<strong>🔥 Top Tool:</strong> ${escapeHtml(topTools[0].toolName || '')} <span style="color:#8b949e">(${topTools[0].serverName})</span> — Grade ${topTools[0].qualityGrade}`);
    if (topTools[5]) featured.push(`<strong>💎 Hidden Gem:</strong> ${escapeHtml(topTools[5].toolName || '')} <span style="color:#8b949e">(${topTools[5].serverName})</span> — Grade ${topTools[5].qualityGrade}, underrated`);
    if (topTools[3]) featured.push(`<strong>⭐ Standout:</strong> ${escapeHtml(topTools[3].toolName || '')} <span style="color:#8b949e">(${topTools[3].serverName})</span> — Grade ${topTools[3].qualityGrade}, strong signals`);
    return featured.length > 0
      ? `<div class="badge-section" style="margin-bottom:24px;padding:16px 24px">
        <h3 style="margin-bottom:12px">📣 Featured This Week</h3>
        ${featured.map(f => `<p style="margin:6px 0;font-size:0.95em">${f}</p>`).join('')}
        <p style="color:#8b949e;font-size:0.8em;margin-top:8px">Updated weekly · <a href="/scoring/methodology" style="color:#7c9ff5">How scores work</a></p>
      </div>`
      : '';
  })()}

  <!-- Leaderboard -->
  <div class="leaderboard">
    <h2>Top Rated Tools</h2>
    ${topTools.map((t, i) => `
      <div class="tool-card">
        <div class="row1">
          <div>
            <span style="color:#484f58;font-size:0.8em;margin-right:10px">#${i + 1}</span>
            <span class="name">${escapeHtml(t.toolName || '')}</span>
          </div>
          <span class="badge-grade grade-${(t.qualityGrade || 'C').replace('+','-plus')}">${t.qualityGrade || 'C'}</span>
        </div>
        <div class="server">${escapeHtml(t.serverName || '')}</div>
        <div class="desc">${escapeHtml((t.description || '').slice(0, 160))}</div>
      </div>
    `).join('')}
  </div>

  <!-- Self-Check Tool -->
  <div class="badge-section" style="margin-bottom:24px">
    <h3>🔍 Check Your Tool's Grade</h3>
    <p style="color:#8b949e;margin-bottom:12px">Paste your GitHub repo (e.g. <code>puppeteer/puppeteer</code>) to see your quality grade instantly.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <input type="text" id="check-input" placeholder="owner/repo" style="flex:1;min-width:200px;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:12px 16px;color:#e0e0e0;font-size:1em;outline:none" onkeydown="if(event.key==='Enter')checkGrade()">
      <button onclick="checkGrade()" style="background:#6c75e3;border:none;border-radius:8px;padding:12px 20px;color:#fff;font-weight:600;cursor:pointer;font-size:1em">Check</button>
    </div>
    <div id="check-result" style="margin-top:16px;display:none"></div>
  </div>

  <!-- Badge Section -->
  <div class="badge-section">
    <h3>🏷️ Get Your Grade Badge</h3>
    <p style="color:#8b949e;margin-bottom:12px">Show your MCP server's quality grade on your GitHub README. Clickable badge — drives visitors to your tool's ranking.</p>
    <div class="badge-preview" style="margin:16px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="color:#e0e0e0;font-weight:600">puppeteer/puppeteer</span>
      <span style="color:#8b949e">→</span>
      <img src="/badge/puppeteer%2Fpuppeteer" alt="Grade A" style="height:20px" />
    </div>
    <code>&lt;a href="https://agent-tool-intel-production.up.railway.app"&gt;&lt;img src="https://agent-tool-intel-production.up.railway.app/badge/YOUR_ORG%2FYOUR_REPO" alt="Agent Tool Intel Grade" /&gt;&lt;/a&gt;</code>
    <p style="color:#8b949e;margin-top:10px;font-size:0.85em">Replace <code>YOUR_ORG%2FYOUR_REPO</code> with your server name. <code>/</code> → <code>%2F</code>. Badge auto-updates.</p>
  </div>
</div>

<footer>
  Agent Tool Intelligence v0.1.0 · <a href="https://github.com/HMCHENGGH/agent-tool-intel">GitHub</a> · API endpoint: agent-tool-intel-production.up.railway.app
  <br><br>Built for agents. Transparent for humans.
</footer>

<script>
async function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  const div = document.getElementById('search-results');
  if (!q) return;
  div.style.display = 'block';
  div.className = 'loading';
  div.innerHTML = '<p>Searching ${totalTools} tools...</p>';

  try {
    const resp = await fetch('/api/v1/search', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({query: q, maxResults: 10})
    });
    const data = await resp.json();
    div.className = '';
    if (!data.results || data.results.length === 0) {
      div.innerHTML = '<p style="color:#8b949e">No results found. Try a different query.</p>';
      return;
    }
    div.innerHTML = data.results.map((r, i) => {
      const g = (r.quality?.grade || 'C').replace('+','-plus');
      const disc = r.discrepancy?.severity === 'warning'
        ? '<span style="color:#dc3545;font-size:0.8em;margin-left:8px">⚠️ ' + r.discrepancy.message + '</span>'
        : r.discrepancy?.severity === 'caution'
          ? '<span style="color:#ffab00;font-size:0.8em;margin-left:8px">⚡ ' + r.discrepancy.message + '</span>'
          : '';
      return '<div class="tool-card">' +
        '<div class="row1"><div><span style="color:#484f58;font-size:0.8em;margin-right:10px">#' + (i+1) + '</span><span class="name">' + escapeH(r.toolName) + '</span>' + disc + '</div>' +
        '<span class="badge-grade grade-' + g + '">' + (r.quality?.grade || '?') + '</span></div>' +
        '<div class="server">' + escapeH(r.serverName) + ' · Relevance: ' + r.relevanceScore + ' · Trust: ' + r.trust?.score + '/100</div>' +
        '<div class="desc">' + escapeH(r.recommendationSummary || '') + '</div>' +
        '</div>';
    }).join('');
  } catch(e) {
    div.innerHTML = '<p style="color:#dc3545">Search failed. API may be starting up. Try again.</p>';
  }
}
function escapeH(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function checkGrade() {
  const input = document.getElementById('check-input').value.trim();
  const div = document.getElementById('check-result');
  if (!input) return;
  div.style.display = 'block';
  div.innerHTML = '<p style="color:#8b949e">Checking...</p>';

  try {
    const resp = await fetch('/badge/' + encodeURIComponent(input));
    const svg = await resp.text();
    const gradeMatch = svg.match(/Grade ([A-F]\+?)/);
    if (!gradeMatch) {
      div.innerHTML = '<p style="color:#ffab00">Tool not yet indexed. <a href="/docs" style="color:#7c9ff5">Submit it?</a></p>';
      return;
    }
    const grade = gradeMatch[1];
    const scoreMatch = svg.match(/\((\d+)\/100\)/);
    const score = scoreMatch ? scoreMatch[1] : '?';
    const encoded = encodeURIComponent(input);
    const badgeUrl = '/badge/' + encoded;
    const landingUrl = window.location.origin;
    const md = '[![Grade ' + grade + '](' + landingUrl + badgeUrl + ')](' + landingUrl + ')';
    div.innerHTML = '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
      '<img src="' + badgeUrl + '" alt="Grade ' + grade + '" style="height:20px">' +
      '<span style="color:#e0e0e0">Score: <strong>' + score + '/100</strong></span>' +
      '</div>' +
      '<p style="color:#8b949e;margin-top:12px;font-size:0.9em">Embed this badge on your GitHub README:</p>' +
      '<code>' + md.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</code>';
  } catch(e) {
    div.innerHTML = '<p style="color:#dc3545">Check failed. Try again.</p>';
  }
}
</script>
</body>
</html>`;

  return c.html(html);
});

// ── Dynamic Grade Badge endpoint ──

publicRoute.get("/badge/:toolId", async (c) => {
  const toolId = decodeURIComponent(c.req.param("toolId"));

  // Lookup: try exact match on server name or canonical_id
  const [serverResult, toolResult] = await Promise.all([
    db.select({
      grade: qualityScores.grade,
      score: qualityScores.overallScore,
      serverName: servers.name,
    })
    .from(servers)
    .innerJoin(tools, eq(tools.serverId, servers.id))
    .innerJoin(qualityScores, eq(tools.id, qualityScores.toolId))
    .where(eq(servers.name, toolId))
    .limit(1),
    db.select({
      grade: qualityScores.grade,
      score: qualityScores.overallScore,
      serverName: servers.name,
    })
    .from(servers)
    .innerJoin(tools, eq(tools.serverId, servers.id))
    .innerJoin(qualityScores, eq(tools.id, qualityScores.toolId))
    .where(eq(servers.canonicalId, toolId))
    .limit(1),
  ]);

  const result = serverResult[0] || toolResult[0];
  const grade = result?.grade || "N/A";
  const score = result?.score ? Number(result.score) : null;
  const serverName = result?.serverName || toolId;

  // Color mapping
  const colors: Record<string, { bg: string; text: string }> = {
    "A+": { bg: "#28a745", text: "#fff" },
    "A":  { bg: "#28a745", text: "#fff" },
    "B+": { bg: "#6c75e3", text: "#fff" },
    "B":  { bg: "#6c75e3", text: "#fff" },
    "C":  { bg: "#ffab00", text: "#000" },
    "D":  { bg: "#dc3545", text: "#fff" },
    "F":  { bg: "#dc3545", text: "#fff" },
  };
  const color = colors[grade.replace("-plus", "+")] || colors["C"]!;

  const leftWidth = 125;
  const rightWidth = grade === "N/A" ? 45 : grade.length > 2 ? 55 : 45;
  const totalWidth = leftWidth + rightWidth;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <title>Agent Tool Intel: ${serverName} — Grade ${grade}${score ? ' (' + score + '/100)' : ''}</title>
  <rect width="${totalWidth}" height="20" rx="4" fill="#333"/>
  <rect width="${leftWidth}" height="20" rx="4" fill="#555"/>
  <rect x="${leftWidth - 4}" width="${rightWidth + 4}" height="20" rx="4" fill="${color.bg}"/>
  <rect x="4" y="0" width="${leftWidth - 4}" height="20" rx="4" fill="#555"/>
  <text x="${leftWidth / 2}" y="14" font-family="system-ui,sans-serif" font-size="11" fill="#ccc" text-anchor="middle" font-weight="600">agent tool intel</text>
  <text x="${leftWidth + rightWidth / 2}" y="14" font-family="system-ui,sans-serif" font-size="11" fill="${color.text}" text-anchor="middle" font-weight="800">${grade}</text>
</svg>`;

  return c.html(svg, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=3600",
  });
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
