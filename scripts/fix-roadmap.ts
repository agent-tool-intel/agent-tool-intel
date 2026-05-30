// Fix roadmap page
import * as fs from "fs";

let c = fs.readFileSync("src/routes/public.ts", "utf8");

const start = c.indexOf('publicRoute.get("/roadmap"');
const next = c.indexOf("// ── Tool Health Dashboard ──", start);

const newRoadmap = `publicRoute.get("/roadmap", (c) => {
  const html = \`<!DOCTYPE html>
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

<div class="phase"><h2 class="done">✅ Phase 1 — Foundation</h2><ul>
<li><span class="check">✓</span>Semantic search across MCP ecosystem</li>
<li><span class="check">✓</span>Automated quality scoring (5 dimensions)</li>
<li><span class="check">✓</span>Trust engine with feedback loop</li>
<li><span class="check">✓</span>Grade badges for GitHub README</li>
<li><span class="check">✓</span>Public API + documentation</li>
<li><span class="check">✓</span>19,000+ MCP servers indexed</li>
<li><span class="check">✓</span>6 distribution channels</li>
</ul></div>

<div class="phase"><h2 class="done">✅ Phase 2A — Build Trust</h2><ul>
<li><span class="check">✓</span>Scoring calibration</li>
<li><span class="check">✓</span>Trust Tier System</li>
<li><span class="check">✓</span>Data Provenance</li>
<li><span class="check">✓</span>Verified Publisher Badge</li>
<li><span class="check">✓</span>Activity Transparency</li>
<li><span class="check">✓</span>Self-Check Tool</li>
<li><span class="check">✓</span>Tool Health Dashboard</li>
<li><span class="check">✓</span>Featured Weekly picks</li>
<li><span class="check">✓</span>Methodology page</li>
</ul></div>

<p class="footnote">More phases coming. We ship, then we talk.<br>
Built in the open · <a href="https://github.com/HMCHENGGH/agent-tool-intel" style="color:#7c9ff5">GitHub</a></p>
</div></body></html>\`;
  return c.html(html);
});

// ── Tool Health Dashboard ──`;

c = c.slice(0, start) + newRoadmap + c.slice(next + "// ── Tool Health Dashboard ──".length);
fs.writeFileSync("src/routes/public.ts", c);
console.log("Roadmap fixed. Lines:", c.split("\n").length);
