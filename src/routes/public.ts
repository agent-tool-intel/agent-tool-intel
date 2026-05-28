import { Hono } from "hono";
import { db } from "../db/index.js";
import { servers, tools, qualityScores, feedback } from "../db/schema.js";
import { eq, desc, sql } from "drizzle-orm";

export const publicRoute = new Hono();

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
  <p>The quality standard for AI agent tools. Semantic search, automated quality scoring, trust engine, and sandbox validation — built for agents, transparent for humans.</p>
  <span class="api-url">POST api.agenttoolintel.com/api/v1/search</span>
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

  <!-- Badge Section -->
  <div class="badge-section">
    <h3>🏷️ Embed Your Grade Badge</h3>
    <p style="color:#8b949e;margin-bottom:12px">Add your tool's quality grade to your GitHub README. Copy the markdown below and replace <code>YOUR_TOOL</code> with your canonical tool ID.</p>
    <code>&lt;a href="https://agent-tool-intel-production.up.railway.app"&gt;&lt;img src="https://agent-tool-intel-production.up.railway.app/badge/YOUR_TOOL" alt="Agent Tool Intel Grade" /&gt;&lt;/a&gt;</code>
    <p style="color:#8b949e;margin-top:10px;font-size:0.85em">Badge auto-updates as your quality and trust scores change.</p>
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
</script>
</body>
</html>`;

  return c.html(html);
});

// ── Badge endpoint ──

publicRoute.get("/badge/:toolId", (c) => {
  const toolId = c.req.param("toolId");
  // Return a simple SVG badge
  // For now, static placeholder. Phase 2: dynamic grade lookup.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="20">
  <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#7c9ff5"/>
    <stop offset="100%" stop-color="#a78bfa"/>
  </linearGradient>
  <rect width="180" height="20" rx="4" fill="url(#bg)"/>
  <text x="10" y="14" font-family="system-ui,sans-serif" font-size="11" fill="#fff" font-weight="700">Agent Tool Intel</text>
  <text x="130" y="14" font-family="system-ui,sans-serif" font-size="11" fill="rgba(255,255,255,0.9)">Grade</text>
</svg>`;

  return c.html(svg, 200, { "Content-Type": "image/svg+xml" });
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
