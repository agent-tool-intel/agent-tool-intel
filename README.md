# Agent Tool Intelligence

> **You built an MCP server. Is it any good?**
>
> 54% of MCP servers have solid code but zero community adoption — invisible to the agents that need them. Don't let yours be one.
>
> 39,752+ servers scored. Quality Score + Community Bonus + Trust Bonus. Free. No signup. Open source.

<p align="center">
  <a href="https://agent-tool-intel-production.up.railway.app">
    <img src="https://agent-tool-intel-production.up.railway.app/badge/puppeteer%2Fpuppeteer" alt="Grade A" />
  </a>
  <br/>
  <sub>Every MCP server deserves a grade. <a href="https://agent-tool-intel-production.up.railway.app">Check yours →</a></sub>
</p>

---

## 🗺️ You just found treasure. Now what?

| You are a... | Start here |
|-------------|------------|
| 🛠️ **MCP Builder** | → [Check your server's grade instantly](https://agent-tool-intel-production.up.railway.app) — paste your GitHub URL |
| 🤖 **AI Developer** | → [API Quick Start](#-quick-start) — one curl to search 39K+ tools |
| 🔍 **Just curious** | → [See the public leaderboard](https://agent-tool-intel-production.up.railway.app) — top tools ranked |
| 🏢 **Enterprise / Team** | → [Scoring Methodology](https://agent-tool-intel-production.up.railway.app/scoring/methodology) — how we score, transparently |
| 🤝 **Want to partner?** | → [Open an issue](https://github.com/agent-tool-intel/agent-tool-intel/issues) or contact us |

---

## 💎 The Treasure: What's Inside

### For MCP Builders

| Treasure | What you get |
|----------|-------------|
| 🏷️ **[Grade Badge](https://agent-tool-intel-production.up.railway.app)** | Dynamic SVG badge for your README. Auto-updates. Free forever. |
| 📊 **[Health Dashboard](https://agent-tool-intel-production.up.railway.app)** | Per-repo score breakdown. See exactly what to improve. |
| 💡 **Improvement Tips** | Specific, actionable advice to raise your grade. |
| 📈 **Monthly Ecosystem Report** | Where your tool ranks. Trends. Hidden gems. |
| ⚡ **Execution Analytics** *(coming)* | How many agents use your tool? Success rate? |

### For AI Agents

| Treasure | What you get |
|----------|-------------|
| 🔍 **Semantic Search API** | "Extract tables from PDF" → ranked results. Not keyword match. |
| 🧠 **Additive Scoring** | Quality Score + Community Bonus + Trust Bonus. Clear path to improve. |
| 🛡️ **Trust Engine** | Real-world success rates. Not simulated. |
| 🚀 **Execution Gateway** *(coming)* | Execute tools via one API call. |

### For Everyone

| Treasure | What you get |
|----------|-------------|
| 📖 **Open Source** | MIT license. All scoring methodology public. |
| 🔬 **Transparent Scores** | 13 signal dimensions. No black box. |
| 📊 **Ecosystem Data** | 39,752 servers. Grade distribution. Trends. |

---

## 🗺️ Dig Deeper: The Full Map

```
🥇 Level 1:  Self-check your tool         → https://agent-tool-intel-production.up.railway.app
🥈 Level 2:  Read the API docs            → https://agent-tool-intel-production.up.railway.app/docs
🥉 Level 3:  Understand the methodology   → https://agent-tool-intel-production.up.railway.app/scoring/methodology
🏆 Level 4:  See the roadmap              → https://agent-tool-intel-production.up.railway.app/roadmap
👑 Level 5:  Become a partner             → Open an issue or email us
```

---

## 🚀 Quick Start

```bash
# Search for tools (agents call this)
curl -X POST https://agent-tool-intel-production.up.railway.app/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "extract tables from PDF", "maxResults": 3}'

# Embed a grade badge (builders do this)
# [![Grade](https://agent-tool-intel-production.up.railway.app/badge/YOUR_ORG%2FYOUR_REPO)]
# (https://agent-tool-intel-production.up.railway.app)
```

---

## 📊 By The Numbers

| Stat | Value |
|------|-------|
| MCP Servers Indexed | **39,752** |
| Tools Scored | **39,762** |
| Grade A (truly exceptional) | **~4%** |
| Sources | GitHub, npm, GitLab, Official Registry |
| Open Source | MIT License |

---

## 🏗️ Architecture

This is part of the **Agent Tool Platform**:

| Module | What it does | Status |
|--------|-------------|:---:|
| **Agent Tool Intel** ← you are here | Quality scoring + search + trust | ✅ Live |
| [AgentPilot](https://github.com/agent-tool-intel/agent-pilot) | Agent task orchestration + tool registry | ✅ Live |
| AutoMine | Automated tool discovery from content | 🔧 |

All three share a unified **Canonical ID** system: `tool:{source}:{namespace}/{name}@version`

---

## 🤝 How to Contribute

- **MCP Builder?** [Check your grade](https://agent-tool-intel-production.up.railway.app) and embed a badge
- **Found a bug?** [Open an issue](https://github.com/agent-tool-intel/agent-tool-intel/issues)
- **Want to improve scoring?** Read [CONTRIBUTING.md](CONTRIBUTING.md)
- **Have real execution data?** [Become a partner](https://github.com/agent-tool-intel/agent-tool-intel/issues) — data feeds improve trust scores for everyone
- **Just want to say hi?** We read every issue

---

## 📜 License

MIT — use it, fork it, build on it. Just don't spam people with it.

---

<p align="center">
  <sub>Built in the open. One civil engineer + one AI agent. 10 days.</sub>
</p>
