// Monitor all distribution activity + platform health
// Run: npx tsx --env-file=.env scripts/monitor.ts
// Check: outreach replies, platform stats, API health

import { db } from "../src/db/index.js";
import { servers, tools, feedback } from "../src/db/schema.js";
import { sql } from "drizzle-orm";

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error("GITHUB_TOKEN not set"); process.exit(1); }
const INTEL_URL = "https://agent-tool-intel-production.up.railway.app";
const CHECK_OWNER = "HMCHENGGH"; // Your GitHub handle — issues you created

// All outreach issues we created
const OUTREACH_ISSUES = [
  // First wave
  "cloudflare/mcp#131", "argoproj-labs/mcp-for-argocd#121", "fdmtl/director#481",
  "levnikolaevich/claude-code-skills#48", "baryhuang/mcp-remote-macos-use#23",
  // Second wave (选部分 track)
  "opensolon/solon-ai#119", "n1byn1kt/apitap#57",
];

async function checkIssue(repo: string, issueNum: number) {
  const url = `https://api.github.com/repos/${repo}/issues/${issueNum}/comments`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": "Monitor", Accept: "application/vnd.github.v3+json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) return { repo, issueNum, status: "unknown" };
  const comments = await resp.json() as any[];
  const replies = comments.filter((c: any) => c.user?.login !== CHECK_OWNER);
  return {
    repo, issueNum,
    status: replies.length > 0 ? "replied" : "pending",
    replies: replies.length,
    closed: false, // Need separate issue check
  };
}

async function main() {
  console.log(`📊 Agent Tool Platform Monitor — ${new Date().toISOString()}\n`);
  console.log("=".repeat(60));

  // 1. Platform health
  console.log("\n🏥 Platform Health");
  try {
    const health = await (await fetch(`${INTEL_URL}/health`)).json();
    console.log(`   API: ${health.status} (v${(health as any).version})`);
  } catch { console.log("   ⚠️ API unreachable"); }

  // 2. Data stats
  console.log("\n📈 Data Stats");
  const [s, t, f] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(servers),
    db.select({ count: sql<number>`count(*)` }).from(tools),
    db.select({ count: sql<number>`count(*)` }).from(feedback),
  ]);
  console.log(`   Servers:  ${Number(s[0]?.count ?? 0).toLocaleString()}`);
  console.log(`   Tools:    ${Number(t[0]?.count ?? 0).toLocaleString()}`);
  console.log(`   Feedback: ${Number(f[0]?.count ?? 0).toLocaleString()}`);

  // 3. Check specific outreach issues for replies
  console.log("\n💬 Outreach Replies (replied issues only)");
  let replies = 0;
  for (const issueRef of OUTREACH_ISSUES) {
    const [repo, numStr] = issueRef.split("#");
    const result = await checkIssue(repo!, parseInt(numStr!));
    if (result.replies && result.replies > 0) {
      console.log(`   📬 ${issueRef}: ${result.replies} reply(s)`);
      replies++;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  if (replies === 0) console.log("   No new replies. All pending.");

  // 4. Search all recent GitHub issues created by us for replies
  console.log("\n🔍 Checking all recent outreach issues...");
  try {
    const searchUrl = `https://api.github.com/search/issues?q=author:${CHECK_OWNER}+type:issue+label:🏷️+created:>2026-05-28&per_page=50`;
    const searchResp = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": "Monitor", Accept: "application/vnd.github.v3+json" },
    });
    const searchData = await searchResp.json() as any;
    const issues = searchData.items || [];
    let totalComments = 0;
    for (const issue of issues) {
      if (issue.comments > 1) { // >1 means someone besides us replied
        totalComments++;
        console.log(`   📬 ${issue.repository_url.split("/repos/")[1]}#${issue.number}: ${issue.comments - 1} reply(s) — ${issue.title?.slice(0, 60)}`);
      }
    }
    if (totalComments === 0) console.log("   No replies detected across all issues.");
    console.log(`   Total outreach issues: ${issues.length}`);
  } catch (e) { console.log("   Search failed (rate limit?)"); }

  // 5. To-do reminder
  console.log("\n📋 Manual Checks");
  console.log("   ✉️  Check PulseMCP reply: hello@pulsemcp.com → your inbox");
  console.log("   🌐 Check MCP.so listing: https://mcp.so → search 'agentpilot'");
  console.log("   🐦 Check Reddit r/mcp (if posted)");
  console.log("\n" + "=".repeat(60));
  console.log("✅ Monitor complete. Run again: npx tsx --env-file=.env scripts/monitor.ts\n");
}

main().catch(e => { console.error("❌ Monitor failed:", e.message); });
