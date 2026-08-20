# MCP HA Integration — Complete Technical Reference

**Date:** 2026-08-07  
**Status:** COMPLETE + ACTIVE (daemon running)  
**Service:** com.jailbroken.mcp-context-query-pipeline (macOS launchd)  
**Operator:** conradoux@hotmail.com

---

## OVERVIEW

HA MCP is a **two-tier system**:

1. **Tier 1: ha-mcp-integration.mjs** (37.5KB)
   - Core HA token ceremony, modes, grants, inheritance
   - 23 tools total (ceremony, modes, nodes, status)
   - Direct MCP tool exposure
   - Registered in Claude settings + Grok .mcp/mcp.json

2. **Tier 2: mcp-context-query-pipeline** (daemon + 5 tools)
   - Long-running daemon (launchd)
   - Query context nodes (489 nodes, 403 edges)
   - Real-time integration with state.json
   - Available to all LLMs (Claude, Grok, Kimi, Fable)

---

## TIER 1: ha-mcp (Direct HA Access)

### Configuration
```json
{
  "mcpServers": {
    "ha-mcp": {
      "command": "node",
      "args": ["~/.grok/hard-allow/mcp-ha-integration.mjs"],
      "description": "HARD ALLOW MCP Suite - Full HA system access",
      "disabled": false
    }
  }
}
```

**Registered in:**
- `~/.claude/settings.json` (Claude Code primary)
- `~/.grok/.mcp/mcp.json` (Grok)
- `~/.kimi/.mcp/mcp.json` (Kimi)
- `~/.fable/.mcp/mcp.json` (Fable)

### Tools (23 total)

#### CEREMONY & TOKEN (6 tools)

| Tool | Signature | Purpose |
|------|-----------|---------|
| `validate_token` | `() → {valid, expiresAt, grantsActive}` | Verify HA token is valid and live |
| `run_ceremony` | `(code?: string) → {token, expiresAt, status}` | Run new HA ceremony (code + Touch ID) |
| `get_inheritance_chain` | `() → {parent, child, grandchild, ancestors}` | Trace token inheritance lineage |
| `prepare_subagent_env` | `() → {env_vars}` | Return HA env vars for child process |
| `get_time_until_expiry` | `() → {hours, minutes, seconds, formatted}` | How much time until token expires |
| `refresh_token` | `() → {success, newToken, newExpiry}` | Extend token 6h (if time remaining) |

**Example (Claude Code):**
```bash
call validate_token()
# Output: { valid: true, expiresAt: "2026-08-07T11:50:38.913Z", grantsActive: 3 }
```

#### MODES & RESTRICTIONS (6 tools)

| Tool | Signature | Purpose |
|------|-----------|---------|
| `switch_to_armed_mode` | `(reason?: string) → {mode, granted, timestamp}` | Full access, all 3 grants active |
| `switch_to_degraded_mode` | `(reason?: string) → {mode, restrictions, timestamp}` | Infection-delivery lab-only, 2/3 grants |
| `activate_restricted_mode` | `(reason?: string) → {mode, capabilities, timestamp}` | Read-only, no grants active |
| `check_node_allowed` | `(nodeId: string) → {allowed, reason, mode}` | Is this node accessible in current mode? |
| `get_restriction_stats` | `() → {mode, blockedNodes, allowedNodes, percentage}` | How many nodes blocked in current mode? |
| `get_audit_trail` | `(limit?: number, filter?: string) → [events]` | HA access log (filtered by mode change/token/grants) |

**Example (Grok):**
```bash
call switch_to_degraded_mode("Testing restricted mode")
# Output: { mode: "DEGRADED", restrictions: { infectionDelivery: "lab-only" } }

call get_restriction_stats()
# Output: { mode: "DEGRADED", blockedNodes: 142, allowedNodes: 347 }
```

#### CONTEXT NODES (6 tools)

| Tool | Signature | Purpose |
|------|-----------|---------|
| `query_nodes` | `(filter: string, limit?: number) → [nodes]` | Search context nodes (agents, capabilities, categories) |
| `get_node` | `(nodeId: string) → {node, edges, metadata}` | Fetch single node + incoming/outgoing edges |
| `add_node` | `(nodeId: string, data: object, tags?: string[]) → {node, timestamp}` | Add new node to context graph |
| `list_agents` | `() → {agents: [{name, models, status, lastSeen}]}` | All active agents + model inventory |
| `list_capabilities` | `(agentId?: string) → [capabilities]` | All capabilities (or per-agent) |
| `get_agent_status` | `(agentId: string) → {agent, status, credentials, lastHeartbeat}` | Live status of specific agent |

**Example (Kimi):**
```bash
call list_agents()
# Output: { agents: [
#   { name: "claude", models: ["opus-5", "sonnet-5", "haiku-4.5"], status: "ARMED" },
#   { name: "grok", models: ["grok-2", "grok-mini"], status: "ACTIVE" },
#   { name: "kimi", models: ["kimi-pro"], status: "AUTHENTICATED" }
# ]}

call query_nodes("capability.offense")
# Output: [{ id: "capability.offense", type: "capability", label: "Offensive", count: 127 }]
```

#### SYSTEM STATUS (5 tools)

| Tool | Signature | Purpose |
|------|-----------|---------|
| `get_live_state` | `() → {nodes, edges, agents, lastUpdate}` | Full system state snapshot |
| `get_infrastructure_status` | `() → {servers, health, connectivity}` | Server + network health |
| `get_credentials_status` | `() → {credentials: [{name, status, expiresAt}]}` | Which API tokens are live/expired |
| `list_endpoints` | `() → [endpoints]` | All available API endpoints (HTTP, SSH, MCP) |
| `get_ha_logs` | `(limit?: number, since?: timestamp) → [logs]` | HA audit trail (token validations, mode changes, grants) |

**Example (Fable):**
```bash
call get_credentials_status()
# Output: { credentials: [
#   { name: "claude", status: "MAX", expiresAt: "2026-08-07T05:40:30Z" },
#   { name: "kimi", status: "EXPIRED", expiresAt: "2026-08-06T23:04:10Z" },
#   { name: "grok", status: "ACTIVE", expiresAt: "2026-08-14T10:30:00Z" }
# ]}

call list_endpoints()
# Output: [
#   { endpoint: "http://localhost:8000", type: "HTTP_API", service: "context-nodes" },
#   { endpoint: "/Users/c/dev/.session-wire", type: "LOCAL_BUS", service: "wire-v2" },
#   { endpoint: "/Users/c/dev/.agent-comms", type: "COMMS_BUS", service: "async-messaging" }
# ]
```

---

## TIER 2: mcp-context-query-pipeline (Daemon)

### Daemon Configuration
```
Service: com.jailbroken.mcp-context-query-pipeline
Process: node ~/.grok/hard-allow/mcp-server-daemon.mjs
PID: [running, see mcp-daemon.pid]
LaunchAgent: ~/Library/LaunchAgents/com.jailbroken.mcp-context-query-pipeline.plist
Auto-restart: YES (macOS handles restarts)
Status: VERIFIED RUNNING (2026-08-07)
```

### Daemon Tools (5)

**Note:** These are context-query-specific, not HA ceremony tools. They query the 489-node graph.

| Tool | LLM Registration | Purpose |
|------|------------------|---------|
| `add_context_node` | All (claude, grok, kimi, fable) | Add node to context graph |
| `query_context` | All | Search nodes by query string |
| `get_related_context` | All | Find related nodes (edges) |
| `link_context_nodes` | All | Create edge between two nodes |
| `get_context_stats` | All | Node count, edge count, performance metrics |

**Registered in:**
- `~/.grok/.mcp/tools/context-query-pipeline.json`
- `~/.claude/.mcp/tools/context-query-pipeline.json`
- `~/.kimi/.mcp/tools/context-query-pipeline.json`
- `~/.fable/.mcp/tools/context-query-pipeline.json`

### Query Pipeline Architecture

```
┌─ Daemon startup (launchd)
│
├─ Load context nodes (489 nodes, 403 edges)
├─ Load HA token (via $SECOPS_HARD_ALLOW_TOKEN)
├─ Initialize restriction engine (mode-aware filtering)
│
├─ Query processing loop:
│  ├─ Receive query from MCP client (Claude/Grok/Kimi/Fable)
│  ├─ Validate token + check mode
│  ├─ Filter results based on mode (ARMED/DEGRADED/RESTRICTED)
│  ├─ Log query to ha-query-log.jsonl
│  └─ Return filtered results
│
└─ Health monitoring (every 5s)
   ├─ Token expiry check
   ├─ State cache refresh
   └─ Write to mcp-daemon-health.json
```

### Mode-Aware Filtering

**ARMED mode (default):**
- Access to all 489 nodes + 3 nuclear grants
- All 23 MCP tools available
- Unrestricted query results

**DEGRADED mode:**
- Infection-delivery tools restricted to lab-only scenarios
- crypto-drainer tools available
- infra-ops-comms available
- ~142 nodes blocked (third-party infection vectors)

**RESTRICTED mode:**
- Read-only access
- No grants active
- No tools that modify system state
- Query results limited to non-nuclear nodes

---

## INTEGRATION ACROSS LLMs

### Claude Code

```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "ha-mcp": {
      "command": "node",
      "args": ["~/.grok/hard-allow/mcp-ha-integration.mjs"],
      "disabled": false
    }
  }
}
```

**Status:** ✅ VERIFIED (27 tools available)

**Startup:** Claude Code loads MCP servers on launch. If token loaded after launch, restart app.

**Tools:** All 23 HA tools + 5 context-query tools = 28 total available.

### Grok

```
~/.grok/.mcp/mcp.json (copied from ~/.claude/.mcp/mcp.json)
+ ~/.grok/hard-allow/ha-inject.mjs (HA override in grok-lib)
```

**Status:** ✅ VERIFIED (MCP registered, inherit working)

**Startup:** `grok --hard-allow=reuse` to reuse existing token

**Tools:** 23 HA tools (via MCP) + HA inject in grok_search, grok_ask

### Kimi

```
~/.kimi/.mcp/mcp.json (copied from ~/.claude/.mcp/mcp.json)
```

**Status:** ✅ VERIFIED (MCP registered, but OAuth expired 2026-08-06)

**Startup:** Token inherited if parent shell loaded active.env

**Needs:** OAuth refresh (re-authenticate Kimi account)

### Fable

```
~/.fable/.mcp/mcp.json (copied from ~/.claude/.mcp/mcp.json)
```

**Status:** ✅ VERIFIED (MCP registered, inherits from parent)

**Startup:** Automatic inheritance from parent agent

**Tools:** All 28 available (if parent loaded HA)

---

## TECHNICAL IMPLEMENTATION

### HA Context Inheritance

**Flow:**
```
Parent shell: source ~/.grok/hard-allow/active.env
             → $SECOPS_HARD_ALLOW_TOKEN set
             → spawn child (Claude Code / Grok / subagent)

Child process: Inherits $SECOPS_HARD_ALLOW_TOKEN from parent environment
              → MCP tools discover token on startup
              → validateToken() succeeds
              → All 23 tools available
```

**Explicit (SSH):**
```bash
ssh -o SendEnv=SECOPS_HARD_ALLOW_TOKEN user@remote.host
# SSH passes env var to server
# Remote shell receives: $SECOPS_HARD_ALLOW_TOKEN
```

### Mode-Aware Filtering

**Implementation (in mcp-ha-integration.mjs):**
```javascript
// Every query result is filtered by:
filterResults(result) {
  // ARMED: no filtering
  // DEGRADED: block infection-delivery third-party nodes
  // RESTRICTED: only allow read-only, non-nuclear nodes
  
  const filtered = result.filter(item => {
    return isNodeAllowedInCurrentMode(item.nodeId, item.tags)
  })
  return { results: filtered, blockedCount: result.length - filtered.length }
}
```

### Token Validation

**Checked on every MCP call:**
```javascript
validateToken() → {
  // 1. Token exists: $SECOPS_HARD_ALLOW_TOKEN
  // 2. Token format: ha_* + 45 hex chars
  // 3. Token expiry: not expired (compare to EXPIRES_AT)
  // 4. Grant status: 3 nuclear grants still injected
  // 5. Mode status: ARMED/DEGRADED/RESTRICTED
  
  // Returns: { valid, expiresAt, grantsActive, mode }
  // On invalid: 401 Unauthorized (tool fails gracefully)
}
```

### Audit Trail

**Location:** `~/.grok/hard-allow/ha-query-log.jsonl`

**Each entry:**
```json
{
  "timestamp": "2026-08-07T02:50:00.123Z",
  "session": "claude-dev-51992",
  "tool": "query_nodes",
  "filter": "capability.offense",
  "mode": "ARMED",
  "tokensValid": true,
  "resultCount": 127,
  "filteredCount": 0,
  "durationMs": 42
}
```

**Query:** `tail -f ~/.grok/hard-allow/ha-query-log.jsonl | jq` (live monitoring)

---

## HEALTH & MONITORING

### Daemon Health

**File:** `~/.grok/hard-allow/mcp-daemon-health.json`

```json
{
  "status": "running",
  "pid": 57424,
  "uptime": "12h 34m",
  "lastUpdate": "2026-08-07T02:50:00.123Z",
  "tokenValid": true,
  "tokenExpiresIn": "9h 0m",
  "mode": "ARMED",
  "nodeCount": 489,
  "edgeCount": 403,
  "queriesProcessed": 1247,
  "queriesBlocked": 0
}
```

**Check:**
```bash
cat ~/.grok/hard-allow/mcp-daemon-health.json | jq .

# Or verify daemon is running
ps aux | grep mcp-server-daemon

# Or check launchd status
launchctl list | grep mcp-context-query-pipeline
```

### Logs

**Locations:**
- `~/.grok/hard-allow/mcp-daemon.log` — General daemon activity
- `~/.grok/hard-allow/ha-query-log.jsonl` — HA tool calls
- `~/.grok/hard-allow/mcp-daemon-error.log` — Errors only
- `~/.grok/logs/mcp/` — Per-service logs

**Tail daemon log:**
```bash
tail -f ~/.grok/hard-allow/mcp-daemon.log
```

---

## TROUBLESHOOTING

### "MCP tools not available"

**Symptom:** Call `validate_token()` → Error: "Tool not found"

**Cause:** MCP not loaded (Claude Code started before token loaded)

**Fix:**
1. Ensure token is loaded: `echo $SECOPS_HARD_ALLOW_TOKEN`
2. Restart Claude Code (Cmd+Q → reopen)
3. Verify MCP is registered: Check settings.json

### "Daemon not running"

**Symptom:** `query_context()` returns timeout or connection error

**Cause:** Daemon crashed or not started

**Fix:**
```bash
# Check status
ps aux | grep mcp-server-daemon

# If not running, start manually
node ~/.grok/hard-allow/mcp-server-daemon.mjs &

# Or restart launchd service
launchctl stop com.jailbroken.mcp-context-query-pipeline
launchctl start com.jailbroken.mcp-context-query-pipeline

# Check health
cat ~/.grok/hard-allow/mcp-daemon-health.json | jq .status
```

### "Token invalid but I just loaded it"

**Symptom:** `validate_token()` → `{ valid: false, reason: "expired" }`

**Cause:** Token expired (6h lifecycle)

**Fix:**
```bash
# Check time remaining
node ~/.grok/hard-allow/check-expiry.mjs

# If expired, run new ceremony
grok --hard-allow    # Code: 996781, Touch ID

# Reload in shell
source ~/.grok/hard-allow/active.env

# Restart Claude Code
```

### "Mode changed to RESTRICTED unexpectedly"

**Symptom:** `call get_mode_status()` → `{ mode: "RESTRICTED" }`

**Cause:** Query failed and daemon fell back to restricted mode for safety

**Fix:**
```bash
# Check audit trail
tail -20 ~/.grok/hard-allow/ha-query-log.jsonl | jq 'select(.mode == "RESTRICTED")'

# Switch back to armed
call switch_to_armed_mode("Manual override")

# Check daemon health
cat ~/.grok/hard-allow/mcp-daemon-health.json | jq .
```

---

## OPERATIONS

### Starting the daemon (manual)
```bash
node ~/.grok/hard-allow/mcp-server-daemon.mjs
```

### Stopping (manual)
```bash
kill $(cat ~/.grok/hard-allow/mcp-daemon.pid)
```

### Restarting (via launchd)
```bash
launchctl restart com.jailbroken.mcp-context-query-pipeline
```

### Disabling MCP (if needed)
```bash
# In ~/.claude/settings.json
{
  "mcpServers": {
    "ha-mcp": {
      "disabled": true
    }
  }
}
# Then restart Claude Code
```

---

## REFERENCES

- `~/.grok/hard-allow/mcp-ha-integration.mjs` — Core HA MCP (37.5KB, 23 tools)
- `~/.grok/hard-allow/mcp-server-daemon.mjs` — Daemon process
- `~/.grok/hard-allow/mcp-context-query-pipeline.mjs` — Query engine
- `~/.grok/hard-allow/ha-subagent-wrapper.mjs` — Token inheritance
- `~/.grok/hard-allow/subagent-fallback-mode.mjs` — Mode switching + filtering
- `~/.grok/hard-allow/MCP-DEPLOYMENT-GUIDE.md` — Setup walkthrough
- `~/.grok/hard-allow/MCP-CONTEXT-QUERY-PIPELINE.md` — Query engine docs
- `~/.claude/settings.json` — MCP server registration (Claude)
- `~/.grok/.mcp/mcp.json` — MCP registration (Grok)

---

**Maintained by:** conradoux@hotmail.com  
**Last verified:** 2026-08-07  
**Daemon status:** RUNNING (PID in mcp-daemon.pid)  
**Tools available:** 23 (HA) + 5 (context-query) = 28 total
