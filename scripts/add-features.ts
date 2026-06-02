// Add Category + Dead Flag + Quality Floor to search
import * as fs from "fs";

let c = fs.readFileSync("src/services/search.ts", "utf8");

// Add category detection function
const catFunc = `function detectCategory(description: string, toolName: string): string {
  const text = (description + " " + toolName).toLowerCase();
  if (/database|sql|postgres|mysql|sqlite|mongodb|redis|supabase|firestore|dynamodb/i.test(text)) return "🗄️ Database";
  if (/browser|chrome|playwright|puppeteer|selenium|webdriver|firefox/i.test(text)) return "🌐 Browser";
  if (/pdf|markdown|csv|json|xml|doc|spreadsheet|excel|text|file/i.test(text)) return "📄 Documents";
  if (/github|gitlab|stripe|notion|slack|jira|linear|discord|api|rest/i.test(text)) return "🔗 APIs";
  if (/aws|cloudflare|azure|gcp|cloud|docker|kubernetes|terraform/i.test(text)) return "☁️ Cloud";
  if (/ai|ml|llm|rag|embedding|model|gpt|claude|openai|anthropic/i.test(text)) return "🤖 AI/ML";
  if (/security|audit|scan|pentest|vuln|auth|oauth|jwt/i.test(text)) return "🔒 Security";
  if (/log|metric|analytics|monitor|tracking|dashboard/i.test(text)) return "📊 Analytics";
  if (/search|index|elastic|meilisearch|algolia/i.test(text)) return "🔍 Search";
  if (/message|email|chat|sms|notif|webhook/i.test(text)) return "💬 Communication";
  return "🔧 Tools";
}

`;

c = c.replace("function getDiscrepancy(", catFunc + "function getDiscrepancy(");

// Add category + deadProject to result
c = c.replace(
  "communityScore: calcCommunityScore(row),",
  `communityScore: calcCommunityScore(row),
        category: detectCategory(row.tool_description || "", row.tool_name || ""),
        isDeadProject: buildAgentSignals(row)?.activityStatus === "abandoned" || (quality?.grade === "F"),`
);

// Add quality floor filter
c = c.replace(
  ".filter((r: SearchResultTool) => r.quality.overall >= minScore)",
  `.filter((r: SearchResultTool) => {
      if (r.quality.overall < minScore) return false;
      if (params.preferences?.excludeDeadProjects && r.isDeadProject) return false;
      if (params.preferences?.requireActive && r.agentSignals?.activityStatus !== "active" && r.agentSignals?.activityStatus !== "maintained") return false;
      if (params.preferences?.minStars && (r.agentSignals?.githubStars || 0) < params.preferences.minStars) return false;
      if (params.preferences?.minGrade) {
        const order = ["A+","A","B+","B","C","D","F"];
        const minIdx = order.indexOf(params.preferences.minGrade);
        const gradeIdx = order.indexOf(r.quality.grade);
        if (minIdx >= 0 && gradeIdx > minIdx) return false;
      }
      return true;
    })`
);

fs.writeFileSync("src/services/search.ts", c);
console.log("Search updated with category + dead flag + quality floor");
