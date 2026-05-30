# Agent Tool Intel — VS Code Extension

See your MCP server's quality grade right in your editor status bar.

## Features

- **Status Bar Grade**: Shows your tool's grade (A+ through F) in the VS Code status bar
- **Auto-detect**: Reads your git remote to find your repo name
- **One-click Dashboard**: Click the grade to open your full Tool Health Dashboard
- **Manual check**: Run "Agent Tool Intel: Check Grade" from Command Palette

## How It Works

1. Extension reads your git remote to detect your GitHub repo
2. Calls the Agent Tool Intel API to get your quality grade
3. Displays it in the status bar

Status bar shows:
```
✅ Intel: A (88)    ← Your tool scored A!
⚠️ Intel: C (60)    ← Needs improvement
ℹ️ Intel: Not indexed ← Your tool isn't indexed yet
```

## Requirements

- VS Code 1.85+
- Your repo must be indexed on [Agent Tool Intel](https://agent-tool-intel-production.up.railway.app)

## Configuration

```json
{
  "agentToolIntel.repoName": "owner/repo"
}
```

If not set, auto-detected from git remote.

## Commands

- `Agent Tool Intel: Check Grade` — Manually check your grade
- `Agent Tool Intel: Open Health Dashboard` — Open full report in browser
