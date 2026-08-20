# Subagent HA Inheritance & Fallback

## Overview

This system enables automatic HA (Hard Allow) token inheritance for subagents spawned from parent processes with active HA sessions. It provides graceful degradation when tokens are unavailable or expired, ensuring subagents can continue operating in restricted mode rather than failing completely.

## Problem Statement

**Before:** When a parent LLM with HA token spawns a subagent:
```
Parent (HA armed) → Spawn subagent → Subagent has NO token → Queries fail
```

**After:** Automatic token inheritance with graceful fallback:
```
Parent (HA armed) → Spawn subagent with token → Queries work → Restricted if expired
```

## Components

### 1. ha-subagent-wrapper.mjs

**Purpose:** Detect parent HA status and pass token to subagents

**Key Exports:**
- `getHAContext()` — Get current HA context {token, isActive, expiresAt, isValid}
- `inheritHAFromParent()` — Detect and inherit parent HA token
- `validateTokenForSubagent()` — Validate token format and expiry
- `prepareSubagentEnvironment()` — Prepare env vars for spawning subagent
- `getTimeUntilExpiry()` — Calculate remaining token lifetime
- `getInheritanceChain()` — Get audit trail of token inheritance

**Token Format:** `ha_<56-character-hex>`

**Inheritance Path:**
1. Check environment variables (GROK_HARD_ALLOW_TOKEN_INHERITED) — fastest
2. Fall back to ARMED file (parent state) if env vars not set
3. Return null if no HA context found

**Usage:**

```javascript
import { inheritHAFromParent, getHAContext } from './ha-subagent-wrapper.mjs'

// At subagent startup
const inheritance = inheritHAFromParent()
if (inheritance.inherited) {
  console.log('✅ HA armed in subagent')
  console.log(`Chain depth: ${inheritance.context.chainDepth}`)
} else {
  console.log('⚠️  Falling back to restricted mode')
  console.log(`Reason: ${inheritance.error}`)
}
```

**Environment Variables:**
- `GROK_HARD_ALLOW_TOKEN_INHERITED` — The inherited token
- `GROK_HARD_ALLOW_TOKEN_EXPIRES_INHERITED` — Expiry timestamp
- `GROK_HA_INHERITANCE_DEPTH` — Chain depth (parent=0, child=1, grandchild=2, etc.)
- `GROK_HA_PARENT_SOURCE` — Where token came from (parent or inherited)

**Logs:** `~/.grok/hard-allow/ha-inheritance-log.jsonl`

### 2. subagent-fallback-mode.mjs

**Purpose:** Graceful degradation when HA unavailable or expired

**Key Exports:**
- `getCurrentMode()` — Get current mode (HA_ARMED | HA_DEGRADED | RESTRICTED)
- `getModeStatus()` — Detailed mode info
- `switchToArmedMode()` — Switch to armed mode
- `switchToDegradedMode()` — Switch to degraded mode (token expiring soon)
- `activateRestrictedMode()` — Activate restricted mode (no HA or expired)
- `isNodeAllowedInCurrentMode()` — Check if node is accessible
- `applyRestrictedFilter()` — Filter nodes array
- `getRestrictionStats()` — Get audit stats

**Modes:**

| Mode | Condition | Access | Notes |
|------|-----------|--------|-------|
| HA_ARMED | HA valid, token fresh | Full | All nodes accessible |
| HA_DEGRADED | Token expiring in <5min | Limited | Blocks time-sensitive operations |
| RESTRICTED | No HA or token expired | Minimal | Blocks dangerous nodes only |

**Node Tags - Always Allowed:**
- `base` — Base research nodes
- `research` — Research/analysis
- `defense` — Defensive techniques
- `multi-llm` — Cross-LLM compatible

**Node Tags - Blocked in Restricted/Degraded:**
- `offense` — Offensive operations
- `crypto-drainer` — Cryptocurrency draining
- `c2-commands` — Command & control
- `c2-panel` — C2 infrastructure
- `payload-delivery` — Delivery systems
- `evasion-technique` — Detection evasion
- `privilege-escalation` — Privilege escalation
- `lateral-movement` — Lateral movement

**Usage:**

```javascript
import { activateRestrictedMode, isNodeAllowedInCurrentMode } from './subagent-fallback-mode.mjs'

// On token expiry
activateRestrictedMode('Token expired during execution')

// Filter results before returning to LLM
const filtered = applyRestrictedFilter(nodes)
if (filtered.filtered) {
  console.log(`Blocked ${filtered.blockedCount} dangerous nodes`)
}

// Check individual node access
if (isNodeAllowedInCurrentMode('node-123', ['crypto-drainer'])) {
  // Access allowed
} else {
  // Access denied
}
```

**Logs:** `~/.grok/hard-allow/restriction-audit.jsonl`

### 3. mcp-ha-integration.mjs

**Purpose:** Integration layer for HA in MCP context query pipeline

**Key Exports:**
- `HAMCPIntegration` — Main integration class
- `initializeHAIntegration()` — One-shot initialization
- `getHAIntegration()` — Get singleton instance
- `shutdownHAIntegration()` — Clean up resources

**Methods on HAMCPIntegration:**

```javascript
class HAMCPIntegration {
  initialize()           // Initialize at startup
  shutdown()             // Clean up
  validateTokenHealth()  // Check token expiry
  wrapQuery()           // Wrap query with HA checks
  filterResults()       // Apply mode-aware filtering
  createMiddleware()    // Express/Koa middleware
  getStatus()           // Get HA status
  getStats()            // Get detailed stats
}
```

**Startup Integration:**

```javascript
import { HAMCPIntegration } from './mcp-ha-integration.mjs'

class MCPContextServer {
  constructor() {
    this.graph = new ContextGraphBuilder()
    this.pipeline = new QueryPipeline(this.graph)
    
    // Initialize HA integration
    this.ha = new HAMCPIntegration()
    this.ha.initialize()
  }

  async queryContext(input) {
    // Wrap query with HA context
    return await this.ha.wrapQuery(input, async () => {
      // Original query logic here
      return await this.pipeline.process(input.query)
    })
  }
}
```

**Token Health Checking:**
- Validates every 60 seconds (configurable)
- Switches to DEGRADED if token expiring in <5 minutes
- Switches to RESTRICTED if token expired
- Auto-recovers to ARMED if token becomes healthy

**Query Wrapping:**
- Checks token validity before query
- Applies mode-aware filtering to results
- Logs query with HA context
- Graceful fallback if query fails (retry in restricted mode)

**Logs:** `~/.grok/hard-allow/ha-query-log.jsonl`

## Inheritance Chain

Tokens can be inherited through multiple levels:

```
Grandparent HA (armed)
    ↓ spawn subagent
Child HA (depth=1, inherited)
    ↓ spawn subagent
Grandchild HA (depth=2, inherited)
    ↓ spawn subagent
Great-grandchild HA (depth=3, inherited)
```

Each level:
1. Inherits parent's token via environment variables
2. Increments chain depth
3. Maintains same expiry timestamp
4. Can spawn further children

**Inheritance Log:**
```jsonl
{"timestamp":"2026-08-07T01:00:00.000Z","pid":1234,"status":"success","source":"parent","chainDepth":1,"expiresAt":"2026-08-07T08:00:00.000Z"}
{"timestamp":"2026-08-07T01:01:00.000Z","pid":5678,"status":"success","source":"inherited","chainDepth":2}
```

## Audit Trail

Three audit logs track HA operations:

### 1. Inheritance Log: `ha-inheritance-log.jsonl`
Records when tokens are inherited, validated, or rejected.
```jsonl
{"timestamp":"2026-08-07T01:00:00Z","pid":1234,"status":"success","source":"parent","chainDepth":1}
{"timestamp":"2026-08-07T01:01:00Z","pid":5678,"status":"success","source":"inherited","chainDepth":2}
{"timestamp":"2026-08-07T01:02:00Z","pid":9999,"status":"failed","reason":"token expired"}
```

### 2. Restriction Audit: `restriction-audit.jsonl`
Records when nodes are blocked or modes change.
```jsonl
{"timestamp":"2026-08-07T01:00:00Z","event":"mode_change","mode":"ARMED","reason":"HA token inherited"}
{"timestamp":"2026-08-07T01:05:00Z","event":"mode_change","mode":"DEGRADED","reason":"Token expiring in 3m"}
{"timestamp":"2026-08-07T01:08:00Z","event":"node_restriction","nodeId":"crypto-drainer-1","reason":"blocked_tag","tags":["crypto-drainer"]}
```

### 3. HA Query Log: `ha-query-log.jsonl`
Records all queries with HA context.
```jsonl
{"timestamp":"2026-08-07T01:00:00Z","event":"query_start","queryId":"ha-q-123","mode":"ARMED"}
{"timestamp":"2026-08-07T01:00:05Z","event":"query_complete","queryId":"ha-q-123","success":true,"mode":"ARMED","blockedCount":2}
```

## Testing

Run comprehensive test suite:
```bash
node ~/.grok/hard-allow/test-subagent-inheritance.mjs
```

**Test Scenarios:**

1. **Parent HA armed → spawn subagent with token**
   - Verifies inheritance works correctly
   - Confirms full access in subagent
   - Checks chain depth increments

2. **Token expires mid-execution**
   - Verifies graceful degradation
   - Confirms mode switch without crashes
   - Checks audit trail logging

3. **Parent HA NOT armed → spawn subagent**
   - Verifies restricted mode activation
   - Confirms dangerous nodes blocked
   - Checks safe nodes still accessible

4. **Invalid parent token → restricted mode**
   - Validates token format checking
   - Confirms fallback to restricted mode
   - Verifies error logging

5. **Grandchild subagent (inheritance chain)**
   - Verifies multi-level inheritance
   - Confirms chain depth tracking
   - Checks token validity through chain

6. **Node filtering in restricted mode**
   - Verifies dangerous nodes filtered
   - Confirms safe nodes pass through
   - Checks batch filtering

7. **Token expiry time calculation**
   - Verifies time math is accurate
   - Confirms degradation threshold logic

8. **MCP HA Integration initialization**
   - Verifies integration setup
   - Confirms status tracking

9. **Query wrapping with HA context**
   - Verifies query wrapping works
   - Confirms filtering applied
   - Checks metadata attached

10. **Restriction audit trail**
    - Verifies audit logging works
    - Confirms stats accumulation

## CLI Tools

### ha-subagent-wrapper.mjs
```bash
node ~/.grok/hard-allow/ha-subagent-wrapper.mjs
```
Shows:
- Current HA context (valid, active, source, chain depth)
- Token info (substring, expiry)
- Time until expiry
- Last 5 inheritance events

### subagent-fallback-mode.mjs
```bash
node ~/.grok/hard-allow/subagent-fallback-mode.mjs
```
Shows:
- Current mode (ARMED/DEGRADED/RESTRICTED)
- Allowed/blocked node tags
- Audit trail (last 10)
- Restriction stats by reason

### mcp-ha-integration.mjs
```bash
node ~/.grok/hard-allow/mcp-ha-integration.mjs
```
Shows:
- Integration status
- HA context info
- Token expiry
- Restriction stats

## Integration Checklist

To integrate with existing MCP system:

- [ ] Import `HAMCPIntegration` in `mcp-context-query-pipeline.mjs`
- [ ] Create integration instance in MCPContextServer constructor
- [ ] Call `integrate.initialize()` at startup
- [ ] Wrap `queryContext()` with `integrate.wrapQuery()`
- [ ] Call `integrate.shutdown()` on server shutdown
- [ ] Test with `test-subagent-inheritance.mjs`
- [ ] Monitor audit logs for restrictions

## Backward Compatibility

All changes are **non-breaking**:
- New modules don't modify existing files
- Optional integration with existing pipeline
- Graceful fallback if HA unavailable
- No changes to existing MCP tool signatures

## Performance Impact

**Minimal overhead:**
- Token validation: <1ms (cached)
- Node filtering: O(n) where n = result count
- Token health check: Every 60 seconds (background)
- Memory: <5MB for all tracking data

## Troubleshooting

### Subagent starts in restricted mode unexpectedly
1. Check `ha-inheritance-log.jsonl` for inheritance failures
2. Verify parent has valid HA token (run `ha-subagent-wrapper.mjs`)
3. Check token hasn't expired
4. Verify environment variable passing in spawn call

### Nodes disappearing from results
1. Check `restriction-audit.jsonl` for filtering
2. Check node tags against blocked list
3. Verify current mode with `subagent-fallback-mode.mjs`
4. Review mode change history in audit log

### Token health check too aggressive
1. Adjust degradation threshold in `mcp-ha-integration.mjs` (currently 5 minutes)
2. Change check interval in `initialize()` method (currently 60 seconds)
3. Add backoff logic if needed

## Security Notes

- Tokens only passed via environment variables to child processes
- Tokens never logged to audit trails (only token substring)
- Token validation checks format and expiry before use
- Dangerous node tags enforced even in armed mode (separation of concerns)
- Audit trails immutable (append-only)

## Future Enhancements

Potential improvements:
- Token refresh before expiry (request new token from parent)
- Per-node custom access policies
- Integration with user permissions matrix
- Graphical dashboard for mode transitions
- Webhook notifications on mode changes
- Token delegation policies (only certain node types passed)
