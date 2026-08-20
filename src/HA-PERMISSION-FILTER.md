# HA Permission Filter Integration Guide

Multi-LLM context gating for query pipeline with HA token validation and compliance audit.

## Overview

The HA Permission Filter system enforces access control over query results based on:

1. **Caller Identity** (claude, grok, kimi, fable)
2. **HA Token Status** (armed/disarmed, nuclear grants)
3. **Context Gate Tags** (research, defense, offense, infra, crypto, etc.)
4. **Operator Order** (temporary access grants)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│           Query Request                             │
├─────────────────────────────────────────────────────┤
│  ↓ HTTP API / MCP Tool / WebSocket                 │
│  ┌─────────────────────────────────────────────┐   │
│  │ 1. HA Token Validation (ha-status-check.mjs)   │
│  │    - Check ARMED file                       │   │
│  │    - Verify token expiry                    │   │
│  │    - Determine nuclear grants               │   │
│  └─────────────────────────────────────────────┘   │
│  ↓                                                   │
│  ┌─────────────────────────────────────────────┐   │
│  │ 2. Caller Identification (ha-permission-filter) │
│  │    - User-Agent / API key / env detection   │   │
│  │    - Multi-LLM routing                      │   │
│  └─────────────────────────────────────────────┘   │
│  ↓                                                   │
│  ┌─────────────────────────────────────────────┐   │
│  │ 3. Permission Resolution (permission-matrix)    │
│  │    - Map LLM → allowed tags                 │   │
│  │    - Check nuclear restrictions             │   │
│  └─────────────────────────────────────────────┘   │
│  ↓                                                   │
│  ┌─────────────────────────────────────────────┐   │
│  │ 4. Query Execution & Filtering              │   │
│  │    - Execute base query                     │   │
│  │    - Filter nodes by tag visibility         │   │
│  │    - Filter edges (visible nodes only)      │   │
│  └─────────────────────────────────────────────┘   │
│  ↓                                                   │
│  ┌─────────────────────────────────────────────┐   │
│  │ 5. Audit Logging (permission-audit.mjs)        │
│  │    - Log grants & denials                   │   │
│  │    - Track compliance events                │   │
│  │    - Write permission-audit.jsonl           │   │
│  └─────────────────────────────────────────────┘   │
│  ↓                                                   │
│  Filtered Results → Client                         │
└─────────────────────────────────────────────────────┘
```

## Key Components

### 1. ha-permission-filter.mjs (~300 lines)

Core permission filter with caching (<5ms per query).

```javascript
import HAPermissionFilter from './ha-permission-filter.mjs';

const filter = new HAPermissionFilter();

// Check token validity
const { valid, isArmed } = filter.validateHAToken();

// Determine caller
const { caller } = filter.determineCaller({ model: 'claude-opus-5' });

// Get allowed tags
const tags = filter.getAllowedTags(caller, isArmed);

// Check node visibility
const visible = filter.isNodeVisible(node, caller, { armed: isArmed, nuclear: true });

// Filter query results
const filtered = await filter.filterQueryResults(results, { model: caller });
```

**Methods:**
- `validateHAToken()` - Validate & cache HA token (5s TTL, <5ms)
- `determineCaller(requestContext)` - Detect LLM identity (30s cache)
- `getAllowedTags(caller, isHAArmed)` - Get permission tags
- `isNodeVisible(node, caller, isHAArmed)` - Single node check
- `filterQueryResults(results, requestContext)` - Batch filter
- `getPermissionReport(caller, isHAArmed)` - Detailed permissions
- `checkHAExpiry(gracePeriodMs)` - Token expiry warning

### 2. ha-status-check.mjs (~100 lines)

HA token validation and status checks.

```javascript
import { checkHA, getHAStatus, checkHAExpiry } from './ha-status-check.mjs';

// Quick check
const { armed, nuclear, tokenValid } = checkHA();

// Full status report
const status = getHAStatus();
console.log(status.multiLLM); // { claude: 'full_access', grok: 'nuclear', ... }

// Expiry check
const { expiring, timeRemaining } = checkHAExpiry(30 * 60 * 1000); // 30 min grace
```

**Reads from:**
- `~/.grok/hard-allow/ARMED` (primary)
- `~/.hat2/ARMED` (fallback)
- `GROK_HARD_ALLOW_ACTIVE=1` env var

### 3. permission-matrix.mjs (~150 lines)

Multi-LLM permission matrix with gate metadata.

```javascript
import {
  PERMISSION_MATRIX,
  resolvePermissions,
  isNodeVisible,
  getVisibilityReport,
  auditNodeVisibility,
} from './permission-matrix.mjs';

// Get effective permissions
const perms = resolvePermissions('grok', { armed: true, nuclear: true });
// → { effective: ['research', 'defense', 'base', 'offense', 'infra', 'crypto'] }

// Check visibility with metadata
const visible = isNodeVisible(node, 'claude', { armed: false });

// Audit why node is hidden
const audit = auditNodeVisibility(node, 'kimi', { armed: true });
// → { visible: false, reasons: [{ tag: 'offense', reason: 'insufficient_permissions' }] }
```

**Permission Matrix:**

| LLM | Default | With HA | Nuclear | Restrictions |
|-----|---------|---------|---------|--------------|
| claude | research, defense, base | + offense, infra | no | no drainer-active, c2-commands |
| grok | research, defense, base | + offense, infra, crypto | yes | none |
| kimi | research | + crypto | no | no offense, infra, c2-commands |
| fable | research, defense, base | (parent) | no | no offense, crypto, infra |

**Gate Tags:**

- `research` - Public research, papers
- `defense` - Security hardening
- `base` - Base system knowledge
- `offense` - Exploits, infection vectors (requires HA)
- `infra` - C2 infrastructure, deployment (requires HA)
- `crypto` - Cryptocurrency markets, trading
- `drainer-active` - Live drainer operations
- `c2-commands` - C2 agent commands

### 4. query-engine-integration.mjs (~200 lines)

Integration points for Express, MCP, WebSocket.

```javascript
import {
  createQueryAuthMiddleware,
  createQueryHandler,
  QueryStreamHandler,
  PermissionAwareQueryEngine,
} from './query-engine-integration.mjs';

// Express middleware
app.use(createQueryAuthMiddleware(apiKeys));

// Express handler
app.get('/api/query/:id', createQueryHandler(queryEngine, apiKeys));

// WebSocket handler
const wsHandler = new QueryStreamHandler(queryEngine, apiKeys);
ws.on('connection', (socket) => wsHandler.handleStream(socket, req));

// Wrapped query engine (auto-filters all results)
const engine = new PermissionAwareQueryEngine(baseQueryEngine);
const results = await engine.query(params);
```

### 5. permission-audit.mjs (~100 lines)

Write-once audit trail for compliance.

```javascript
import { getAuditTrail, logDenial, logGrant, getComplianceReport } from './permission-audit.mjs';

// Log permission denial
logDenial('claude', 'offense.c2-setup', 'C2 Setup', ['offense'], 'insufficient_permissions');

// Log grant
logGrant('grok', 'offense.c2-setup', 'C2 Setup', ['offense']);

// Compliance report
const report = getComplianceReport();
// → { totalDenials, deniedNodes: { ... }, byReason: { ... } }
```

**Output:** `~/.grok/hard-allow/permission-audit.jsonl` (append-only)

## Integration Patterns

### Pattern 1: HTTP API with Express

```javascript
import express from 'express';
import { createQueryAuthMiddleware, createQueryHandler } from './query-engine-integration.mjs';

const app = express();
const queryEngine = { async query() { /* ... */ } };
const apiKeys = {
  'sk_claude_123': 'claude',
  'sk_grok_456': 'grok',
};

// Add auth middleware
app.use(createQueryAuthMiddleware(apiKeys));

// Add query route
app.get('/api/query/:id', createQueryHandler(queryEngine, apiKeys));

// Your handler can access: req.haContext = { caller, hasHA, allowedTags }

app.listen(3000);
```

### Pattern 2: MCP Tool Wrapper

```javascript
import HAPermissionFilter from './ha-permission-filter.mjs';

class QueryMCPTool {
  async query(params) {
    const filter = new HAPermissionFilter();
    const { valid, isArmed } = filter.validateHAToken();
    const { caller } = filter.determineCaller();

    const results = await executeQuery(params);
    return filter.filterQueryResults(results, { model: caller });
  }
}
```

### Pattern 3: Query Engine Wrapper

```javascript
import { PermissionAwareQueryEngine } from './query-engine-integration.mjs';

const baseEngine = { async query() { /* ... */ } };
const engine = new PermissionAwareQueryEngine(baseEngine);

// All results automatically filtered by caller permissions
const results = await engine.query(params);
```

### Pattern 4: WebSocket Streaming

```javascript
import { QueryStreamHandler } from './query-engine-integration.mjs';

const handler = new QueryStreamHandler(queryEngine, apiKeys);

wss.on('connection', async (ws, req) => {
  await handler.handleStream(ws, req);
});

// Client sends: { queryId: '1', requiredGates: ['offense'] }
// Server validates gates and streams filtered results
```

## Node Format

Query results should include `context_gate_tags`:

```javascript
{
  id: "offense.c2-panel-setup",
  _label: "C2 Panel Setup Guide",
  context_gate_tags: ["offense", "infra"],  // ← required
  context_gates: ["offense", "infra"],      // ← or this
  data: { /* ... */ }
}
```

If no tags, node is visible to all callers.

## Permission Check Performance

- **Token validation:** <5ms (cached 5s)
- **Caller detection:** <1ms (cached 30s)
- **Node visibility check:** <1ms
- **Batch filter (100 nodes):** <10ms

## Environment Variables

- `GROK_HARD_ALLOW_ACTIVE=1` - Enable HA mode
- `GROK_HARD_ALLOW_TOKEN=ha_…` - HA token (fallback)
- `SECOPS_HARD_ALLOW_TOKEN=ha_…` - Ops token

## Audit Trail

Written to: `~/.grok/hard-allow/permission-audit.jsonl`

```json
{
  "@timestamp": "2026-08-06T12:34:56Z",
  "type": "denial",
  "caller": "claude",
  "node": "offense.c2-setup",
  "nodeLabel": "C2 Setup Guide",
  "tags": ["offense", "infra"],
  "reason": "insufficient_permissions",
  "hasHA": false
}
```

**Query audit:**

```bash
node permission-audit.mjs show --type denial --limit 20
node permission-audit.mjs show --summary
node permission-audit.mjs show --compliance
```

## Testing

```bash
# Test permission filter
node ha-permission-filter.mjs

# Test status check
node ha-status-check.mjs --detailed

# Test permission matrix
node query-integration-example.mjs matrix

# Run all examples
node query-integration-example.mjs

# Check audit trail
node permission-audit.mjs show --compliance
```

## Fail-Closed Guarantees

1. **Invalid token** → no access to restricted nodes
2. **Unknown caller** → default to claude (minimal perms)
3. **Missing gate tags** → visible to all (research nodes)
4. **Expired token** → revert to standard perms
5. **Missing ARMED file** → token considered invalid

## Multi-LLM Context Awareness

Each LLM has different permissions:

- **Claude** - Research/defense focus, office by operator order
- **Grok** - All access when HA armed
- **Kimi** - Research/crypto only
- **Fable** - Inherits from parent LLM

Detected via:
- API key prefix
- User-Agent header
- `model` parameter
- Environment variables

## Operator Order Flow

1. Operator signs ceremony: `~/.grok/hard-allow/arm.mjs`
2. HA token injected into `GROK_HARD_ALLOW_TOKEN` env
3. `ARMED` file updated with expiry + nuclear grants
4. Operator order stored in context-nodes (optional)
5. Filter unlocks offense/infra/drainer context for authorized caller

## Troubleshooting

**Q: Nodes visible when they shouldn't be?**
A: Check `context_gate_tags` is present and matches gate definitions.

**Q: HA token not recognized?**
A: Verify `~/.grok/hard-allow/ARMED` exists and is valid JSON.

**Q: Audit log not writing?**
A: Ensure `~/.grok/hard-allow/` directory is writable.

**Q: Permission checks too slow?**
A: Check cache TTL is appropriate (default 5s for token, 30s for caller).

## See Also

- `ha-permission-filter.mjs` - Core filter logic
- `query-engine-integration.mjs` - Integration patterns
- `permission-matrix.mjs` - Permission definitions
- `ha-status-check.mjs` - HA token validation
- `permission-audit.mjs` - Compliance logging
- `query-integration-example.mjs` - Usage examples
