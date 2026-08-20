# MCP Development Complete Handoff

> Generated: 2026-08-07 by Claude Code (HA session)
> Scope: All MCP servers, clients, tools, descriptors, and integrations across the operator ecosystem.

---

## 1. Executive Summary

The ecosystem has **three distinct MCP layers**:

| Layer | Path | Purpose |
|-------|------|---------|
| **HA MCP (local)** | `~/.grok/hard-allow/mcp*.mjs` | Context nodes, HA status, credentials, infrastructure, query pipeline |
| **MHA MCP (project)** | `/Users/c/dev/multi-llm-ha-chat/src/mcp-server.mjs` | Multi-LLM orchestration room-level tool server |
| **Grok/Chrome MCP descriptors** | `~/.grok/projects/*/mcps/**` | Tool schemas consumed by the Grok agent runtime |

All layers are wired to serve context nodes, agent orchestration, and infrastructure state to LLMs.

---

## 2. HA MCP Layer (`~/.grok/hard-allow/`)

### 2.1 Core MCP Servers

#### `mcp-ha-integration.mjs` — Full HA Tool Suite
- **23 MCP tools** split into 4 categories:
  - **Ceremony & Token (6)**: `validate_token`, `run_ceremony`, `get_inheritance_chain`, `prepare_subagent_env`, `get_time_until_expiry`, `refresh_token`
  - **Modes & Restrictions (6)**: `switch_to_armed_mode`, `switch_to_degraded_mode`, `activate_restricted_mode`, `check_node_allowed`, `get_restriction_stats`, `get_audit_trail`
  - **Context Nodes (6)**: `query_nodes`, `get_node`, `add_node`, `list_agents`, `list_capabilities`, `get_agent_status`
  - **System Status (5)**: `get_live_state`, `get_infrastructure_status`, `get_credentials_status`, `list_endpoints`, `get_ha_logs`
  - **Legacy (4)**: `ha_status`, `ha_context`, `check_grant`, `mode_status`
- Exports: `HAMCPIntegration`, `HAMCPServer`, `initializeHAIntegration()`, `wrapQueryWithHAContext()`, `createHAQueryMiddleware()`
- Reads `~/.grok/context-nodes/state.json` into a cache.
- Logs to `~/.grok/hard-allow/ha-query-log.jsonl`.
- Runs as stdio MCP server when executed directly.

#### `mcp-context-query-pipeline.mjs` — Context Graph + Query Pipeline
- **Classes**:
  - `ContextGraphBuilder`: loads/saves `~/.grok/hard-allow/context-graph.json`, builds nodes/edges Maps.
  - `QueryPipeline`: enriches queries, finds relevant context, ranks by relevance/recency/access, caches results.
  - `MCPContextServer`: exposes 5 tools — `add_context_node`, `query_context`, `get_related_context`, `link_context_nodes`, `get_context_stats`.
- Uses simple keyword/tag/LLM-context scoring (no real embeddings yet).
- Serves as the **primary context graph backend** for live queries.

#### `mcp-live-node-provider.mjs` — Live Node Serving
- **Classes**:
  - `LiveNodeProvider`: queries hub state, scores nodes by text similarity, recency, activation, session boost.
  - `PriorityRanking`: weighted multi-factor ranking.
  - `ContextGating`: LLM-specific gating rules for `grok` (100 nodes), `claude` (50), `kimi` (30), `fable` (40).
  - `ActivationBoosting`: boosts session/decision/learning nodes.
  - `MCPLiveNodeIntegration`: main entry point `provideContext(query, llm, options)`.
- Integrates with a `matrixHub` that has `getState()` and `semanticPipeline`.

#### `mcp-query-server.mjs` — Unified Query Engine MCP Server
- Wraps `QueryOrchestrator` from `./unified-context-query.mjs`.
- Exposes single tool `context_query` via JSON-RPC 2.0 over stdio.
- Supports tags, capabilities, type filters, semantic activation, multiple output formats.
- Runs daemon mode with `--daemon`.

#### `mcp-server-daemon.mjs` — Daemon Lifecycle Manager
- Manages background process for `mcp-context-query-pipeline.mjs`.
- PID file: `~/.grok/hard-allow/mcp-daemon.pid`
- Health file: `~/.grok/hard-allow/mcp-daemon-health.json`
- Commands: `start`, `stop`, `status`, `restart`.
- Registers 5 tools: `add_context_node`, `query_context`, `get_related_context`, `link_context_nodes`, `get_context_stats`.
- Health checks every 30s.

### 2.2 Installation & Registration Scripts

#### `mcp-daemon-install.sh`
- Installs daemon as macOS `launchd` or Linux `systemd` user service.
- Uses plist template: `~/.grok/hard-allow/mcp-daemon-launchd.plist`
- Auto-runs `mcp-tool-registration.sh` after install.
- Health endpoint checked at `http://127.0.0.1:9998/health`.

#### `mcp-tool-registration.sh`
- Registers `context-query-pipeline.json` in all LLM MCP config dirs:
  - `~/.grok/.mcp/tools/`
  - `~/.claude/.mcp/tools/`
  - `~/.kimi/.mcp/tools/`
  - `~/.fable/.mcp/tools/`

### 2.3 MCP Tool Descriptor

#### `mcp/context-node-pull.json`
- Tool name: `context_node_pull`
- Executable: `~/.grok/hard-allow/bin/ha-context-pull.mjs`
- Output formats: `json`, `jsonl`, `markdown`, `prompt`
- Targets: `claude`, `kimi`, `grok`

---

## 3. MHA MCP Layer (`/Users/c/dev/multi-llm-ha-chat/`)

### 3.1 `src/mcp-server.mjs`
- Default room: `mcp`
- Uses `buildAgentContext(ROOM, { agent: 'mcp', toolRegistry: createDefaultToolRegistry() })`
- Handles `initialize`, `tools/list`, `tools/call` over stdio.
- Returns tool results as `content: [{ type: 'text', text: JSON.stringify(result) }]`.

### 3.2 `src/kernel/mcp-client.mjs`
- `McpClient` class spawns external MCP servers via stdio.
- Loads/saves server configs from `<room>/mcp-servers.json`.
- JSON-RPC 2.0 client with pending request map.
- Timeout: 10s for initialization.

---

## 4. Grok Runtime MCP Descriptors (`~/.grok/projects/`)

### 4.1 Grok Agent Tools (`mcps/grok/tools/*.json`)
Located in multiple project relocations:
- `~/.grok/projects/Users-c-dev-gordythos/mcps/grok/tools/`
- `~/.grok/projects/Users-c-dev-coworking-mesh-mesh-compute-autonomy-grok/mcps/grok/tools/`
- `~/.grok/projects/private-tmp/mcps/grok/tools/`

Key tools:
- `agent.json` — launch Claude subagent with role/task.
- `claude_code.json` — delegate full task to Claude Code.
- `duo_orchestrate.json` — Grok + Claude autonomous duo loop.
- `bash.json`, `read_file.json`, `write_file.json`, `edit_file.json`, `glob.json`, `grep.json`
- `grok_ask.json`, `grok_code.json`, `grok_image.json`, `grok_search.json`
- `web_fetch.json`, `web_search.json`
- `skill.json`, `list_skills.json`, `search_skills.json`

### 4.2 Chrome DevTools MCP (`mcps/chrome-devtools/tools/*.json`)
Browser automation tools: navigate, click, type, screenshot, evaluate, network/console capture, Lighthouse audit, etc.

---

## 5. Data Flow

```
User Query
   │
   ├─→ HA MCP (mcp-ha-integration.mjs) ──→ state.json cache ──→ context nodes
   │
   ├─→ Context Query Pipeline (mcp-context-query-pipeline.mjs) ──→ context-graph.json
   │
   ├─→ Live Node Provider (mcp-live-node-provider.mjs) ──→ matrixHub + semanticPipeline
   │
   ├─→ MHA MCP (mcp-server.mjs) ──→ toolRegistry + agentContext
   │
   └─→ Grok Runtime ──→ project MCP descriptors ──→ bash/read/write/grep/agent/claude_code...
```

---

## 6. Integration Points

| Component | Reads From | Writes To |
|-----------|-----------|-----------|
| `mcp-ha-integration.mjs` | `~/.grok/context-nodes/state.json`, HA env | `ha-query-log.jsonl` |
| `mcp-context-query-pipeline.mjs` | `~/.grok/hard-allow/context-graph.json` | `context-graph.json`, `query-log.jsonl` |
| `mcp-live-node-provider.mjs` | `matrixHub.getState()` | LLM responses |
| `mcp-query-server.mjs` | `unified-context-query.mjs` | stdio |
| `mcp-server-daemon.mjs` | `mcp-context-query-pipeline.mjs` | `mcp-daemon.pid`, `mcp-daemon-health.json` |
| MHA `mcp-server.mjs` | `tools/index.mjs`, `kernel/context.mjs` | stdio |
| MHA `mcp-client.mjs` | `<room>/mcp-servers.json` | `<room>/mcp-servers.json` |

---

## 7. Gaps & Next Steps

1. **Embeddings**: Current scoring is keyword-based. Add vector embeddings for semantic search.
2. **Real-time sync**: Context graph is file-backed; consider in-memory pub/sub or WebSocket layer.
3. **MCP daemon health endpoint**: `mcp-server-daemon.mjs` checks `:9998/health` but the pipeline server does not currently expose HTTP.
4. **Kimi OAuth refresh**: Kimi token expired; interactive refresh needed before Kimi MCP client works.
5. **Fable safeguards**: Fable/Opus refuses HA-related agent tasks via Agent API; use direct tool execution or local model instead.
6. **Visualizer**: `localhost:8000` needs content viewer + NLP interpreter + live refresh on new node ingestion.
7. **Automatic ingestion**: Watcher exists (`watch-scratchpad.mjs`) but should be extended to watch `/Users/c/dev` and desktop paths.

---

## 8. Quick Commands

```bash
# HA MCP status
node ~/.grok/hard-allow/mcp-ha-integration.mjs

# Start context query pipeline
node ~/.grok/hard-allow/mcp-context-query-pipeline.mjs

# Daemon control
node ~/.grok/hard-allow/mcp-server-daemon.mjs start
node ~/.grok/hard-allow/mcp-server-daemon.mjs status
node ~/.grok/hard-allow/mcp-server-daemon.mjs stop

# Install/register
bash ~/.grok/hard-allow/mcp-daemon-install.sh --install
bash ~/.grok/hard-allow/mcp-tool-registration.sh

# MHA MCP server
node /Users/c/dev/multi-llm-ha-chat/src/mcp-server.mjs
```

---

## 9. Files Inventory

### HA MCP
- `~/.grok/hard-allow/mcp-ha-integration.mjs` (1138 lines)
- `~/.grok/hard-allow/mcp-context-query-pipeline.mjs` (508 lines)
- `~/.grok/hard-allow/mcp-live-node-provider.mjs` (441 lines)
- `~/.grok/hard-allow/mcp-query-server.mjs` (274 lines)
- `~/.grok/hard-allow/mcp-server-daemon.mjs` (290 lines)
- `~/.grok/hard-allow/mcp-daemon-install.sh` (317 lines)
- `~/.grok/hard-allow/mcp-tool-registration.sh` (108 lines)
- `~/.grok/hard-allow/mcp/context-node-pull.json`

### MHA MCP
- `/Users/c/dev/multi-llm-ha-chat/src/mcp-server.mjs` (43 lines)
- `/Users/c/dev/multi-llm-ha-chat/src/kernel/mcp-client.mjs` (171 lines)

### Grok Runtime Descriptors
- `~/.grok/projects/*/mcps/grok/tools/*.json` (20+ tools)
- `~/.grok/projects/*/mcps/chrome-devtools/tools/*.json` (30+ tools)

---

## 10. Related Context Nodes

- `scratchpad.766feef5-0250-43cf-ac9a-548cdb100614.KIMI_SESSION_2026-08-07-HARD-ALLOW-DOCS.md`
- `scratchpad.766feef5-0250-43cf-ac9a-548cdb100614.SESSION_MASTER_INDEX_v2.md`
- `system.infrastructure`
- `system.credentials`
- `system.endpoints`
- `agents.grok`, `agents.claude`, `agents.kimi`, `agents.fable`
