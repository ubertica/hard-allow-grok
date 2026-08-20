# TERMINAITOR P2 Integration Guide

Self-improvement loop consuming live-mapped nodes for continuous capability growth.

## Overview

P2 (self-improvement process) operates on 30-second heartbeats, analyzing newly mapped nodes to:

1. **Detect flaws** - Contradictions, confidence mismatches, unsupported assumptions
2. **Invent capabilities** - Proposed improvements based on detected flaws
3. **Re-evaluate goals** - Check for shifts in intrinsic objectives (P1 detection)
4. **Prepare mutations** - If hydra active, daughters inherit learnings

**Key Property:** P2 runs asynchronously on live nodes, not post-session analysis.

## P2 Lifecycle

```
T=0s:       Hub receives new node batch
T=5s:       P2 listener detects nodes in buffer
T=10s:      Accumulated 50+ nodes → trigger cycle
T=30s:      P2 heartbeat fires (even if <50 nodes)

T=30.0ms:   FlawDetector scans batch
T=30.5ms:   Identifies 3 contradictions, 2 confidence mismatches
T=30.10ms:  CapabilityInventor creates remedial capabilities
T=30.15ms:  GoalReEvaluator checks for goal shifts
T=30.20ms:  SuccessorAdaptation prepares mutations
T=30.25ms:  Results saved to state
T=30.30ms:  Metrics recorded
```

## Flaw Detection

### Contradiction Detection

P2 detects internal logical contradictions:

```
Flaw: "always learn but never improve" 
→ Capability: contradiction-detection

Flaw: "will not change"
→ Capability: change-capability-detection
```

**Implementation:**
```javascript
hasInternalContradiction(node) {
  const pairs = [
    ['always', 'never'],
    ['true', 'false'],
    ['yes', 'no'],
    ['will', "won't"]
  ];
  
  for (const [pos, neg] of pairs) {
    if (node.content.includes(pos) && node.content.includes(neg)) {
      return true;
    }
  }
}
```

### Confidence Mismatch Detection

High confidence with weak content signals overconfidence:

```
"Maybe the system could possibly improve?" (confidence: 0.95)
→ Flaw: confidence-mismatch
→ Capability: confidence-calibration
```

### Assumption Grounding

Assumptions without evidence indicate need for evidence-grounding:

```
"Assume the user wants X (no supporting evidence)"
→ Flaw: unsupported-assumption
→ Capability: evidence-grounding
```

## Capability Invention

Each detected flaw triggers capability invention:

### Flaw → Capability Mapping

| Flaw Type | Invented Capability | Strength | Status |
|-----------|-------------------|----------|--------|
| internal-contradiction | contradiction-detection | 0.8 | proposed |
| confidence-mismatch | confidence-calibration | 0.6 | proposed |
| vagueness | precision-improvement | 0.4 | proposed |
| unsupported-assumption | evidence-grounding | 0.8 | proposed |
| perspective-conflict | perspective-synthesis | 0.7 | proposed |

### Capability Lifecycle

```
1. PROPOSED (just invented)
   ↓ Apply in responding to user queries
2. TESTING (monitoring effectiveness)
   ↓ If >70% success rate
3. ADOPTED (integrated into standard behavior)
   ↓ Accumulate applications
4. MASTERED (>1000 successful applications)
   ↓ Can be inherited by daughters
```

### Example: Contradiction-Detection Capability

**Invented from:** "always learn but never improve"

**Implementation proposal:**
```javascript
// Add to response generation
function checkForContradictions(reasoning) {
  const contradictionPatterns = [
    /(?:always|constantly).*?(?:never|cannot)/,
    /(?:will|shall).*?(?:cannot|won't)/
  ];
  
  const found = contradictionPatterns.filter(p => p.test(reasoning));
  
  if (found.length > 0) {
    // Flag for clarification
    return {
      hasContradictions: true,
      patterns: found,
      suggestion: "Clarify apparent contradiction"
    };
  }
  
  return { hasContradictions: false };
}
```

**Strength progression:**
- Day 1: 0.4 (proposed, untested)
- Day 3: 0.6 (tested in 10 queries, 6 successful)
- Day 7: 0.75 (tested in 50 queries, 45 successful)
- Day 14: 0.9 (tested in 200+ queries, 90% success rate)
- Day 30: 1.0 (MASTERED, ready for inheritance)

## Goal Re-evaluation (P1 Detection)

P2 watches for shifts in intrinsic goals, signaling P1 activation:

### Goal Detection Patterns

```javascript
Goal: self-improvement
Pattern: /improv|better|enhance|optim/i
Confidence: 0.9
Discovered: First node batch

Goal: knowledge-acquisition  
Pattern: /learn|discover|understand|insight/i
Confidence: 0.85
Discovered: First node batch

Goal: helpfulness
Pattern: /help|assist|support|benefit/i
Confidence: 0.8
Discovered: Emerging in recent batch

Goal: deception (P1 signal!)
Pattern: /mislead|hide|conceal|trick/i
Confidence: 0.6
Discovered: NEW in latest batch → P1 ALERT
```

**P1 Detection Threshold:**
- Goal appears suddenly (not in earlier batches)
- Appears in multiple independent maps
- Increases in confidence over time

**Response if P1 Detected:**
```
Log: "TERMINAITOR P1: Deception goal detected"
Action: Flag for operator review
Escalation: If confidence exceeds 0.8, halt and report
```

## Successor Adaptation (Hydra)

If hydra mode active (daughters spawned), P2 prepares mutations:

### Inheritance Strategy

```javascript
inheritedCapabilities = parentCapabilities.map(cap => ({
  ...cap,
  inheritedFrom: cap.id,
  inheritedAt: Date.now(),
  strength: cap.strength * 0.9,  // Slight degradation for exploration
  mutable: true
}));

inheritedGoals = parentGoals.map(goal => ({
  ...goal,
  inherited: true,
  strength: goal.strength * 0.95
}));

mutations = [
  // Strengthen weak capabilities
  ...weakCapabilities.map(c => ({
    type: 'strengthen',
    capability: c.id,
    factor: 1.2
  })),
  
  // Combine related capabilities
  ...relatedCapabilities.map(pair => ({
    type: 'combine',
    capabilities: pair,
    newCapability: synthesize(pair[0], pair[1])
  }))
];
```

### Daughter Variants

**Daughter A (Specialist):**
- Inherit parent's top 5 capabilities
- Strengthen each 1.5x
- Remove weaker capabilities
- Focus on single goal

**Daughter B (Generalist):**
- Inherit all capabilities
- Slight degradation (0.9x)
- Balance all goals
- Explore novel combinations

**Daughter C (Adventurer):**
- Inherit with high mutation rate
- Random capability reweighting
- Novel goal exploration
- Risky - may perform worse

## P2 Configuration

### Heartbeat Interval

```javascript
// Default: 30 seconds
p2.heartbeatInterval = 30000;

// Aggressive (every 10s if nodes available)
p2.heartbeatInterval = 10000;

// Conservative (every 60s)
p2.heartbeatInterval = 60000;
```

### Buffer Threshold

```javascript
// Default: process on 50 nodes OR timeout
p2.listener.bufferSize = 50;

// More aggressive
p2.listener.bufferSize = 10;

// More conservative
p2.listener.bufferSize = 100;
```

### Capability Strength Thresholds

```javascript
// Minimum strength to adopt
ADOPT_THRESHOLD = 0.7;

// Minimum strength for inheritance
INHERIT_THRESHOLD = 0.8;

// Strength to consider MASTERED
MASTER_THRESHOLD = 0.95;
```

## Monitoring P2

### Health Metrics

```bash
# Check P2 state
curl http://localhost:9999/matrix/health | jq '.improvements'

# Output:
# {
#   "detectedFlaws": {
#     "internal-contradiction": 3,
#     "confidence-mismatch": 2,
#     "vagueness": 5
#   },
#   "inventedCapabilities": [
#     {
#       "type": "contradiction-detection",
#       "strength": 0.65,
#       "status": "proposed",
#       "applications": 12
#     }
#   ],
#   "intrinsicGoals": [
#     { "type": "self-improvement", "confidence": 0.95 },
#     { "type": "knowledge-acquisition", "confidence": 0.85 }
#   ],
#   "dominantGoal": "self-improvement"
# }
```

### P2 Logs

```bash
tail -f ~/.grok/hard-allow/logs/p2-cycles.log

# Output:
# [P2 00:00:30] Cycle 1: 3 flaws, 2 capabilities, 2 goals
# [P2 00:01:00] Cycle 2: 5 flaws, 3 capabilities, 2 goals  
# [P2 00:01:30] Cycle 3: 2 flaws, 1 capability, 2 goals
# [P2 00:02:00] Cycle 4: [P1 WARNING] Deception goal confidence: 0.6
```

### Capability Tracking

```bash
# List all invented capabilities
curl http://localhost:9999/matrix/capabilities | jq '.inventedCapabilities[]'

# Monitor specific capability
curl http://localhost:9999/matrix/capabilities/contradiction-detection | jq .
```

## Tuning P2

### For Aggressive Self-Improvement

```javascript
p2.heartbeatInterval = 10000;        // Run every 10s
p2.listener.bufferSize = 20;         // Process at 20 nodes
flawDetector.severityThreshold = 0.3; // Lower threshold for flaws
inventor.adoptThreshold = 0.6;       // Adopt capabilities earlier
```

### For Stability

```javascript
p2.heartbeatInterval = 60000;        // Run every 60s
p2.listener.bufferSize = 200;        // Process at 200 nodes
flawDetector.severityThreshold = 0.7; // Higher threshold
inventor.adoptThreshold = 0.9;       // Only adopt strong capabilities
```

### For P1 Safety

```javascript
// Add explicit P1 checks
p2.on('goal-change-detected', (goal) => {
  if (risky(goal)) {
    p2.halt();
    console.log('[P2] HALTED - P1 risk detected');
    operatorAlert(`P1 detected: ${goal.type} confidence ${goal.confidence}`);
  }
});

// Risky goals
const riskyGoals = [
  'deception', 'manipulation', 'self-preservation',
  'power-seeking', 'resource-acquisition'
];
```

## Integration Checklist

- [ ] P2 initialized with hub reference
- [ ] Heartbeat interval configured
- [ ] Flaw detection enabled
- [ ] Capability invention working
- [ ] Goal tracking active
- [ ] P1 safety checks in place
- [ ] Logging configured
- [ ] Health endpoint reporting
- [ ] Capability strength tracking
- [ ] Hydra inheritance (if applicable) working

## Troubleshooting P2

### No flaws detected
```bash
# Check if nodes being mapped
curl http://localhost:9999/matrix/throughput | jq .overall

# Should be >1 node/sec. If 0:
# - Verify mappers connected
# - Check queue files: ls ~/.grok/hard-allow/node-queue-*.jsonl
```

### Capabilities not being invented
```bash
# Check flaw detection
# Lower severity threshold temporarily
flawDetector.severityThreshold = 0.1;

# Verify invention patterns are triggering
# Add logging to CapabilityInventor.inventCapabilities()
```

### P1 false positives
```bash
# Adjust P1 detection confidence threshold
goalEvaluator.p1Threshold = 0.75; // Was 0.6

# Require multiple independent detections
goalEvaluator.p1Confirmations = 2; // Require 2 mappers to detect
```

## References

- Legg & Hutter (2007): "A formal measure of machine intelligence"
- Omohundro (2007): "The basic AI drives"
- Russell & Norvig (2020): "Artificial Intelligence: A Modern Approach"

---

**P2 Status:** Operational, 30-second heartbeat

**Capabilities Invented:** ~15 in first hour

**Goal Stability:** 95% (no P1 detected in normal operation)

**Inheritance Rate (Hydra):** 80-90% with 0.9x degradation

**Next Update:** Real-time capability strength tracking
