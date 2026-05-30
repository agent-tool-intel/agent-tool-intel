import * as vscode from "vscode";

const INTEL_API = "https://agent-tool-intel-production.up.railway.app";
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  // Status bar item — shows grade
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "agentToolIntel.openDashboard";
  statusBarItem.tooltip = "Click to open Agent Tool Intel Health Dashboard";
  context.subscriptions.push(statusBarItem);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("agentToolIntel.checkGrade", () =>
      checkGrade()
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("agentToolIntel.openDashboard", () =>
      openDashboard()
    )
  );

  // Auto-check on startup
  checkGrade();
}

async function getRepoName(): Promise<string | undefined> {
  // Try config first
  const config = vscode.workspace.getConfiguration("agentToolIntel");
  const configured = config.get<string>("repoName");
  if (configured) return configured;

  // Auto-detect from git remote
  try {
    const gitExt = vscode.extensions.getExtension("vscode.git");
    if (gitExt?.isActive) {
      const gitApi = gitExt.exports.getAPI(1);
      const repo = gitApi.repositories[0];
      if (repo?.state?.remotes?.[0]?.fetchUrl) {
        const url = repo.state.remotes[0].fetchUrl;
        const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
        if (match) return match[1];
      }
    }
  } catch {}

  return undefined;
}

async function checkGrade(): Promise<void> {
  const repoName = await getRepoName();
  if (!repoName) {
    statusBarItem.text = "$(question) Intel: No repo";
    statusBarItem.show();
    return;
  }

  statusBarItem.text = "$(sync~spin) Intel: checking...";
  statusBarItem.show();

  try {
    const encoded = encodeURIComponent(repoName);
    const resp = await fetch(`${INTEL_API}/badge/${encoded}`);
    const svg = await resp.text();
    const gradeMatch = svg.match(/Grade ([A-F]\+?)/);
    const scoreMatch = svg.match(/\((\d+)\/100\)/);

    if (gradeMatch) {
      const grade = gradeMatch[1];
      const score = scoreMatch ? scoreMatch[1] : "?";
      const icon = grade.startsWith("A") ? "pass" : grade.startsWith("B") ? "pass-filled" : "warning";

      statusBarItem.text = `$(${icon}) Intel: ${grade} (${score})`;
      statusBarItem.backgroundColor = undefined;
    } else {
      statusBarItem.text = "$(info) Intel: Not indexed";
    }
  } catch {
    statusBarItem.text = "$(error) Intel: Offline";
  }
}

async function openDashboard(): Promise<void> {
  const repoName = await getRepoName();
  if (repoName) {
    vscode.env.openExternal(
      vscode.Uri.parse(`${INTEL_API}/health/${repoName}`)
    );
  } else {
    vscode.env.openExternal(vscode.Uri.parse(INTEL_API));
  }
}

export function deactivate() {}
