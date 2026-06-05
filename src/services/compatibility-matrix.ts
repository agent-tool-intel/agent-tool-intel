// Compatibility Matrix — Phase 3A Feature #26
// Static mapping: which MCP install types work with which frameworks/IDEs/clouds

interface CompatibilityEntry {
  framework: string;
  type: "framework" | "ide" | "cloud" | "client";
  supportedInstallTypes: string[];
  notes: string;
}

const MATRIX: CompatibilityEntry[] = [
  { framework: "Claude Desktop", type: "client", supportedInstallTypes: ["npx", "node", "stdio"], notes: "Full MCP support via stdio. Add to claude_desktop_config.json." },
  { framework: "Claude Code", type: "client", supportedInstallTypes: ["npx", "node", "http", "sse"], notes: "Supports stdio + HTTP/SSE transports." },
  { framework: "Cursor", type: "ide", supportedInstallTypes: ["npx", "node", "stdio"], notes: "MCP support via .cursor/mcp.json config." },
  { framework: "Windsurf", type: "ide", supportedInstallTypes: ["npx", "node", "stdio"], notes: "MCP support via settings." },
  { framework: "ChatGPT", type: "client", supportedInstallTypes: ["http", "sse"], notes: "HTTP/SSE MCP transport via ChatGPT plugins." },
  { framework: "Copilot (GitHub)", type: "ide", supportedInstallTypes: ["npx", "node", "http"], notes: "MCP via .github/copilot-instructions.md + external endpoints." },
  { framework: "LangChain", type: "framework", supportedInstallTypes: ["npx", "python", "http", "sse"], notes: "langchain-mcp-adapters package. Full MCP integration." },
  { framework: "LlamaIndex", type: "framework", supportedInstallTypes: ["npx", "python", "http"], notes: "llama-index-tools-mcp package." },
  { framework: "Semantic Kernel", type: "framework", supportedInstallTypes: ["npx", "dotnet", "http"], notes: "Microsoft MCP extension for SK." },
  { framework: "Smithery", type: "cloud", supportedInstallTypes: ["npx", "node", "python", "http"], notes: "Hosted MCP execution. Auto-handles transport." },
  { framework: "Railway", type: "cloud", supportedInstallTypes: ["http", "sse", "docker"], notes: "Deploy MCP servers as HTTP services." },
  { framework: "Docker", type: "cloud", supportedInstallTypes: ["docker"], notes: "Universal. Works with all clients via stdio proxy." },
];

export function getCompatibilityMatrix(installType?: string): CompatibilityEntry[] {
  if (!installType) return MATRIX;
  return MATRIX.filter(e => e.supportedInstallTypes.includes(installType));
}

export function getSupportedInstallTypes(framework: string): string[] | null {
  const entry = MATRIX.find(e => e.framework.toLowerCase() === framework.toLowerCase());
  return entry ? entry.supportedInstallTypes : null;
}

export function renderCompatibilityMd(installType: string): string {
  const compat = getCompatibilityMatrix(installType);
  const grouped: Record<string, CompatibilityEntry[]> = {};
  compat.forEach(e => {
    const bucket = grouped[e.type] || (grouped[e.type] = []);
    bucket.push(e);
  });

  let md = "## 🔌 Compatibility Matrix\n\n";
  md += `Tools with install type **\`${installType}\`** are compatible with:\n\n`;

  const order = ["client", "ide", "framework", "cloud"];
  for (const type of order) {
    const entries = grouped[type];
    if (!entries?.length) continue;
    const label = { client: "AI Clients", ide: "IDEs", framework: "Frameworks", cloud: "Cloud/Hosting" }[type];
    md += `### ${label}\n\n`;
    md += "| Platform | Notes |\n";
    md += "|----------|-------|\n";
    entries.forEach(e => {
      md += `| **${e.framework}** | ${e.notes} |\n`;
    });
    md += "\n";
  }

  return md;
}
