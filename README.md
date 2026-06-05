# Agent Tool Intelligence

> **Tools on tap. Not on disk.**
>
> The quality standard for AI agent tools. Semantic search, automated quality scoring, trust engine, and agent-native signals — built for agents, transparent for humans.

[![Grade: A](https://agent-tool-intel-production.up.railway.app/badge/puppeteer%2Fpuppeteer)](https://agent-tool-intel-production.up.railway.app)

---

## Why?

AI agents need tools. But today:
- **73% of MCP servers are invisible to agents** (no discoverable tool definitions)
- **Top 4 most popular servers all score D or below** in quality audits
- **36% of MCP servers score F on security**
- **No registry supports agent-driven discovery** — all browsing is human-mediated

Agent Tool Intelligence fixes this.

## What?

A **Tool-as-a-Service (TaaS)** platform that lets AI agents discover, evaluate, and select tools autonomously.

```
Agent: "I need to extract tables from PDFs"
   ↓
POST /api/v1/search  →  5 ranked results
   ↓
Best pick: puppeteer/puppeteer (A-grade, 94K⭐, 94% trust)
   ↓
Agent calls tool. Gets result. Done.
```

## Features

- **Semantic Search** — Agents search by capability, not keyword ("extract tables from PDF" → ranked results)
- **Agent Readiness Score** — Official status, GitHub stars, activity, documentation quality
- **Trust Engine** — Real-world success rates from agent feedback
- **Community Score** — Human-generated signals (stars, downloads, recency)
- **Discrepancy Flag** — Detects quality-trust contradictions (well-designed but unverified)
- **Sandbox Validation** — 7 automated checks per tool
- **Grade Badge** — Embed your tool's grade on GitHub README

## Quick Start

```bash
# Search for tools
curl -X POST https://agent-tool-intel-production.up.railway.app/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "browser automation", "maxResults": 3}'

# Get tool details
curl https://agent-tool-intel-production.up.railway.app/api/v1/tools/{tool_id}

# Submit feedback
curl -X POST https://agent-tool-intel-production.up.railway.app/api/v1/feedback \
  -H "Content-Type: application/json" \
  -d '{"toolId": "tool:mcp:puppeteer/puppeteer@latest", "result": "success", "rating": 5}'
```

## Grade Badge

Add your MCP server's quality grade to your GitHub README:

```markdown
[![Agent Tool Intel](https://agent-tool-intel-production.up.railway.app/badge/YOUR_ORG%2FYOUR_REPO)](https://agent-tool-intel-production.up.railway.app)
```

Replace `YOUR_ORG%2FYOUR_REPO` with your server name (use `%2F` for `/`).

Badge auto-updates as scores change. [See live example →](https://agent-tool-intel-production.up.railway.app)

## Platform

This project is part of the **Agent Tool Platform**:

| Module | Role |
|--------|------|
| **Agent Tool Intel** ← you are here | Quality scoring + search + trust |
| [AutoMine](https://github.com/agent-tool-intel/AI_Agent_Daily_Digest) | Tool discovery from content |
| [AgentPilot](https://github.com/agent-tool-intel/agent-pilot) | Tool registry + execution |

All three share a unified **Canonical ID** system: `tool:{source}:{namespace}/{name}@version`

## Stats

- **1,824** MCP servers indexed
- **1,834** tools scored
- **9,244** agent feedback events
- Sources: GitHub (1,705), npm (120)

## API

Base URL: `https://agent-tool-intel-production.up.railway.app`

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/search` | Semantic tool search with agent signals |
| `GET /api/v1/tools/:id` | Tool detail with scores |
| `POST /api/v1/tools/:id/test` | Sandbox validation |
| `POST /api/v1/feedback` | Submit agent usage feedback |
| `GET /health` | Health check |

## License

MIT
