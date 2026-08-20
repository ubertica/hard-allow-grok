# Kimi-Claude Integration Guide

## Quick Start

### 1. Verify Setup
```bash
# Check context nodes are hydrated
ls -lh ~/.grok/context-nodes/
# Expected: state.json (58KB), graph.jsonl (8KB), .hydrated marker

# Check wiring script exists
ls -lh ~/.grok/hard-allow/kimi-wire-claude.mjs
```

### 2. Test Discovery
```bash
# Discover Claude from Kimi
node ~/.grok/hard-allow/kimi-wire-claude.mjs discover agents.kimi

# Expected: Claude node found at distance 3 with activation ~0.08
```

### 3. Create First Session
```bash
# Wire Kimi to Claude for a specific task
node ~/.grok/hard-allow/kimi-wire-claude.mjs connect "help debug auth flow"

# Save the session ID for later use
export SESSION=$(node ~/.grok/hard-allow/kimi-wire-claude.mjs connect "test query" | grep "Export" | cut -d'"' -f2)
```

---

## Integration Patterns

### Pattern 1: Kimi Queries Claude Directly

```javascript
// In Kimi CLI startup
import { ContextDiscovery, SessionWiring } from '~/.grok/hard-allow/kimi-wire-claude.mjs'

// 1. Discover Claude capabilities
const discovery = new ContextDiscovery()
await discovery.load()
const claudeContext = discovery.discoverClaudeContext('agents.kimi')

// 2. If Claude context is relevant, create session
if (claudeContext.length > 0) {
  const wiring = new SessionWiring()
  const session = wiring.createSession(userQuery, claudeContext)
  console.log(`Connected to Claude via session: ${session.sessionId}`)
  
  // 3. Use Claude context in your response
  const topContext = claudeContext[0]
  console.log(`Using Claude context: ${topContext.label}`)
}
```

### Pattern 2: Intelligent Task Routing

```javascript
// Route query to best LLM before executing
import { TaskRouter, ContextDiscovery } from '~/.grok/hard-allow/kimi-wire-claude.mjs'

const discovery = new ContextDiscovery()
await discovery.load()

const router = new TaskRouter(discovery)
const routing = router.route(userQuery)

if (routing.recommendedLLM === 'claude' && parseFloat(routing.score) > 0.8) {
  // High confidence in Claude → use it
  return await queryClaude(userQuery, routing)
} else if (routing.recommendedLLM === 'kimi') {
  // Kimi is best → use built-in capabilities
  return await queryKimi(userQuery)
} else {
  // Grok or uncertain → fall back to default
  return await queryDefault(userQuery)
}
```

### Pattern 3: Bidirectional Learning

```javascript
// After getting response from Claude
import { ContextSyncBridge } from '~/.grok/hard-allow/kimi-wire-claude.mjs'

// Was the response helpful?
if (userFeedback === 'thumbs-up') {
  // Sync and boost weights for this context
  ContextSyncBridge.sync(sessionId, {
    kimiUpdate: { type: 'feedback', value: 'helpful' },
    feedback: 'helpful'  // Triggers Hebbian boost
  })
  
  // Next time Kimi queries similar task → Claude weights higher
}
```

### Pattern 4: Multi-Hop Orchestration

```javascript
// Grok queries Kimi which queries Claude
import { ContextDiscovery, TaskRouter } from '~/.grok/hard-allow/kimi-wire-claude.mjs'

// User: "Analyze this code for security issues"
const grokRouter = new TaskRouter(grokDiscovery)
const grokRouting = grokRouter.route(userQuery)

if (grokRouting.recommendedLLM === 'kimi') {
  // Grok forwards to Kimi
  const kimiResponse = await kimi.query(userQuery)
  
  // Kimi internally decides if Claude is needed
  const discovery = new ContextDiscovery()
  await discovery.load()
  const claudeContext = discovery.discoverClaudeContext('agents.kimi')
  
  if (claudeContext.some(c => c.label.includes('security'))) {
    // Kimi asks Claude for security analysis
    const claudeResponse = await claude.query(userQuery)
    
    // Kimi synthesizes: Grok insight + Claude analysis
    return await kimi.synthesize(userQuery, kimiResponse, claudeResponse)
  }
}
```

---

## Environment Variables

Set in Kimi startup (`.bashrc`, startup script, or Kimi config):

```bash
# Session tracking
export KIMI_CLAUDE_SESSION_STORE=~/.grok/hard-allow/kimi-claude-sessions.jsonl
export KIMI_CONTEXT_NODES=~/.grok/context-nodes

# Wiring script location
export KIMI_WIRE_SCRIPT=~/.grok/hard-allow/kimi-wire-claude.mjs

# Optional: control spreading activation
export KIMI_DISCOVERY_MAX_HOPS=4
export KIMI_DISCOVERY_THRESHOLD=0.02
export KIMI_DISCOVERY_DECAY=0.75

# Optional: performance tuning
export KIMI_SESSION_CACHE_TTL=300  # Cache discovered context for 5min
export KIMI_BATCH_SIZE=10  # Batch N queries before weight consolidation
```

---

## API Reference

### Import Classes
```javascript
import { 
  ContextDiscovery,      // Spread activation discovery
  SessionWiring,         // Create/manage sessions
  ContextSyncBridge,     // Bidirectional sync + learning
  TaskRouter             // Route queries to best LLM
} from '~/.grok/hard-allow/kimi-wire-claude.mjs'
```

### ContextDiscovery API

```javascript
const discovery = new ContextDiscovery()
await discovery.load()  // Load hydrated context nodes

// Discover Claude context from Kimi node
const results = discovery.discoverClaudeContext('agents.kimi', {
  maxHops: 4,              // Search depth (default: 4)
  threshold: 0.02,         // Stop below this activation (default: 0.02)
  targetLLM: 'claude'      // Filter by LLM (default: 'claude')
})

// Returns: Array<{nodeId, label, activation, distance, type, path}>
// Example:
// [
//   {
//     nodeId: 'agents.claude',
//     label: 'Claude Adapter Profile',
//     activation: '0.0791',
//     distance: 3,
//     type: 'agent',
//     path: ['agents.kimi', 'context.room', 'context.tasks', 'agents.claude']
//   },
//   ...
// ]
```

### SessionWiring API

```javascript
const wiring = new SessionWiring()

// Create new session
const session = wiring.createSession(
  'user query text',           // What did Kimi ask?
  discoveredContext            // From ContextDiscovery
)
// Returns: { sessionId, timestamp, initiator, llmSelection, bidirectionalSync, ... }

// Load all sessions
const sessions = SessionWiring.loadSessions()
// Returns: Array<session>

// Update session (add syncs, update state)
SessionWiring.updateSession(sessionId, {
  state: 'completed',
  bidirectionalSync: { ... }
})
```

### ContextSyncBridge API

```javascript
// Sync bidirectional updates
ContextSyncBridge.sync(sessionId, {
  kimiUpdate: { type: 'result', data: {...} },    // Optional
  claudeUpdate: { type: 'result', data: {...} },  // Optional
  feedback: 'helpful'  // 'helpful' | 'not-helpful' (triggers Hebbian boost)
})

// Hebbian learning example:
// If feedback='helpful', discovered context node weights are boosted by +0.05
// Next time spreading activation seeded from Kimi → weights to useful context higher
```

### TaskRouter API

```javascript
const router = new TaskRouter(discovery)

// Route a query
const result = router.route('user query text')
// Returns: {
//   recommendedLLM: 'claude' | 'kimi' | 'grok',
//   score: '0.92',  // Confidence (0-1)
//   allScores: { claude: '0.92', kimi: '0.50', grok: '0.65' },
//   taskType: 'security-review' | 'coding' | 'research' | 'translation' | 'general',
//   keywords: ['security', 'audit', 'code'],
//   rationale: 'Claude excels at detailed code security analysis'
// }
```

---

## CLI Commands for Testing

### Discover Claude Context
```bash
# Show what Kimi can discover about Claude
node ~/.grok/hard-allow/kimi-wire-claude.mjs discover agents.kimi

# Output: Ranked list of Claude capabilities + activation path
```

### Connect Kimi to Claude
```bash
# Create session for a specific task
node ~/.grok/hard-allow/kimi-wire-claude.mjs connect "your task description"

# Output: Session ID + discovered context + confidence score
```

### Route Query to Best LLM
```bash
# Determine best LLM for a query
node ~/.grok/hard-allow/kimi-wire-claude.mjs route "your query"

# Output: Recommended LLM + scores + rationale
```

### Perform Sync
```bash
# Sync latest session (bidirectional + Hebbian learning)
node ~/.grok/hard-allow/kimi-wire-claude.mjs sync

# Output: Sync summary + weight updates
```

### List Active Sessions
```bash
# Show all Kimi-Claude sessions
node ~/.grok/hard-allow/kimi-wire-claude.mjs session-list

# Output: Session IDs + queries + timestamps + LLM choices
```

### View Audit Trail
```bash
# Show session history
node ~/.grok/hard-allow/kimi-wire-claude.mjs audit 10

# Output: Detailed audit log of last N sessions
```

---

## Workflow Examples

### Example 1: Kimi Assists User with Code Review

**User Query**: "Can you review this Python code for security issues?"

**Workflow**:
```
1. Kimi receives query
2. Kimi detects: task_type=security-review, keywords=['security', 'code']
3. Kimi discovers Claude context
   → finds agents.claude (dist: 3, act: 0.08)
   → finds skills.code-review (dist: 4, act: 0.04)
4. Kimi creates session
   → sessionId: kimi-claude-1722843213456-a1b2c3d4
   → confidence: 92%
5. Kimi asks Claude: "Review this code: [code]"
6. Claude responds with detailed security analysis
7. User gives feedback: "This was really helpful!"
8. Kimi syncs with feedback='helpful'
   → Hebbian boost: context.skills.code-review weight += 0.05
9. Next security query → code-review context weights higher
```

### Example 2: Grok Queries Through Kimi to Claude

**User Query**: "Analyze this malware sample and explain attack vectors"

**Workflow**:
```
1. Grok receives query
2. Grok routes: recommended=kimi (research + data analysis)
3. Grok → Kimi: "Please analyze this malware"
4. Kimi processes:
   - Extracts indicators (hash, IP, domain, etc)
   - Discovers Claude: code review + security analysis
   - Creates Kimi-Claude session
5. Kimi → Claude: "Explain attack vectors in this malware"
6. Claude: Returns detailed technical analysis
7. Kimi synthesizes: Data analysis (Grok) + Technical detail (Claude)
8. Response flows back: Claude → Kimi → Grok → User
9. User appreciates multi-LLM synthesis
10. Hebbian learning captures: "malware analysis benefits from Kimi→Claude chain"
```

### Example 3: Continuous Learning Over Sessions

**Session 1**: Kimi asks Claude about OAuth
- Discovered context: agents.claude.models.claude-opus-5
- Session recorded

**Session 2**: Kimi asks Claude about JWT tokens
- Discovered context: agents.claude.models.claude-opus-5
- Path slightly different but same target

**Session 3**: Kimi asks Claude about auth security
- Spreading activation follows learned path (reinforced by sessions 1-2)
- Discovery is faster and more confident
- Hebbian weights favor direct paths to Claude auth expertise

**Result**: Multi-LLM system learns collaboration patterns automatically

---

## Performance Tuning

### Discovery Speed

**Current**: ~50ms per discovery

Optimize with caching:
```bash
# Export to skip re-loading nodes
export KIMI_DISCOVERY_CACHE=/tmp/kimi-discovery-cache.json

# Cache discovered context for 5 minutes
export KIMI_CACHE_TTL=300
```

### Spreading Activation Tuning

```bash
# Deeper searches (more context discovered)
export KIMI_DISCOVERY_MAX_HOPS=6
export KIMI_DISCOVERY_THRESHOLD=0.01  # Lower threshold = deeper search

# Faster searches (fewer nodes)
export KIMI_DISCOVERY_MAX_HOPS=2
export KIMI_DISCOVERY_THRESHOLD=0.05  # Higher threshold = faster
```

### Session Consolidation

```bash
# Batch N sessions before Hebbian consolidation
export KIMI_CONSOLIDATION_BATCH=10

# Run consolidation manually
node ~/.grok/hard-allow/kimi-wire-claude.mjs consolidate
```

---

## Troubleshooting

### Issue: "Context nodes not found"

**Diagnosis**:
```bash
ls ~/.grok/context-nodes/state.json
```

**Solution**:
```bash
# Regenerate context nodes
node ~/.grok/hard-allow/create-context-nodes.mjs

# Verify hydration
cat ~/.grok/context-nodes/.hydrated
```

### Issue: "No Claude context discovered"

**Diagnosis**:
```bash
# Check if Claude node exists
grep -l "agents.claude" ~/.grok/context-nodes/state.json
```

**Solution**:
```bash
# Claude context might be in different part of graph
# Try discovering from different seed
node ~/.grok/hard-allow/kimi-wire-claude.mjs discover agents.grok
node ~/.grok/hard-allow/kimi-wire-claude.mjs discover system.ha-status
```

### Issue: "Session not found"

**Diagnosis**:
```bash
# Verify session file exists
ls -la ~/.grok/hard-allow/kimi-claude-sessions.jsonl

# Check if session ID is correct
cat ~/.grok/hard-allow/kimi-claude-sessions.jsonl | jq '.sessionId'
```

**Solution**:
```bash
# List all sessions
node ~/.grok/hard-allow/kimi-wire-claude.mjs session-list
```

### Issue: "Low confidence routing"

**Diagnosis**: Spreading activation not finding good context

**Solutions**:
1. Increase max hops: `export KIMI_DISCOVERY_MAX_HOPS=5`
2. Lower threshold: `export KIMI_DISCOVERY_THRESHOLD=0.01`
3. Check context graph: `wc -l ~/.grok/context-nodes/graph.jsonl`

---

## Monitoring & Observability

### Check Session Activity
```bash
# How many sessions created today?
grep "2026-08-07" ~/.grok/hard-allow/kimi-claude-sessions.jsonl | wc -l

# Average confidence score
cat ~/.grok/hard-allow/kimi-claude-sessions.jsonl | \
  jq '.llmSelection.confidence' | \
  awk '{sum+=$1; count++} END {print sum/count}'

# Most common LLM recommendation
cat ~/.grok/hard-allow/kimi-claude-sessions.jsonl | \
  jq '.llmSelection.recommended' | \
  sort | uniq -c
```

### Check Hebbian Learning
```bash
# How many weight updates?
grep "hebbianUpdates" ~/.grok/hard-allow/kimi-claude-sessions.jsonl | wc -l

# Which nodes were boosted most?
cat ~/.grok/hard-allow/kimi-claude-sessions.jsonl | \
  jq '.hebbianUpdates[] | .nodeId' | \
  sort | uniq -c | sort -rn
```

### Monitor Graph Changes
```bash
# Node count over time
for f in ~/.grok/context-nodes/backups/state.json.*; do
  echo "$f: $(jq '.nodeCount' "$f")"
done

# Check for stale context
ls -lt ~/.grok/context-nodes/state.json
```

---

## Security Considerations

### Session Isolation
- Each session has unique ID (16-byte random)
- Sessions don't share state
- Audit trail is immutable (append-only JSONL)

### Credentials in Context
- Secrets marked as `***RED***` in context nodes
- Never logged to session file
- Redacted in audit trail

### Hard-Link Verification
```bash
# Verify context nodes are hard-linked (inode 329996665)
ls -i ~/.grok/context-nodes/state.json
ls -i ~/.grok/context-nodes/graph.jsonl
ls -i ~/.grok/context-nodes/SHARED_NODE_REGISTRY.json

# All should show same inode number
```

### Revoking Access
```bash
# Instantly disable all Kimi-Claude sessions
rm ~/.grok/context-nodes/*

# Kimi will get "Context nodes not found" error
# Sessions become unreferenced but audit trail remains
```

---

## Deployment Checklist

- [ ] Context nodes hydrated at `~/.grok/context-nodes/`
- [ ] kimi-wire-claude.mjs copied to `~/.grok/hard-allow/`
- [ ] File permissions: `chmod +x kimi-wire-claude.mjs`
- [ ] Test discover: `node kimi-wire-claude.mjs discover agents.kimi`
- [ ] Environment variables set (optional)
- [ ] Kimi CLI imports ContextDiscovery class
- [ ] Session handling implemented in Kimi startup
- [ ] Audit logging enabled
- [ ] Monitoring configured
- [ ] Documentation shared with team

---

## Next Steps

1. **Copy Script**: `cp ~/.grok/hard-allow/kimi-wire-claude.mjs /path/to/kimi/lib/`
2. **Integrate Classes**: Import into Kimi CLI startup
3. **Test Discovery**: Verify Claude context is found
4. **Deploy Sessions**: Save session IDs for audit
5. **Monitor Learning**: Watch Hebbian weights improve

---

**Last Updated**: 2026-08-07
**Status**: Production Ready
**Support**: See KIMI-WIRE-CLAUDE.md for detailed documentation
