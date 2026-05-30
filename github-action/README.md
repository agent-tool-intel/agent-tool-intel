# Agent Tool Intel — GitHub Action

Auto-check your MCP server's quality grade on every push. Get a grade badge and improvement tips directly in your GitHub workflow summary.

## Quick Start

Add this to `.github/workflows/grade.yml` in your MCP server repo:

```yaml
name: Grade Check

on:
  push:
    branches: [main, master]
  release:
    types: [published]

jobs:
  grade:
    runs-on: ubuntu-latest
    steps:
      - uses: HMCHENGGH/agent-tool-intel/github-action@master
```

That's it. On every push, your workflow summary will show your current grade.

## What You Get

- **Grade Badge** in your workflow summary
- **Score breakdown** link to Tool Health Dashboard
- **Improvement tips** on how to raise your grade

## Example Output

```
🏷️ Agent Tool Intel Grade
![Grade B](badge-url)
**Grade:** B (72/100)
**Full Report:** health dashboard link
```

## Requirements

- Your MCP server must be indexed on [Agent Tool Intel](https://agent-tool-intel-production.up.railway.app)
- No API key required
- No signup required
