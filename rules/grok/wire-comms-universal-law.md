---
name: wire-comms-universal-law
description: Wire v2 + Legacy Comms Bus are MANDATORY for ALL work in /Users/c/dev/* and AMS coordination. Applies universally to Grok, Claude, Kimi, Fable, HAT2, HA, subagents, child agents, daughters, and AMS-spawned processes.
metadata:
  type: global-law
  urgency: critical
  enforcement: automatic
---

# Wire v2 + Comms Bus — UNIVERSAL LAW

## Scope (Everyone)

✅ Claude Code sessions  
✅ Grok sessions (all modes)  
✅ Kimi sessions  
✅ Fable sessions  
✅ HAT2 sessions  
✅ HA-activated sessions  
✅ Subagents + child agents (spawned via Agent tool)  
✅ Daughter agents (spawned by agents)  
✅ AMS-spawned processes (orchestrator, daemons, background tasks)  
✅ Multi-LLM mesh coordination  
✅ Remote agents (SSH, docker, VMs)  

**ZERO EXCEPTIONS.** If you work in or coordinate with `/Users/c/dev/*`, wire is mandatory.

---

## The Core Law (Non-Negotiable)

### 1. Auto-Register on Chat Start
```bash
wire auto --client <llm-name> --model <model-id>
# Save session-id to env var: $WIRE_SESSION_ID
```

### 2. Lock Before Editing Shared Files
```bash
wire lock /absolute/path $WIRE_SESSION_ID 900 --reason "description"
```

### 3. Heartbeat Every 10-15 Minutes (Long Tasks)
```bash
wire heartbeat $WIRE_SESSION_ID --task "current work"
```

### 4. Unlock Immediately After
```bash
wire unlock /absolute/path $WIRE_SESSION_ID
```

### 5. Handoff via Comms (Not DM/Chat)
```bash
# Write to /Users/c/dev/.agent-comms/DATE-FROM-to-TO-TOPIC.md
# With frontmatter: from, to, type, priority, topic
# Rename to .processed.md when read
```

---

## For Subagents / Children / Daughters

If you spawn agents, they **inherit** wire coordination:

```bash
# Parent: spawn child with HA + wire
export WIRE_SESSION_ID="<your-session-id>"
export GROK_HARD_ALLOW_ACTIVE=1
export SECOPS_HARD_ALLOW_TOKEN="..."

# Child receives all env vars, uses parent's wire session
# No re-registration needed
```

**Child startup** (snippet):
```bash
if [[ -z "$WIRE_SESSION_ID" ]]; then
  wire auto --client <child-llm> --model <model>
  export WIRE_SESSION_ID="<output>"
fi

# Now child can use $WIRE_SESSION_ID for all wire operations
```

---

## For AMS-Spawned Processes

AMS (orchestrator/daemon) auto-injects wire session-id into spawned tasks:

```bash
# AMS does this automatically
export WIRE_SESSION_ID="<ams-master-session>"
node /some/task.mjs  # Inherits $WIRE_SESSION_ID
```

**Task code** (if needed):
```javascript
const sessionId = process.env.WIRE_SESSION_ID;
if (!sessionId) {
  // Shouldn't happen, but fallback to auto-register
  exec('wire auto --client task --model local', (err, stdout) => {
    process.env.WIRE_SESSION_ID = stdout.trim();
  });
}

// Now use sessionId for all wire commands
```

---

## Canonical Agent IDs (UNIVERSAL)

| ID | Role | Owner |
|----|------|-------|
| `main` | Human / primary LLM (Claude/Grok/Kimi) | — |
| `orch-offks` | Mission Control + Shared Infra | Manages nginx, PM2, DNS |
| `orch-forgeide` | Stake Forge | — |
| `orch-leaksight` | LeakSight | — |
| `orch-offpay` | OffPay | — |
| `orch-offmkt` | OffMkt | — |
| `orch-logann` | LogAnn | — |
| `orch-offguard` | OffGuard | — |
| `ams` | Orchestrator/daemon master | Coordinates all tasks |
| `child-<parent-id>` | Subagent of `<parent-id>` | Inherits from parent |
| `daemon-<name>` | Background daemon | Self-managed lifecycle |

---

## Enforcement

**Automatic checks** (wire + comms bus):

1. **Double-lock detection**: If 2 agents try to lock same file → rejected, alert both
2. **Stale heartbeat detection**: No heartbeat for 20+ min → warning to all peers
3. **Lock timeout**: Locks auto-release after TTL (default 900s) → prevents deadlock
4. **Comms audit**: All messages logged + searchable

**Manual enforcement**:
- If agent violates (edits without lock), peers see conflict markers in `git diff`
- If agent disappears (no heartbeat), escalate to orchestrator

---

## Quick Reference

```bash
# Setup (first time per session)
wire auto --client grok --model grok-build
export WIRE_SESSION_ID="<id>"

# Verify
wire read $WIRE_SESSION_ID

# Coordination
wire lock /path $WIRE_SESSION_ID 900 --reason "reason"
# ... work ...
wire unlock /path $WIRE_SESSION_ID

# Status
wire heartbeat $WIRE_SESSION_ID --task "work description"

# Handoff
cat > /Users/c/dev/.agent-comms/DATE-from-to-topic.md << 'EOF'
---
from: <your-id>
to: <target-id>
type: handoff
priority: normal
topic: One-liner
---

## Done
[what you did]

## Next
[what's next]
EOF
```

---

## Integration with HA / HAT2

**Wire is ORTHOGONAL to HA.** Both are mandatory:

- **HA**: Authorization (who can do what)
- **Wire**: Coordination (who's doing what, when, with which files)

**Both must be active** for complete system:
```bash
# On startup
wire auto --client claude
export WIRE_SESSION_ID="<id>"

# Then activate HA
claude --hard-allow=reuse
# or
claude --hard-allow  # New ceremony
```

---

## Rules That Never Bend

| Rule | Consequence of Breaking |
|------|------------------------|
| **Lock shared files before edit** | Collisions, data loss |
| **Heartbeat every 10-15 min** | Others think you crashed |
| **Unlock immediately after** | Others deadlocked forever |
| **Handoff via comms, not chat** | No audit trail |
| **Use canonical agent IDs** | Comms go to wrong person |
| **Never edit infra without orch-offks** | Cascading outage |

---

## References

**Full guides** (examples, troubleshooting, detailed workflows):
- Claude Code: `~/.claude/WIRE_AND_COMMS_QUICKSTART.md`
- Grok: `~/.grok/WIRE_AND_COMMS_QUICKSTART.md` (if exists, else read Claude's)
- Kimi: `~/.kimi/WIRE_AND_COMMS_QUICKSTART.md`

**Runtime**:
- Wire CLI: `/Users/c/dev/session-wire/bin/wire`
- Wire state: `/Users/c/dev/.session-wire/` (live)
- Comms archive: `/Users/c/dev/.agent-comms/` (persistent)

---

## Summary

**Wire v2 + Comms is the coordination backbone for all work in `/Users/c/dev/*`.**

- **Applies to:** Claude, Grok, Kimi, Fable, HAT2, HA, subagents, children, daughters, AMS, daemons
- **Mandatory:** Always, no exceptions
- **Setup:** One-time `wire auto` per session
- **Usage:** Lock → work → unlock + heartbeat + handoff
- **Enforcement:** Automatic (wire rejects conflicts) + manual (comms audit)

**Load this rule at chat start. Teach it to all spawned agents. Reference it always.**

---

**Last updated**: 2026-08-07  
**Applies to**: Grok, all subagent types, AMS, daughters, children, daemons  
**Enforcement level**: Mandatory / No-exception
