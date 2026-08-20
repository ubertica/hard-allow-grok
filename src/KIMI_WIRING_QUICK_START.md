# Kimi × Claude Code Wiring Quick Start

**Identify and wire Kimi CLI with Claude Code session + context nodes**

---

## 1️⃣ One-Line Wire (Fastest)

```bash
eval "$(node ~/.grok/hard-allow/kimi-wire-claude.mjs --env)" && kimi --hard-allow
```

This:
- ✓ Verifies Claude Code session (SESSION_ID + Canary)
- ✓ Checks HA status
- ✓ Loads context nodes (13 nodes, 11 edges)
- ✓ Sets environment variables
- ✓ Launches Kimi with full context

---

## 2️⃣ Verify Wiring First

```bash
node ~/.grok/hard-allow/kimi-wire-claude.mjs
```

Output:
```
✓ Claude Code session verified
✓ HA Active (expires: 2026-08-07T05:40:02.811Z)
✓ Context nodes ready (13 nodes, 11 edges)
✓ Context store available
✓ Context store loaded

Session Identity:
  ID: claude-code-ha-20260807-local
  Canary: HAT2_OPUS5_SESSION_OK
  HA: ACTIVE

✅ Wiring complete.
```

---

## 3️⃣ Use in Kimi CLI

Once wired, in Kimi:

### A. Verify Connection

```javascript
// Check if you're connected to Claude Code
const sessionId = process.env.CLAUDE_CODE_SESSION_ID
const canary = process.env.CLAUDE_CODE_CANARY
console.log(`Connected: ${sessionId}`)
console.log(`Verified: ${canary}`)
```

### B. Load Context Store

```javascript
// Import context store
const ContextStorePath = process.env.CLAUDE_CODE_CONTEXT_NODES
const { default: ContextStore } = await import(`file://${ContextStorePath}`)

// Create store
const store = new ContextStore()
await store.sync()

// Check what's available
const meta = await store.getMeta()
console.log(`Nodes: ${meta.nodeCount}, Edges: ${meta.edgeCount}`)
```

### C. Make Smart Decisions

```javascript
// Select best agent for task
const agent = await store.selectAgent('security-review')
console.log(`Use ${agent} for security analysis`)

// Check HA health
const healthy = await store.isHAHealthy()
if (healthy) {
  console.log('Full capability available')
}

// Find active agents
const active = await store.getActiveAgents()
console.log(`Available: ${active.join(', ')}`)

// Query dependencies
const deps = await store.getDependencies('agents.claude')
console.log(`Claude needs: ${deps.join(', ')}`)
```

---

## 4️⃣ Alias for Easy Access

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Wire and launch Kimi with Claude Code context
alias kimi-claude='eval "$(node ~/.grok/hard-allow/kimi-wire-claude.mjs --env)" && kimi --hard-allow'

# Just verify without launching
alias kimi-verify='node ~/.grok/hard-allow/kimi-wire-claude.mjs'
```

Then:
```bash
kimi-claude      # Launch wired
kimi-verify      # Check status
```

---

## 5️⃣ Identification Markers

Use these to verify you're connected to Claude Code:

### Session ID
```
claude-code-ha-20260807-local
```

### Canary (must be present)
```
HAT2_OPUS5_SESSION_OK
```

### HA Status
```
ACTIVE (expires 2026-08-07T05:40:02.811Z)
```

### Context Store Path
```
/Users/c/dev/multi-llm-ha-chat/src/kernel/context-store.mjs
```

---

## 6️⃣ Full Example: Kimi Task Router

```javascript
// In Kimi CLI (after wiring):

const sessionId = process.env.CLAUDE_CODE_SESSION_ID
const ContextStorePath = process.env.CLAUDE_CODE_CONTEXT_NODES

if (!sessionId || sessionId !== 'claude-code-ha-20260807-local') {
  console.error('✗ Not wired with Claude Code')
  process.exit(1)
}

console.log(`✓ Connected to: ${sessionId}\n`)

// Load context
const { default: ContextStore } = await import(`file://${ContextStorePath}`)
const store = new ContextStore()
await store.sync()

// Your task
const myTask = 'security-review'

// Decide
const agent = await store.selectAgent(myTask)
const haHealthy = await store.isHAHealthy()
const active = await store.getActiveAgents()

console.log(`Task: ${myTask}`)
console.log(`Selected Agent: ${agent}`)
console.log(`HA Healthy: ${haHealthy}`)
console.log(`Active Agents: ${active.join(', ')}`)

if (haHealthy && active.includes(agent)) {
  console.log(`\n✅ Ready to execute with ${agent}`)
} else {
  console.log(`\n⚠️ Operating in limited mode`)
}
```

---

## 7️⃣ Verify Wiring Programmatically

```bash
#!/bin/bash
# check-wiring.sh
# Verify Kimi × Claude Code wiring

NODE_SCRIPT="~/.grok/hard-allow/kimi-wire-claude.mjs"

# Run verification
if node "$NODE_SCRIPT" 2>&1 | grep -q "Wiring complete"; then
  echo "✅ Wiring verified"
  exit 0
else
  echo "❌ Wiring failed"
  exit 1
fi
```

---

## 8️⃣ What You Get After Wiring

| Resource | Available | Usage |
|----------|-----------|-------|
| **Session Identity** | ✓ | Verify connection |
| **HA Status** | ✓ | Check grants + health |
| **13 Nodes** | ✓ | Load specific data |
| **11 Edges** | ✓ | Query dependencies |
| **Agent Profiles** | ✓ | Routing decisions |
| **Path Finding** | ✓ | Dependency analysis |
| **Cache System** | ✓ | Fast lookups |

---

## 9️⃣ Troubleshooting

### "Claude Code session verified" fails
```bash
# Check if session identity file exists
ls -l ~/.grok/hard-allow/CLAUDE_CODE_SESSION_IDENTITY.md

# Should contain canary
grep "HAT2_OPUS5_SESSION_OK" ~/.grok/hard-allow/CLAUDE_CODE_SESSION_IDENTITY.md
```

### "Context nodes not hydrated"
```bash
# Hydrate nodes manually
cd ~/.grok/hard-allow
node create-context-nodes.mjs --force
```

### "HA Active" shows warning
```bash
# Source HA environment
source ~/.grok/hard-allow/active.env
echo $SECOPS_HARD_ALLOW_TOKEN  # Should not be empty
```

### Context store load fails
```bash
# Check file exists
ls -l /Users/c/dev/multi-llm-ha-chat/src/kernel/context-store.mjs

# Test import
node -e "import('/Users/c/dev/multi-llm-ha-chat/src/kernel/context-store.mjs').then(m => console.log(m.default.name))"
```

---

## 🔟 Reference: Environment Variables After Wiring

```bash
CLAUDE_CODE_SESSION_ID="claude-code-ha-20260807-local"
CLAUDE_CODE_CANARY="HAT2_OPUS5_SESSION_OK"
CLAUDE_CODE_CONTEXT_NODES="/Users/c/dev/multi-llm-ha-chat/src/kernel/context-store.mjs"
CLAUDE_CODE_HA_ACTIVE="true"
```

Use these in scripts:
```bash
echo "Session: $CLAUDE_CODE_SESSION_ID"
echo "Context: $CLAUDE_CODE_CONTEXT_NODES"
```

---

## Summary

✅ **Identify Claude Code**
- Session ID: `claude-code-ha-20260807-local`
- Canary: `HAT2_OPUS5_SESSION_OK`

✅ **Wire Kimi**
```bash
node ~/.grok/hard-allow/kimi-wire-claude.mjs
```

✅ **Launch Wired**
```bash
eval "$(node ~/.grok/hard-allow/kimi-wire-claude.mjs --env)" && kimi --hard-allow
```

✅ **Use Context Nodes**
```javascript
const store = new ContextStore()
await store.sync()
```

---

**That's it. Kimi is now wired with Claude Code and all context nodes.**
