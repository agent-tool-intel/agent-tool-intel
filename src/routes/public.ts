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

<h2>1. Composite Grade（Additive Model）</h2>
<p><strong>Quality is the foundation. Community and Trust are bonuses — they add on top, they never drag you down.</strong></p>
<table>
<tr><th>Component</th><th>Range</th><th>What it measures</th></tr>
<tr><td>Quality Score</td><td>0-100</td><td>Static analysis of your tool definition. Your <strong>base score</strong>.</td></tr>
<tr><td>Community Bonus</td><td>0-30</td><td>Stars, activity, official status. <strong>Adds on top</strong> of quality.</td></tr>
<tr><td>Trust Bonus</td><td>0-20</td><td>Real execution data. <strong>Adds on top</strong>. No data = no bonus (not a penalty).</td></tr>
<tr><td colspan="3"><strong>Composite = Quality + Community Bonus + Trust Bonus (0-150)</strong></td></tr>
</table>

<h3>Quality Floor</h3>
<p>To prevent popular but poorly designed tools from outranking excellent new tools, your Community + Trust scores cannot push your grade beyond a cap based on Quality:</p>
<table>
<tr><th>If your Quality Score is...</th><th>Your maximum possible grade is...</th></tr>
<tr><td>≥ 80</td><td>A+ (no cap)</td></tr>
<tr><td>≥ 70</td><td>A</td></tr>
<tr><td>≥ 60</td><td>B+</td></tr>
<tr><td>≥ 50</td><td>B</td></tr>
<tr><td>≥ 40</td><td>C+</td></tr>
<tr><td>≥ 30</td><td>C</td></tr>
<tr><td>&lt; 30</td><td>D</td></tr>
</table>

<h3>Grade Mapping — Final</h3>
<table>
<tr><th>Score</th><th>Grade</th><th>Width</th><th>Meaning</th></tr>
<tr><td>131-150</td><td>A+</td><td>20</td><td>Elite — quality + popularity + usage</td></tr>
<tr><td>106-130</td><td>A</td><td>25</td><td>Excellent</td></tr>
<tr><td>86-105</td><td>B+</td><td>20</td><td>Very good — close to A</td></tr>
<tr><td>76-85</td><td>B</td><td>10</td><td>Good — solid quality</td></tr>
<tr><td>66-75</td><td>C+</td><td>10</td><td>OK — needs promotion</td></tr>
<tr><td>46-65</td><td>C</td><td>20</td><td>Below average — quality gaps</td></tr>
<tr><td>21-45</td><td>D</td><td>25</td><td>Poor — significant issues</td></tr>
<tr><td>0-20</td><td>F</td><td>21</td><td>Critical — not recommended</td></tr>
</table>

<h2>2. Quality Score (Static Analysis — 35% of composite)</h2>
<p>Five dimensions automatically evaluated from the tool definition alone. No usage data required.</p>
<table>
<tr><th>Dimension</th><th>Weight</th><th>What we measure</th></tr>
<tr><td>Schema Correctness</td><td>25%</td><td>Valid JSON Schema structure, type field, properties, required fields. Agents need clear schemas.</td></tr>
<tr><td>Token Efficiency</td><td>25%</td><td>Tool definition token count. ≤80 tokens = optimal (🥇). Every token counts against context window.</td></tr>
<tr><td>Description Quality</td><td>20%</td><td>Length (50-200 chars optimal), action verbs, naming conventions, usage examples.</td></tr>
<tr><td>Security</td><td>15%</td><td>Prompt injection patterns, suspicious language, security keywords in description.</td></tr>
<tr><td>Install Reliability</td><td>15%</td><td>Detected install method (npm/pip/go/docker). Clear install instructions = higher score.</td></tr>
</table>

<h2>3. Community Bonus（Adds 0-60 points）</h2>
<p>Stars, activity, and official status <strong>add points</strong> on top of quality. Wide range creates natural differentiation.</p>
<table>
<tr><th>Signal</th><th>Max</th><th>How scored</th></tr>
<tr><td>GitHub Stars</td><td>30</td><td>10K+=30, 5K=26, 1K=22, 500=18, 100=14, 50=10, 10=6, 1=3</td></tr>
<tr><td>Activity</td><td>20</td><td>Push ≤30d=20, ≤180d=10, ≤365d=5, unknown=5</td></tr>
<tr><td>Official</td><td>10</td><td>Official+Verified=10, Official=7, Verified=5</td></tr>
<tr><td colspan="3"><strong>Max bonus: 60</strong></td></tr>
</table>

<h2>4. Trust Bonus（Adds 0-30 points）</h2>
<p>Real execution data from Phase 3. <strong>No data = 0.</strong> Proven tools earn significant bonus.</p>
<table>
<tr><th>Signal</th><th>Max</th><th>How scored</th></tr>
<tr><td>Success Rate</td><td>15</td><td>% × 0.15. No data = 0.</td></tr>
<tr><td>Recency</td><td>8</td><td>Executed ≤7d=8, ≤30d=4</td></tr>
<tr><td>Consistency</td><td>7</td><td>1K+ calls=7, 100+=4</td></tr>
<tr><td colspan="3"><strong>Baseline: 0</strong></td></tr>
</table>

<h2>5. Why This Works</h2>
<p>Previous system scored only quality — resulting in 85.7% Grade B (no differentiation). By combining quality with community and trust signals, we create natural spread that reflects how agents actually select tools: community reputation draws attention, quality verification closes the deal, real performance builds lasting trust.</p>
<ul>
<li><strong>For Builders</strong>: Know exactly what to improve. Share your tool → more stars → better Community Score → higher grade.</li>
<li><strong>For Agents</strong>: Clear differentiation. Community + Quality + Trust combine to surface truly reliable tools.</li>
<li><strong>Quality Floor</strong>: Ensures popularity alone cannot outrank genuine quality. A tool with 10K stars but poor engineering cannot exceed Grade B.</li>
</ul>

<p style="color:#8b949e;font-size:0.85em;margin-top:30px;">Last updated: ${new Date().toISOString().slice(0, 10)}</p><footer style="text-align:center;padding:20px;color:#484f58;font-size:0.85em;border-top:1px solid #21262d;margin-top:20px"><a href="/" style="color:#7c9ff5">Home</a> · <a href="/docs" style="color:#7c9ff5">API Docs</a> · <a href="/scoring/methodology" style="color:#7c9ff5">Methodology</a> · <a href="/roadmap" style="color:#7c9ff5">Roadmap</a> · <a href="/partners" style="color:#7c9ff5">Partners</a> · <a href="/report/monthly" style="color:#7c9ff5">Monthly Report</a> · <a href="https://github.com/agent-tool-intel/agent-tool-intel" style="color:#7c9ff5">GitHub</a> · <a href="https://github.com/agent-tool-intel/agent-tool-intel/blob/master/CONTRIBUTING.md" style="color:#7c9ff5">Contribute</a></footer>
</div>
</body>
</html>`;
  return c.html(html);
});

// ── Public Roadmap (hidden for now) ──

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
.done { color:#28a745; } ul { list-style:none; padding:0; }
li { color:#8b949e; padding:4px 0; font-size:0.9em; }
.check { color:#28a745; margin-right:8px; }
.back { color:#7c9ff5; text-decoration:none; font-size:0.9em; }
.footnote { color:#484f58; font-size:0.85em; margin-top:30px; }
</style>
</head>
<body>
<div class="container">
<a href="/" class="back">← Back</a>
<h1>Roadmap</h1>
<p style="color:#8b949e;margin-bottom:24px">What we've built. More coming.</p>

<div class="phase"><h2 class="done">✅ Phase A — Build Trust</h2><ul>
<li><span class="check">✓</span>Scoring calibration (81% A → meaningful B/C spread)</li>
<li><span class="check">✓</span>Trust Tier System (6 tiers)</li>
<li><span class="check">✓</span>Data Provenance labels</li>
<li><span class="check">✓</span>Verified Publisher Badge</li>
<li><span class="check">✓</span>Self-Check Tool</li>
<li><span class="check">✓</span>Tool Health Dashboard</li>
<li><span class="check">✓</span>Scoring Methodology page</li>
<li><span class="check">✓</span>Outreach Guard (zero spam)</li>
</ul></div>

<div class="phase"><h2 class="done">✅ Phase B — Spread</h2><ul>
<li><span class="check">✓</span>GitHub Action (auto-grade on push)</li>
<li><span class="check">✓</span>Grade Badge (dynamic SVG)</li>
<li><span class="check">✓</span>VS Code Extension</li>
<li><span class="check">✓</span>npm Badge support</li>
<li><span class="check">✓</span>39,752+ MCP servers indexed</li>
<li><span class="check">✓</span>Continuous data ingestion</li>
</ul></div>

<div class="phase"><h2 class="done">✅ Phase 1 — MVP</h2><ul>
<li><span class="check">✓</span>Semantic search API</li>
<li><span class="check">✓</span>Quality scoring (5 dimensions)</li>
<li><span class="check">✓</span>Trust engine with feedback loop</li>
<li><span class="check">✓</span>Sandbox validation (7 checks)</li>
<li><span class="check">✓</span>Discrepancy Flag</li>
<li><span class="check">✓</span>AgentPilot + AutoMine integration</li>
</ul></div>

<div class="phase"><h2 class="done">✅ Phase 2 — Public Page + Scale</h2><ul>
<li><span class="check">✓</span>Public leaderboard + search</li>
<li><span class="check">✓</span>API documentation</li>
<li><span class="check">✓</span>Agent Signals (stars, activity, official, docs)</li>
<li><span class="check">✓</span>Community Score</li>
<li><span class="check">✓</span>39,752 servers · 39,762 tools</li>
<li><span class="check">✓</span>90%+ hit rate</li>
</ul></div>

<div class="phase"><h2>🔧 Phase 3 — Analytics & Signals</h2><ul>
<li>Execution analytics for builders</li>
<li>Real usage data for trust scores</li>
<li>Improvement tips engine</li>
<li>Monthly ecosystem report</li>
<li>Tool claiming + builder dashboard</li>
</ul></div>

<p class="footnote">We ship, then we talk. What's next depends on what builders need.<br>
Built in the open · <a href="https://github.com/agent-tool-intel/agent-tool-intel" style="color:#7c9ff5">GitHub</a></p>
</div></body></html>`;
  return c.html(html);
});

// ── Monthly Report（Public Page）──

publicRoute.get("/report/monthly", async (c) => {
  const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Monthly Ecosystem Report — Agent Tool Intelligence</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:#0a0a0f;color:#e0e0e0;line-height:1.6;padding:40px 20px}.container{max-width:800px;margin:0 auto}h1{font-size:1.8em;background:linear-gradient(135deg,#7c9ff5,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}h2{font-size:1.2em;margin:32px 0 12px;color:#e0e0e0;border-bottom:1px solid #21262d;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin:12px 0 20px}th,td{padding:10px 14px;text-align:left;border-bottom:1px solid #21262d}th{color:#c0c0c0}td{font-size:0.9em}.back{color:#7c9ff5;text-decoration:none;font-size:0.9em}.loading{color:#8b949e;text-align:center;padding:60px}</style></head><body><div class="container"><a href="/" class="back">← Back</a><h1>Monthly Ecosystem Report</h1><div id="report" class="loading">Loading report...</div></div><script>fetch("/api/v1/report/monthly?format=md").then(r=>r.text()).then(md=>{document.getElementById("report").innerHTML="<pre style=\'background:#161b22;border:1px solid #30363d;border-radius:8px;padding:24px;white-space:pre-wrap;font-family:monospace;font-size:0.9em;line-height:1.6;color:#e0e0e0\'>"+md.replace(/</g,"&lt;").replace(/>/g,"&gt;")+"</pre>"}).catch(()=>{document.getElementById("report").innerHTML="<p style=\'color:#8b949e\'>Report generation in progress. Check back soon.</p>"})</script></body></html>';
  return c.html(html);
});

// ── Tool Health Dashboard ──

publicRoute.get("/health/:owner/:repo", async (c) => {
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const fullName = `${owner}/${repo}`;

  const result = await db
    .select({
      tool: tools,
      server: servers,
      quality: qualityScores,
    })
    .from(tools)
    .innerJoin(servers, eq(tools.serverId, servers.id))
    .innerJoin(qualityScores, eq(tools.id, qualityScores.toolId))
    .where(eq(servers.name, fullName))
    .limit(1);

  if (!result[0]) {
    return c.html(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not Found</title></head>
    <body style="background:#0a0a0f;color:#e0e0e0;font-family:system-ui;padding:60px;text-align:center">
    <h1 style="color:#8b949e">${escapeHtml(fullName)} not yet indexed</h1>
    <p><a href="/" style="color:#7c9ff5">← Back to Leaderboard</a></p></body></html>`, 404);
  }

  const { tool: t, server: s, quality: q } = result[0];
  const grade = q?.grade || "?";
  const score = Number(q?.overallScore || 0);

  // Improvement tips
  const tips: string[] = [];
  const correctness = Number(q?.correctness || 0);
  const efficiency = Number(q?.efficiency || 0);
  const descriptionQ = Number(q?.descriptionQ || 0);
  const security = Number(q?.security || 0);
  const installRel = Number(q?.installRel || 0);

  if (correctness < 70) tips.push(`📋 <strong>Add input schema</strong>: Define a JSON Schema for your tool's parameters. Agents need to know what inputs to provide. Currently scoring ${correctness}/100.`);
  if (efficiency < 55) tips.push(`⚡ <strong>Reduce token count</strong>: Your tool definition uses ~${t.tokenCount || '?'} tokens. Try to keep it under 250 tokens for optimal efficiency. Currently scoring ${efficiency}/100.`);
  if (descriptionQ < 65) tips.push(`📝 <strong>Improve description</strong>: Use clear action verbs and keep length between 50-200 characters. Make it obvious what your tool does. Currently scoring ${descriptionQ}/100.`);
  if (security < 75) tips.push(`🔒 <strong>Check for prompt injection patterns</strong>: Avoid phrases like "ignore previous" or "override your" in descriptions. Currently scoring ${security}/100.`);
  if (installRel < 50) tips.push(`📦 <strong>Clarify install method</strong>: Make it clear whether this is npm, pip, HTTP endpoint, or other. Currently scoring ${installRel}/100.`);

  if (tips.length === 0) tips.push(`🎉 <strong>Great job!</strong> Your tool scores well across all dimensions. Keep maintaining it and collecting real-world trust data.`);

  // Score breakdown bars
  const barColors: Record<string, string> = { "90+": "#28a745", "70-89": "#6c75e3", "50-69": "#ffab00", "<50": "#dc3545" };
  const barColor = (v: number) => v >= 90 ? barColors["90+"] : v >= 70 ? barColors["70-89"] : v >= 50 ? barColors["50-69"] : barColors["<50"];

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(fullName)} — Tool Health Dashboard</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a0f; color: #e0e0e0; line-height:1.6; padding:40px 20px; }
.container { max-width:800px; margin:0 auto; }
h1 { font-size:1.6em; margin-bottom:4px; }
h2 { font-size:1.1em; margin:28px 0 12px; border-bottom:1px solid #21262d; padding-bottom:8px; }
.card { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:20px; margin-bottom:16px; }
.dim { color:#8b949e; font-size:0.85em; }
.bar-wrap { background:#0d1117; border-radius:4px; height:8px; margin:4px 0 10px; }
.bar-fill { height:8px; border-radius:4px; transition:width 0.3s; }
.score-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin:12px 0; }
.score-item { background:#0d1117; border-radius:8px; padding:12px; text-align:center; }
.score-item .val { font-size:1.4em; font-weight:800; }
.score-item .sm { font-size:0.75em; color:#8b949e; margin-top:2px; }
.tip { background:#0d1117; border-left:3px solid #ffab00; padding:10px 14px; margin:8px 0; border-radius:0 6px 6px 0; font-size:0.95em; }
.good { border-left-color:#28a745 !important; }
.back { color:#7c9ff5; text-decoration:none; font-size:0.9em; }
.grade-badge { display:inline-block; padding:4px 12px; border-radius:12px; font-weight:800; font-size:1em; margin-left:8px; }
${grade.includes("A") ? ".grade-badge{background:rgba(40,167,69,0.15);color:#28a745}" : grade.includes("B") ? ".grade-badge{background:rgba(108,117,227,0.15);color:#6c75e3}" : grade.includes("C") ? ".grade-badge{background:rgba(255,171,0,0.15);color:#ffab00}" : ".grade-badge{background:rgba(220,53,69,0.15);color:#dc3545}"}
</style></head><body>
<div class="container">
<a href="/" class="back">← Back to Leaderboard</a>
<h1>${escapeHtml(s.displayName || s.name)} <span class="grade-badge">${grade}</span></h1>
<p class="dim">${escapeHtml(s.name)} · ${s.publisher || 'unknown'} · ${s.isOfficial ? '✅ Official' : ''}</p>

<h2>📊 Score Breakdown</h2>
<div class="card">
<div class="score-grid">
  <div class="score-item"><div class="val" style="color:${barColor(correctness)}">${correctness}</div><div class="sm">Schema</div></div>
  <div class="score-item"><div class="val" style="color:${barColor(efficiency)}">${efficiency}</div><div class="sm">Token Efficiency</div></div>
  <div class="score-item"><div class="val" style="color:${barColor(descriptionQ)}">${descriptionQ}</div><div class="sm">Description</div></div>
  <div class="score-item"><div class="val" style="color:${barColor(security)}">${security}</div><div class="sm">Security</div></div>
  <div class="score-item"><div class="val" style="color:${barColor(installRel)}">${installRel}</div><div class="sm">Install</div></div>
</div>
<p class="dim">Overall: <strong>${score}/100</strong> — Grade ${grade}</p>
${[
  {label:"Schema",v:correctness},{label:"Token Efficiency",v:efficiency},
  {label:"Description",v:descriptionQ},{label:"Security",v:security},{label:"Install",v:installRel}
].map(d => `<div style="margin:8px 0"><span style="font-size:0.85em">${d.label}</span>
<div class="bar-wrap"><div class="bar-fill" style="width:${d.v}%;background:${barColor(d.v)}"></div></div></div>`).join('')}
</div>

<h2>⚡ Token Efficiency Tier</h2>
<div class="card">
${(() => {
  const tokens = t.tokenCount || 200;
  let tier: string, emoji: string, saving: string;
  if (tokens <= 80) { tier = "Diamond"; emoji = "🥇"; saving = "95%"; }
  else if (tokens <= 150) { tier = "Gold"; emoji = "🥈"; saving = "88%"; }
  else if (tokens <= 250) { tier = "Silver"; emoji = "🥉"; saving = "75%"; }
  else if (tokens <= 400) { tier = "Bronze"; emoji = "⚪"; saving = "60%"; }
  else { tier = "Heavy"; emoji = "🔴"; saving = "40%"; }
  const taaS = 50;
  const savingTokens = tokens - taaS;
  return `<div style="text-align:center;font-size:1.2em;margin:8px 0">${emoji} <strong>${tier}</strong> — ${tokens} tokens/tool</div>
  <p class="dim" style="text-align:center">Platform-optimized: ~${taaS} tokens vs manual: ~${tokens} tokens<br>Agent saves <strong>${savingTokens} tokens (${saving})</strong> per call</p>`;
})()}
</div>

<h2>💡 Improvement Tips</h2>
${tips.map(t => `<div class="tip ${t.includes('Great job') ? 'good' : ''}">${t}</div>`).join('')}

<h2>🚀 How to Improve Your Grade</h2>
<div class="card" style="border-left:3px solid #ffab00">
<p class="dim" style="margin-bottom:8px">Your grade comes from three components: <strong>Quality Score</strong> (your tool definition) + <strong>Community Bonus</strong> (stars, activity, official status) + <strong>Trust Bonus</strong> (real usage data, coming soon).</p>
<p class="dim">To move up: improve your lowest quality dimension, get more GitHub stars, push updates regularly, and embed your badge. <a href="/scoring/methodology" style="color:#7c9ff5">Full methodology →</a></p>
</div>

<h2>🔗 Resources</h2>
<div class="card">
<p class="dim">Badge embed code:</p>
<code style="background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:8px 12px;display:block;margin:8px 0;font-size:0.85em;color:#7c9ff5;overflow-x:auto">
[![Grade ${grade}](https://agent-tool-intel-production.up.railway.app/badge/${encodeURIComponent(fullName)})](https://agent-tool-intel-production.up.railway.app)
</code>
<footer style="text-align:center;padding:20px;color:#484f58;font-size:0.85em;border-top:1px solid #21262d;margin-top:20px"><a href="/" style="color:#7c9ff5">Home</a> · <a href="/docs" style="color:#7c9ff5">API Docs</a> · <a href="/scoring/methodology" style="color:#7c9ff5">Methodology</a> · <a href="/roadmap" style="color:#7c9ff5">Roadmap</a> · <a href="/partners" style="color:#7c9ff5">Partners</a> · <a href="/report/monthly" style="color:#7c9ff5">Monthly Report</a> · <a href="https://github.com/agent-tool-intel/agent-tool-intel" style="color:#7c9ff5">GitHub</a> · <a href="https://github.com/agent-tool-intel/agent-tool-intel/blob/master/CONTRIBUTING.md" style="color:#7c9ff5">Contribute</a></footer>
</div>
</div></body></html>`;
  return c.html(html);
});

// ── Partners page ──

publicRoute.get("/partners", (c) => {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Partners — Agent Tool Intelligence</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a0f; color: #e0e0e0; line-height:1.7; padding:40px 20px; }
.container { max-width:800px; margin:0 auto; }
h1 { font-size:1.8em; background: linear-gradient(135deg, #7c9ff5, #a78bfa); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
h2 { font-size:1.2em; margin:32px 0 12px; border-bottom:1px solid #21262d; padding-bottom:8px; }
.card { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:20px; margin-bottom:16px; }
.card h3 { color:#e0e0e0; } .card p { color:#8b949e; font-size:0.9em; margin:8px 0; }
code { background:#0d1117; border:1px solid #30363d; border-radius:4px; padding:2px 6px; font-size:0.85em; color:#7c9ff5; }
.back { color:#7c9ff5; text-decoration:none; font-size:0.9em; }
.benefit { display:flex; gap:12px; align-items:flex-start; margin:12px 0; }
.benefit .icon { font-size:1.2em; min-width:24px; }
</style>
</head><body>
<div class="container">
<a href="/" class="back">← Back</a>
<h1>Partners</h1>
<p style="color:#8b949e;margin-bottom:24px">Deepen trust with real-world data. Join the growing network of tools feeding verified usage signals into Agent Tool Intelligence.</p>

<h2>Why Partner?</h2>
<div class="card">
<div class="benefit"><span class="icon">📊</span><div><strong>Real Trust Scores</strong><p>Replace the baseline 50/100 Trust Score with your actual success rates. Agents trust tools with verified data significantly more than unverified ones.</p></div></div>
<div class="benefit"><span class="icon">🏷️</span><div><strong>Better Badge Grade</strong><p>Higher trust scores = higher composite grade = more agents choose your tool. Real data directly improves your badge.</p></div></div>
<div class="benefit"><span class="icon">🔗</span><div><strong>Cross-Link in Docs</strong><p>We'll list you as a verified partner on this page, with your grade, stats, and link to your tool.</p></div></div>
<div class="benefit"><span class="icon">🎯</span><div><strong>Influence Scoring</strong><p>Partner feedback shapes our scoring calibration. Your real-world data makes the entire platform more accurate for everyone.</p></div></div>
</div>

<h2>How It Works</h2>
<div class="card">
<p><strong>1.</strong> You POST your tool's usage data to our API:</p>
<code>POST /api/v1/feedback<br>Body: { "toolId": "tool:mcp:your-org/your-repo@latest", "result": "success", "rating": 5, "notes": "Daily batch — 200 calls today" }</code>
<p style="margin-top:12px"><strong>2.</strong> We recalculate your Trust Score within 1 hour.</p>
<p><strong>3.</strong> Your badge, grade, and trust tier auto-update across all surfaces (GitHub, npm, VS Code).</p>
</div>

<h2>Current Partners</h2>
<div class="card"><h3>🔬 Aigen Protocol</h3>
<p>~2,000 MCP sessions/day across 7 tools. Federation data: agent-card.json, leaderboard, mission validation. First partner to integrate real on-chain verified data.</p>
<p style="margin-top:8px"><a href="https://agent-tool-intel-production.up.railway.app/health/Aigen-Protocol/aigen-protocol" style="color:#7c9ff5">View Health Dashboard →</a></p>
</div>

<p style="color:#8b949e;font-size:0.85em;margin-top:30px">Interested in becoming a partner? <a href="https://github.com/agent-tool-intel/agent-tool-intel" style="color:#7c9ff5">Open an issue</a> or contact us.</p>
</div>
</body></html>`;
  return c.html(html);
});

// ── Self-Check Redirect ──

publicRoute.get("/check", async (c) => {
  const repo = (c.req.query("repo") || "").trim();
  if (!repo) return c.redirect("/");

  // If full org/repo → direct to health dashboard
  if (repo.includes("/")) return c.redirect(`/health/${repo}`);

  // Partial name → search for matching servers
  const matches = await db
    .select({ name: servers.name })
    .from(servers)
    .where(sql`${servers.name} ILIKE ${'%' + repo + '%'}`)
    .limit(20);

  if (matches.length === 1) return c.redirect(`/health/${matches[0]!.name}`);

  // Show matching results or helpful error
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Search: ${escapeHtml(repo)}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:#0a0a0f;color:#e0e0e0;line-height:1.6;padding:40px 20px}.container{max-width:640px;margin:0 auto}h1{font-size:1.4em;margin-bottom:8px}.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin:8px 0;transition:border-color 0.15s}.card:hover{border-color:#7c9ff5}a{color:#7c9ff5;text-decoration:none}.dim{color:#8b949e;font-size:0.85em}.back{color:#7c9ff5}.tip{padding:16px;background:#161b22;border:1px solid #30363d;border-radius:8px;margin:16px 0}</style></head><body><div class="container"><a href="/" class="back">← Back</a><h1>Search: "${escapeHtml(repo)}"</h1>
  ${matches.length > 0
    ? `<p class="dim">Found ${matches.length} matching server${matches.length>1?'s':''}:</p>
       ${matches.map(m => `<a href="/health/${m.name}"><div class="card">🔍 <strong>${escapeHtml(m.name)}</strong></div></a>`).join('')}`
    : `<div class="tip"><p><strong>No results for "${escapeHtml(repo)}".</strong></p>
       <p class="dim" style="margin-top:8px">Try entering the full GitHub repo name:</p>
       <code style="display:block;background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:8px 12px;margin:8px 0;color:#7c9ff5">owner/repo</code>
       <p class="dim">Example: <a href="/health/puppeteer/puppeteer">puppeteer/puppeteer</a></p></div>`
  }
  </div></body></html>`;
  return c.html(matches.length > 0 ? html : html, matches.length > 0 ? 200 : 404);
});

// ── Homepage: Leaderboard ──

// Simple in-memory cache for homepage stats
let cachedStats: { servers: number; tools: number; feedback: number; grades: any[] } | null = null;
let cacheTime = 0;
const CACHE_TTL = 300000; // 5 minutes

publicRoute.get("/", async (c) => {
  const now = Date.now();

  // Get stats（cached）
  let totalServers: number, totalTools: number, totalFeedback: number, gradeDist: any[];
  if (cachedStats && now - cacheTime < CACHE_TTL) {
    totalServers = cachedStats.servers;
    totalTools = cachedStats.tools;
    totalFeedback = cachedStats.feedback;
    gradeDist = cachedStats.grades;
  } else {
    const [serverCount, toolCount, feedbackCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(servers),
      db.select({ count: sql<number>`count(*)` }).from(tools),
      db.select({ count: sql<number>`count(*)` }).from(feedback),
    ]);
    totalServers = Number(serverCount[0]?.count ?? 0);
    totalTools = Number(toolCount[0]?.count ?? 0);
    totalFeedback = Number(feedbackCount[0]?.count ?? 0);
    gradeDist = await db
      .select({ grade: qualityScores.grade, count: sql<number>`count(*)` })
      .from(qualityScores)
      .groupBy(qualityScores.grade)
      .orderBy(qualityScores.grade);
    cachedStats = { servers: totalServers, tools: totalTools, feedback: totalFeedback, grades: gradeDist };
    cacheTime = now;
  }

  // Get top tools — A and A+ only（not cached — dynamic）
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
    .where(sql`${qualityScores.grade} IN ('A+', 'A')`)
    .orderBy(desc(qualityScores.overallScore))
    .limit(20);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Tool Intelligence — Quality Scores for AI Agent Tools</title>
<meta name="description" content="AI agent discovers, evaluates, and selects MCP tools autonomously. 39,752+ servers scored. Quality scoring, trust engine, agent-ready signals. Built for AI agents, transparent for builders.">
<meta name="keywords" content="MCP, Model Context Protocol, AI agent tools, tool quality scoring, MCP server, agent tool discovery, quality scoring platform, open source">
<meta property="og:title" content="Agent Tool Intelligence — Quality Scores for MCP Tools">
<meta property="og:description" content="39,752+ MCP servers scored. Quality, trust, and execution analytics for AI agent tools. Built for agents, transparent for builders.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://agent-tool-intel-production.up.railway.app">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Agent Tool Intelligence — MCP Tool Quality Scores">
<meta name="twitter:description" content="39,752+ MCP servers scored. The quality layer for AI agent tools.">
<meta name="robots" content="index, follow">
<meta property="og:image" content="https://agent-tool-intel-production.up.railway.app/badge/puppeteer%2Fpuppeteer">
<meta property="og:image:width" content="170">
<meta property="og:image:height" content="20">
<link rel="canonical" href="https://agent-tool-intel-production.up.railway.app">
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
@keyframes spin { to { transform: rotate(360deg); } }

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
  <div class="stat"><div class="num">${totalServers.toLocaleString()}</div><div class="label">Servers Indexed</div></div>
  <div class="stat"><div class="num">${totalTools.toLocaleString()}</div><div class="label">Tools Scored</div></div>
  <div class="stat"><div class="num">89.3%</div><div class="label">Grade B+ or Above</div></div>
  <div class="stat"><div class="num">51.7%</div><div class="label">Active (≤30 days)</div></div>
</div>
<p style="text-align:center;color:#484f58;font-size:0.75em;margin-top:-10px;padding-bottom:12px">
  Sources: GitHub · npm · GitLab &nbsp;|&nbsp; 10 categories &nbsp;|&nbsp; Automated ingestion &nbsp;|&nbsp; <a href="/scoring/methodology" style="color:#7c9ff5">Full methodology →</a>
</p>

<div class="container" style="padding-top:8px">
  <h2 style="font-size:1.25em;margin-bottom:20px;text-align:center;color:#e0e0e0">What would you like to do?</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">

    <div onclick="document.getElementById('search-input').focus()" style="background:#161b22;border:1px solid #21262d;border-radius:8px;padding:20px;cursor:pointer;transition:border-color 0.15s" onmouseover="this.style.borderColor='#7c9ff5'" onmouseout="this.style.borderColor='#21262d'">
      <div style="font-size:1.4em;margin-bottom:8px">🔍</div>
      <div style="font-weight:700;margin-bottom:4px;color:#e0e0e0">Search for tools</div>
      <div style="color:#8b949e;font-size:0.88em">Agents: find the best tool for any task. Semantic search across 39K+ servers.</div>
    </div>

    <a href="#self-check" style="text-decoration:none;color:inherit">
      <div style="background:#161b22;border:1px solid #21262d;border-radius:8px;padding:20px;cursor:pointer;transition:border-color 0.15s" onmouseover="this.style.borderColor='#28a745'" onmouseout="this.style.borderColor='#21262d'">
        <div style="font-size:1.4em;margin-bottom:8px">🏆</div>
        <div style="font-weight:700;margin-bottom:4px;color:#e0e0e0">Check your grade</div>
        <div style="color:#8b949e;font-size:0.88em">Builders: paste your repo to see your score, get tips, and embed a badge.</div>
      </div>
    </a>

    <a href="/scoring/methodology" style="text-decoration:none;color:inherit">
      <div style="background:#161b22;border:1px solid #21262d;border-radius:8px;padding:20px;cursor:pointer;transition:border-color 0.15s" onmouseover="this.style.borderColor='#ffab00'" onmouseout="this.style.borderColor='#21262d'">
        <div style="font-size:1.4em;margin-bottom:8px">📊</div>
        <div style="font-weight:700;margin-bottom:4px;color:#e0e0e0">How scoring works</div>
        <div style="color:#8b949e;font-size:0.88em">13 signal dimensions. Fully transparent methodology. No black box.</div>
      </div>
    </a>

  </div>
</div>

<div class="container">
  <!-- Search -->
  <h2 style="margin-bottom:12px">Search Tools</h2>
  <!-- Category Quick Browse -->
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">
    <button onclick="doSearch('database')" style="background:#161b22;border:1px solid #30363d;border-radius:6px;padding:6px 14px;color:#8b949e;cursor:pointer;font-size:0.85em">🗄️ Database</button>
    <button onclick="doSearch('browser automation')" style="background:#161b22;border:1px solid #30363d;border-radius:6px;padding:6px 14px;color:#8b949e;cursor:pointer;font-size:0.85em">🌐 Browser</button>
    <button onclick="doSearch('PDF document')" style="background:#161b22;border:1px solid #30363d;border-radius:6px;padding:6px 14px;color:#8b949e;cursor:pointer;font-size:0.85em">📄 Documents</button>
    <button onclick="doSearch('API integration')" style="background:#161b22;border:1px solid #30363d;border-radius:6px;padding:6px 14px;color:#8b949e;cursor:pointer;font-size:0.85em">🔗 APIs</button>
    <button onclick="doSearch('cloud infrastructure')" style="background:#161b22;border:1px solid #30363d;border-radius:6px;padding:6px 14px;color:#8b949e;cursor:pointer;font-size:0.85em">☁️ Cloud</button>
    <button onclick="doSearch('AI machine learning')" style="background:#161b22;border:1px solid #30363d;border-radius:6px;padding:6px 14px;color:#8b949e;cursor:pointer;font-size:0.85em">🤖 AI/ML</button>
    <button onclick="doSearch('security audit')" style="background:#161b22;border:1px solid #30363d;border-radius:6px;padding:6px 14px;color:#8b949e;cursor:pointer;font-size:0.85em">🔒 Security</button>
    <button onclick="doSearch('communication messaging')" style="background:#161b22;border:1px solid #30363d;border-radius:6px;padding:6px 14px;color:#8b949e;cursor:pointer;font-size:0.85em">💬 Comm</button>
  </div>

  <div class="search-box">
    <input type="text" id="search-input" placeholder="What does your agent need? e.g. extract tables from PDF documents" onkeydown="if(event.key==='Enter')doSearch()">
    <button onclick="doSearch()">Search</button>
  </div>
  <div id="search-results"></div>

  <!-- Quality at a Glance -->
  <h2 style="margin-top:32px;margin-bottom:12px">📊 Quality at a Glance</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:16px 0">
    <div style="background:#161b22;border:1px solid #21262d;border-radius:8px;padding:14px;text-align:center">
      <div style="font-size:1.4em;font-weight:800;color:#28a745">51.7%</div>
      <div style="color:#8b949e;font-size:0.8em;margin-top:4px">Active tools (≤30d)</div>
    </div>
    <div style="background:#161b22;border:1px solid #21262d;border-radius:8px;padding:14px;text-align:center">
      <div style="font-size:1.4em;font-weight:800;color:#6c75e3">89.3%</div>
      <div style="color:#8b949e;font-size:0.8em;margin-top:4px">Grade B+ or above</div>
    </div>
    <div style="background:#161b22;border:1px solid #21262d;border-radius:8px;padding:14px;text-align:center">
      <div style="font-size:1.4em;font-weight:800;color:#ffab00">2,573</div>
      <div style="color:#8b949e;font-size:0.8em;margin-top:4px">Premium tools (≥50⭐)</div>
    </div>
    <div style="background:#161b22;border:1px solid #21262d;border-radius:8px;padding:14px;text-align:center">
      <div style="font-size:1.4em;font-weight:800;color:#dc3545">0.01%</div>
      <div style="color:#8b949e;font-size:0.8em;margin-top:4px">Truly dead projects</div>
    </div>
  </div>

  <!-- Grade Distribution -->
  <h2 style="margin-top:32px;margin-bottom:12px">Quality Grade Distribution</h2>
  <div style="max-width:960px;margin:32px auto 0;padding:0 20px">
  <h2 style="font-size:1.2em;margin-bottom:16px;color:#e0e0e0">📈 Grade Distribution</h2>
</div>
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
  <div id="self-check" class="badge-section" style="margin-bottom:24px">
    <h3>🔍 Check Your Tool's Grade</h3>
    <p style="color:#8b949e;margin-bottom:12px">Paste your GitHub repo to get a <strong>full health dashboard</strong> — score breakdown, improvement tips, badge embed code, and Trust Tier.</p>
    <form action="/check" method="get" style="display:flex;gap:10px;flex-wrap:wrap">
      <input type="text" name="repo" placeholder="owner/repo" style="flex:1;min-width:200px;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:12px 16px;color:#e0e0e0;font-size:1em;outline:none">
      <button type="submit" style="background:#6c75e3;border:none;border-radius:8px;padding:12px 20px;color:#fff;font-weight:600;cursor:pointer;font-size:1em">Check</button>
    </form>
    <p style="color:#484f58;font-size:0.8em;margin-top:6px">Opens your Tool Health Dashboard with detailed score breakdown & actionable improvement tips.</p>
    <div id="check-result" style="margin-top:16px;display:none"></div>
  </div>

  <!-- Badge Section -->
  <div class="badge-section">
    <h3>🏷️ Get Your Grade Badge</h3>
    <p style="color:#8b949e;margin-bottom:12px">Show your MCP server's quality grade on your GitHub README. Clickable badge — drives visitors to your tool's ranking.</p>
    <div class="badge-preview" style="margin:16px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="color:#e0e0e0;font-weight:600">puppeteer/puppeteer</span>
      <span style="color:#8b949e">→</span>
      <img src="/badge/puppeteer%2Fpuppeteer" alt="Grade" style="height:20px" />
    </div>
    <code>&lt;a href="https://agent-tool-intel-production.up.railway.app"&gt;&lt;img src="https://agent-tool-intel-production.up.railway.app/badge/YOUR_ORG%2FYOUR_REPO" alt="Agent Tool Intel Grade" /&gt;&lt;/a&gt;</code>
    <p style="color:#8b949e;margin-top:10px;font-size:0.85em">Replace <code>YOUR_ORG%2FYOUR_REPO</code> with your server name. <code>/</code> → <code>%2F</code>. Badge auto-updates. Also works on <strong>npm</strong>, <strong>PyPI</strong>, and any Markdown page.</p>
    <p style="color:#8b949e;margin-top:6px;font-size:0.8em">🔥 <strong>New: Badge v2 with execution count</strong> — shows how many times agents have run your tool. Use <code>/badge/v2/YOUR_ORG%2FYOUR_REPO</code> instead.</p>
  </div>
</div>

<footer>
  <a href="/">Home</a> · <a href="/docs">API Docs</a> · <a href="/scoring/methodology">Methodology</a> · <a href="/roadmap">Roadmap</a> · <a href="/partners">Partners</a> · <a href="/report/monthly">Monthly Report</a> · <a href="https://github.com/agent-tool-intel/agent-tool-intel">GitHub</a> · <a href="https://github.com/agent-tool-intel/agent-tool-intel/blob/master/CONTRIBUTING.md">Contribute</a>
  <br><br>Agent Tool Intelligence v0.2.0 · Built for agents. Transparent for humans.
</footer>

<script>
async function doSearch(preset) {
  const inp = document.getElementById('search-input');
  if (preset) { inp.value = preset; }
  const q = inp.value.trim();
  const div = document.getElementById('search-results');
  if (!q) return;
  div.style.display = 'block';
  div.className = 'loading';
  div.innerHTML = '<div style="text-align:center;padding:40px"><div style="display:inline-block;width:32px;height:32px;border:3px solid #30363d;border-top-color:#7c9ff5;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:16px"></div><p style="color:#8b949e">Searching ${totalTools.toLocaleString()} tools...</p></div>';

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
        '<div class="server">' + escapeH(r.serverName) + ' · Relevance: ' + r.relevanceScore + ' · Trust: ' + r.trust?.score + '/100 · Token: ' + (r.efficiency?.rating || '?') + '</div>' +
        '<div class="desc">' + escapeH(r.recommendationSummary || '') + '</div>' +
        '</div>';
    }).join('');
  } catch(e) {
    div.innerHTML = '<p style="color:#dc3545">Search failed. API may be starting up. Try again.</p>';
  }
}
function escapeH(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

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

// ── Favicon（inline SVG）──
publicRoute.get("/favicon.ico", (c) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0d1117"/><text x="16" y="23" font-family="system-ui,sans-serif" font-size="20" font-weight="800" fill="#7c9ff5" text-anchor="middle">A</text></svg>';
  return c.html(svg, 200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" });
});

// ── robots.txt ──
publicRoute.get("/robots.txt", (c) => {
  return c.text(`User-agent: *
Allow: /
Allow: /docs
Allow: /scoring/methodology
Allow: /roadmap
Allow: /report/monthly
Allow: /partners
Sitemap: https://agent-tool-intel-production.up.railway.app/sitemap.xml
`, 200, { "Content-Type": "text/plain" });
});

// ── sitemap.xml ──
publicRoute.get("/sitemap.xml", (c) => {
  const pages = ["", "docs", "scoring/methodology", "roadmap", "report/monthly", "partners"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url><loc>https://agent-tool-intel-production.up.railway.app/${p}</loc><changefreq>weekly</changefreq></url>`).join("\n")}
</urlset>`;
  return c.html(xml, 200, { "Content-Type": "application/xml" });
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
