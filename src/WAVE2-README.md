# Wave 2: Semantic Memory Integration — Quick Start

## What is Wave 2?

Wave 2 wires **SemanticMemoryEngine** into the multi-LLM context graph to enable:
- **Spreading Activation**: Semantic navigation (activate one node → see what lights up)
- **Hebbian Consolidation**: Learning (co-activated nodes get stronger connections)
- **Context Gating**: Multi-LLM awareness (Claude/Grok/Kimi see different relevant context)

## Files

| File | Purpose |
|------|---------|
| `wire-semantic-memory.mjs` | Main integration script (production-ready) |
| `WAVE2-INTEGRATION.md` | Full technical documentation |
| `WAVE2-TEST-RESULTS.txt` | Three test examples + analysis |
| `WAVE2-README.md` | This file |

## Quick Start

### Interactive CLI (Testing)

```bash
node ~/.grok/hard-allow/wire-semantic-memory.mjs

wave2> activate system.ha-status
# Output: HA status fires → spreads to grants, agents, infrastructure

wave2> activate agents.claude claude
# Output: Claude node fires with claude-specific context gating

wave2> recall agents.claude
# Output: Top-10 associated nodes

wave2> paths agents.claude projects.multi-llm-ha-chat
# Output: Weighted paths between two nodes

wave2> consolidate
# Output: Hebbian pass (learn from co-activations)

wave2> exit
```

### Batch Commands

```bash
# Activate single node
node wire-semantic-memory.mjs activate "system.ha-status"

# Activate with multi-LLM context
node wire-semantic-memory.mjs activate "agents.claude" "claude"

# Activate with task context (multi-tag)
node wire-semantic-memory.mjs activate "projects.genesis-labs" "project" "security"

# Show statistics
node wire-semantic-memory.mjs stats

# List nodes matching pattern
node wire-semantic-memory.mjs list "agents"
```

### Programmatic Integration (arm-v2.mjs)

```javascript
import { WireSemanticMemory } from './wire-semantic-memory.mjs';

async function initWave2() {
  const wire = new WireSemanticMemory({ writerId: 'wave2-claude' });
  await wire.load();  // Load hydrated context nodes
  
  // Activate nodes during task execution
  wire.activate(['projects.multi-llm-ha-chat', 'agents.claude'], {
    context: ['claude'],  // Multi-LLM context gating
  });
  
  // End of session: consolidate learned patterns
  await wire.consolidate();
}

initWave2().catch(console.error);
```

## Configuration: Key Tuning Parameters

All parameters in `WAVE2_CONFIG` (top of `wire-semantic-memory.mjs`):

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `spreadDecay` | 0.72 | 72% falloff per hop (richer navigation) |
| `maxHops` | 5 | Up to 5 hops from seed (deeper search) |
| `maxFrontier` | 1024 | Explore up to 1024 nodes per activation |
| `initialActivation` | 1.2 | Seed nodes start with 1.2 energy (stronger) |
| `learningRate` | 0.12 | Co-activations strengthen edges 12% (faster learning) |
| `contextGateStrength` | 2.0 | Sharp context separation (mode-aware) |

Change any value when creating a new `WireSemanticMemory`:

```javascript
const wire = new WireSemanticMemory({
  initialActivation: 1.5,  // Stronger seeds
  learningRate: 0.15,      // Faster learning
});
```

## Test Results: Three Examples

See `WAVE2-TEST-RESULTS.txt` for detailed analysis. Summary:

### Example 1: HA Status (Root Node)
- Seed: `system.ha-status` (1.2)
- Spreads to: hardAllow.grants (1.076), agents.claude/grok (0.835/0.904)
- **Benefit**: Automatic discovery of dependencies

### Example 2: Claude with Context Gating
- Seed: `agents.claude` with `context: ['claude']`
- Result: Claude-relevant nodes boosted, other agents faded
- **Benefit**: Multi-LLM awareness (same graph, different views)

### Example 3: Genesis Labs with Task Context
- Seed: `projects.genesis-labs` with `context: ['project', 'security']`
- Spreads to: infrastructure, related projects, access controls
- **Benefit**: Task-specific context filtering

## Graph Structure

- **23 Nodes**: system, projects, agents, grants, skills, context
- **42 Edges**: prerequisite, enables, hosts, integrates, uses, etc.
- **Hard-linked**: All 3 LLMs (Claude, Grok, Kimi) share same state

## Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Load (hydrate) | ~2ms | Sub-10ms startup |
| Activate (spread) | ~5ms | Real-time integration |
| Recall (top-10) | ~10ms | Sub-100ms all ops |
| Consolidate (learn) | ~15ms | Can run end-of-session |
| Save (persist) | ~20ms | Atomic, merge-aware |

## Key Features

✓ **Spreading Activation**: Energy spreads from seed nodes, decaying per hop  
✓ **Hebbian Learning**: Co-activated nodes get stronger edges  
✓ **Context Gating**: Different results based on active LLM/task  
✓ **Multi-LLM Sync**: Hard-linked state across Claude/Grok/Kimi  
✓ **Persistence**: Auto-save to `activation-state.json`  
✓ **Real-time**: All ops <100ms, enables hot-path integration  

## Next Steps

1. **Test Locally**: Run `node wire-semantic-memory.mjs` and explore
2. **Review Config**: Adjust `WAVE2_CONFIG` for your use case
3. **Integrate**: Add calls to `wire.activate()` in arm-v2.mjs per turn
4. **Monitor**: Check `wire.stats()` for graph health
5. **Consolidate**: Call `wire.consolidate()` at session end

## Troubleshooting

**"Engine not loaded" error**
```javascript
const wire = new WireSemanticMemory();
await wire.load();  // Must call load() first
wire.activate(...);
```

**Context gating not working**
```javascript
// Check node tags
wire.engine.nodes.get('agents.claude').tags
// Should include: ['Claude Adapter Profile', 'agent', ...]
```

**Learning not persisting**
```javascript
// Call consolidate() to trigger Hebbian pass and save
await wire.consolidate();
```

## Documentation

- **WAVE2-INTEGRATION.md**: Full technical spec + architecture
- **WAVE2-TEST-RESULTS.txt**: Test output + detailed analysis
- **wire-semantic-memory.mjs**: Inline code comments

## Integration Checklist

- [x] SemanticMemoryEngine loaded and initialized
- [x] Context nodes hydrated (23 nodes, 42 edges)
- [x] Spreading activation tested (3 examples)
- [x] Context gating verified (multi-LLM modes)
- [x] Hebbian consolidation ready (session-end learning)
- [x] Hard-link sync verified (3 LLMs share state)
- [x] CLI interface working (interactive + batch)
- [x] Performance characterized (<100ms all ops)
- [x] Documentation complete

Ready for production use and arm-v2.mjs integration.

---

**Status**: Production-Ready  
**Last Updated**: 2026-08-07  
**Source**: `/Users/c/dev/semantic-memory/`  
**Deployed**: `~/.grok/hard-allow/`
