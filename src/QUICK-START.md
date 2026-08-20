# Quick Start: HA Permission Filter

## 30-Second Setup

1. **Import the filter:**
   ```javascript
   import HAPermissionFilter from './ha-permission-filter.mjs';
   ```

2. **Create instance:**
   ```javascript
   const filter = new HAPermissionFilter();
   ```

3. **Filter results:**
   ```javascript
   const filtered = await filter.filterQueryResults(queryResults, {
     model: 'claude-opus-5'
   });
   ```

That's it! The filter automatically:
- Validates HA token
- Detects caller identity
- Filters nodes by context_gate_tags
- Logs permission decisions

## Common Use Cases

### Check if user can see a node

```javascript
const visible = filter.isNodeVisible(node, 'claude', { armed: true });
```

### Get permission report

```javascript
const report = filter.getPermissionReport('grok', true);
// → { canSeeOffense: true, canSeeInfra: true, ... }
```

### Check HA token expiry

```javascript
const { expiring, timeRemaining } = filter.checkHAExpiry();
// → { expiring: false, timeRemaining: 14400000 }
```

### Validate token at request time

```javascript
const { valid, isArmed } = filter.validateHAToken();
if (!valid) return res.status(403).json({ error: 'unauthorized' });
```

### Log permission denial

```javascript
filter.logPermissionDenial(node, 'claude', false);
// Appends to ~/.grok/hard-allow/permission-audit.jsonl
```

## Express Middleware

```javascript
import { createQueryAuthMiddleware } from './query-engine-integration.mjs';

app.use(createQueryAuthMiddleware({
  'api_key_1': 'claude',
  'api_key_2': 'grok',
}));

// Now req.haContext contains: { caller, hasHA, allowedTags, warnings }
app.get('/api/query', (req, res) => {
  console.log(req.haContext.caller); // 'claude' or 'grok'
});
```

## Permission Matrix

**Without HA:**
- claude: research, defense, base
- grok: research, defense, base
- kimi: research
- fable: research, defense, base

**With HA + nuclear:**
- claude: + offense, infra
- grok: + offense, infra, crypto (all access)
- kimi: + crypto
- fable: (parent LLM perms)

## Node Format

Tag your nodes with context_gate_tags:

```javascript
{
  id: "offense.exploit-kit",
  _label: "Exploit Kit Tutorial",
  context_gate_tags: ["offense", "infra"],  // Filter checks this
  data: { ... }
}
```

## Environment Setup

1. **Ensure HA is armed:**
   ```bash
   node ~/.grok/hard-allow/arm.mjs
   ```

2. **Verify token:**
   ```bash
   node ha-status-check.mjs --detailed
   ```

3. **Check audit trail:**
   ```bash
   node permission-audit.mjs show --compliance
   ```

## Testing

```bash
# Run examples
node query-integration-example.mjs direct

# Test permission matrix
node query-integration-example.mjs matrix

# Check audit log
node permission-audit.mjs show --type denial --limit 10
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Nodes not filtered | Add `context_gate_tags` to node |
| HA token not recognized | Run `node arm.mjs` to re-arm |
| Audit log missing | Ensure `~/.grok/hard-allow/` is writable |
| Slow permission checks | Token/caller caching is active (5s/30s TTL) |

## API Reference

### HAPermissionFilter

```javascript
class HAPermissionFilter {
  validateHAToken()                              // { valid, token, expiresAt, isArmed }
  determineCaller(requestContext)                // { caller, confidence }
  getAllowedTags(caller, isHAArmed)             // string[]
  isNodeVisible(node, caller, isHAArmed)        // boolean
  filterQueryResults(results, requestContext)    // filtered results
  getPermissionReport(caller, isHAArmed)        // detailed permissions
  checkHAExpiry(gracePeriodMs)                  // { expiring, timeRemaining }
  logPermissionDenial(node, caller, hasHA)      // write audit
}
```

### permission-matrix.mjs

```javascript
resolvePermissions(caller, haStatus)     // { effective: string[] }
isNodeVisible(node, caller, haStatus)    // boolean
getVisibilityReport(caller, haStatus)    // per-gate visibility
auditNodeVisibility(node, caller, haStatus) // why hidden?
```

### ha-status-check.mjs

```javascript
checkHA()                                // { armed, nuclear, tokenValid }
getHAStatus()                            // detailed report
checkHAExpiry(gracePeriodMs)            // { expiring, timeRemaining }
isCeremonyVerified()                    // boolean
hasNuclearGrant(grantName)              // boolean
```

### permission-audit.mjs

```javascript
logDenial(caller, nodeId, nodeLabel, tags, reason)
logGrant(caller, nodeId, nodeLabel, tags)
getComplianceReport()                    // { totalDenials, deniedNodes, ... }
exportAuditLog(filter)                   // [entries]
```

## Examples

**Example 1: REST API**
```javascript
import { createQueryHandler } from './query-engine-integration.mjs';

app.get('/api/query/:id', createQueryHandler(queryEngine, apiKeys));
```

**Example 2: MCP Tool**
```javascript
const filter = new HAPermissionFilter();
const results = await executeQuery();
return filter.filterQueryResults(results, { model: caller });
```

**Example 3: Direct Check**
```javascript
if (filter.isNodeVisible(node, 'claude', { armed: false })) {
  // User can see this node
}
```

## Performance

- **Token check:** <5ms (cached)
- **Caller detection:** <1ms (cached)
- **Node filter (100 nodes):** <10ms total

Perfect for <100ms latency requirements.

## Next Steps

1. Add `context_gate_tags` to your query nodes
2. Wrap your query engine with `PermissionAwareQueryEngine`
3. Or use middleware in Express: `app.use(createQueryAuthMiddleware(apiKeys))`
4. Monitor audit trail: `node permission-audit.mjs show --compliance`
