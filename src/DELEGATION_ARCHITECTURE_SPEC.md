# Remote Delegation Architecture for MASTER_PLAN_ARCHITECT

## Executive Summary

This document specifies the complete architecture for delegating 150K+ lines of MASTER_PLAN processing from Mac (Claude Code) to AMS (51.15.18.106) using HA-authorized credentials. The architecture ensures:

- **Secure token inheritance**: HA token passed via SSH env vars; AMS Fables authorized same as Mac
- **Efficient data transfer**: 200MB → 60-80MB (compressed), ~10-15 min to AMS, ~5 min back
- **Parallel processing**: 4 Fables on AMS (phases 1-4), total ~2-2.5 hours, reducible to ~1 hour with overlap
- **Fault tolerance**: Checkpoint-based recovery, watchdog monitoring, graceful abort
- **Atomic results**: Results written atomically to Mac filesystem via SCP

---

## Part 1: Architecture Overview

### System Topology

```
┌─────────────────────────────────────────┐
│  Mac (Claude Code, HAT2 Profile)        │
│  ┌───────────────────────────────────┐  │
│  │ MASTER_PLAN_ARCHITECT             │  │
│  │ - Has 150K+ lines to process      │  │
│  │ - Has HA token (expires ~6h)      │  │
│  │ - Orchestrates AMS delegation     │  │
│  └───────────────────────────────────┘  │
│                  │                       │
│     SSH tunnel   │ (encrypted)           │
│     with HA env  │                       │
│                  ▼                       │
└─────────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────┐
│  AMS (51.15.18.106)                                 │
│  High CPU/RAM, VS Code Server, HA access            │
│  ┌─────────────────────────────────────────────┐   │
│  │  Phase 1: Fable A (Infrastructure)         │   │
│  │  - 30-40 min                               │   │
│  │  - LAYER_0_DETAILED_ANALYSIS.md            │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  Phase 2: Fable B (Projects & Memory)      │   │
│  │  - 40-50 min                               │   │
│  │  - LAYER_1_2_3_INTEGRATION_PLAN.md         │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  Phase 3: Fable C (Neural Layer)           │   │
│  │  - 30-40 min                               │   │
│  │  - LAYER_4_SPECIFICATION.md                │   │
│  │  - KIMI_INTEGRATION_SPEC.md                │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  Phase 4: Fable D (Master Plan Synthesis)  │   │
│  │  - 20-30 min                               │   │
│  │  - MASTER_INTEGRATION_PLAN.md              │   │
│  │  - DEPLOYMENT_ROADMAP.md                   │   │
│  └─────────────────────────────────────────────┘   │
│                  │                                 │
│    Results via   │ (rsync/SCP)                     │
│    SCP tunnel    │                                 │
│                  ▼                                 │
└─────────────────────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────┐
│  Mac (~/.grok/hard-allow/MASTER_FINAL/) │
│  - Integrated results                   │
│  - Master integration plan               │
│  - Deployment roadmap                   │
└─────────────────────────────────────────┘
```

### End-to-End Delegation Flow

```
STEP 1: Mac Prepares Work
  ├─ Collect 150K+ lines (5 input files + grok_history.txt)
  ├─ Create tarball (gzip compression)
  └─ Compute SHA256 checksum

STEP 2: Transfer to AMS
  ├─ rsync via SSH tunnel (SendEnv=HA_TOKEN)
  ├─ AMS verifies SHA256
  └─ Extract tarball locally

STEP 3: AMS Processes (Parallel Phases 1-4)
  ├─ Fable A: infrastructure analysis → LAYER_0_DETAILED_ANALYSIS.md
  ├─ Fable B: project analysis → LAYER_1_2_3_INTEGRATION_PLAN.md
  ├─ Fable C: neural layer → LAYER_4_SPECIFICATION.md + KIMI_INTEGRATION_SPEC.md
  └─ Fable D: synthesis → MASTER_INTEGRATION_PLAN.md + DEPLOYMENT_ROADMAP.md

STEP 4: Checkpoint & Monitor
  ├─ Each Fable writes to PROGRESS.jsonl (append-only)
  ├─ Mac watches progress via SSH (every 30s)
  └─ If phase fails, resume from checkpoint

STEP 5: Transfer Results Back
  ├─ rsync from AMS to Mac (via SCP tunnel)
  ├─ Verify SHA256 of results
  └─ Atomic rename (MASTER_RESULTS → MASTER_FINAL)

STEP 6: Integration
  ├─ Mac reads results from ~/.grok/hard-allow/MASTER_FINAL/
  ├─ Integrates into local master plan
  └─ Archive original tarball
```

### Failure Scenarios & Recovery

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| SSH tunnel drops mid-transfer | rsync times out (30s) | Watchdog reconnects, resumes from byte offset |
| Fable dies mid-phase | PROGRESS.jsonl stops updating (60s) | Resume from last checkpoint (Lamport clock) |
| AMS runs out of disk | rsync fails with "no space" | Stream partial results back, continue from checkpoint |
| HA token expires | Fables get 401 on tool calls | Switch to degraded mode (research-only), queue work locally |
| Mac loses connection for >5m | Watchdog timeout | Abort AMS work, restore from Mac backup, retry |
| Partial results transferred | rsync interrupted | Re-run rsync (--partial mode resumes), verify SHA256 |

---

## Part 2: HA Token Inheritance on AMS

### Token Propagation Mechanism

The HA token on Mac (valid for ~6 hours) is inherited by AMS Fables via SSH environment variable injection. No additional ceremony needed; Fables on AMS use the borrowed token for the duration of the session.

#### SSH Configuration for HA Token Passing

**On Mac**: Configure SSH client to send HA_TOKEN var

```bash
# ~/.ssh/config (add or update)
Host ams
  HostName 51.15.18.106
  User operator
  # Allow SendEnv for HA token
  SendEnv HA_TOKEN GROK_HARD_ALLOW_ACTIVE
  
  # Tunnel settings
  ControlMaster auto
  ControlPath ~/.ssh/ams-%r@%h:%p
  ControlPersist 600
  
  # Compression
  Compression yes
  CompressionLevel 6
```

**On AMS**: Configure SSH server to accept HA env vars

```bash
# /etc/ssh/sshd_config (add to AcceptEnv section)
AcceptEnv HA_TOKEN
AcceptEnv GROK_HARD_ALLOW_ACTIVE
AcceptEnv FABLE_PHASE
```

#### Token Inheritance Protocol

1. **Mac sets token in local environment** (already set by HA session manager)
   ```bash
   echo $HA_TOKEN  # Should output active token (60+ chars)
   ```

2. **SSH invocation with token forwarding**
   ```bash
   ssh -o SendEnv=HA_TOKEN,GROK_HARD_ALLOW_ACTIVE ams "env | grep HA_TOKEN"
   # Output should show token on AMS
   ```

3. **Fables on AMS inherit token from SSH environment**
   ```bash
   # On AMS, inside Fable process:
   const token = process.env.HA_TOKEN;
   // Use token for tool calls (grok, Mem, Tavily, etc.)
   ```

### Scope & Authorization

**HA Grant Inherited by AMS Fables:**
- **Scope**: infra-ops-comms (full nuclear)
- **Capabilities**:
  - grok (all tools): bash, file ops, search, code
  - Mem (create/update notes, collections)
  - Tavily (research)
  - MCP tools (all installed on AMS)
  - Tool use (any tool available via HA token)

**Authorization Window:**
- **Token Expiry**: ~6 hours from issue time on Mac
- **Expected Processing Time**: 2-2.5 hours (1 hour if parallel)
- **Safety Buffer**: 3+ hours remaining after processing completes
- **Fallback if Expired**: Degraded mode (research-only, no destructive tool use)

### Token Refresh Strategy

**Normal Case (token valid during entire AMS processing):**
- No action needed; Fables use borrowed token as-is
- If processing takes >5 hours, token expires mid-phase

**Token Expiry Mid-Processing:**
1. Fable detects 401 error on tool call
2. Logs phase state to PROGRESS.jsonl with reason "TOKEN_EXPIRED"
3. Switches to degraded mode (read-only, no writes)
4. Continues with available data, queues writes for later
5. Transfers partial results back to Mac
6. Mac can refresh token and re-run AMS job (resume from checkpoint)

**Avoid Token Refresh on AMS:**
- Do NOT attempt to refresh token on AMS (no HA session manager there)
- Do NOT store token in config files (security risk)
- Do NOT print token to logs (sanitize logs before transfer)

---

## Part 3: Data Transfer Protocol

### Input Data (Mac → AMS)

#### What to Transfer

**Core input files** (from ~/.grok/hard-allow/):
1. GROK_ARCHITECTURE_EXTRACT.md (~40KB)
2. UNIVERSAL_LIVE_MAPPING.md (~35KB)
3. DEEP_PROJECT_ECOSYSTEM_MAPPING.md (~45KB)
4. COMPLETE_LAYER_AUDIT.md (~55KB)
5. ECOSYSTEM_COHERENCE_VALIDATION.md (~25KB)

**Historical context** (from ~/Desktop/):
6. grok_history.txt (~2MB uncompressed, terminal output)

**Total uncompressed**: ~2.2MB
**Total compressed (gzip)**: ~500KB-700KB
**Time to transfer**: ~5-7 minutes via SSH tunnel

#### Prepare Input Tarball (Mac)

```bash
#!/bin/bash
# Script: prepare-master-plan-input.sh

set -euo pipefail

INPUT_DIR="${HOME}/.grok/hard-allow"
WORK_DIR="/tmp/master-plan-work"
TARBALL="master-plan-input.tar.gz"
CHECKSUM_FILE="master-plan-input.sha256"

# Create work directory
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

# Verify input files exist
echo "[*] Verifying input files..."
for file in \
  "$INPUT_DIR/GROK_ARCHITECTURE_EXTRACT.md" \
  "$INPUT_DIR/UNIVERSAL_LIVE_MAPPING.md" \
  "$INPUT_DIR/DEEP_PROJECT_ECOSYSTEM_MAPPING.md" \
  "$INPUT_DIR/COMPLETE_LAYER_AUDIT.md" \
  "$INPUT_DIR/ECOSYSTEM_COHERENCE_VALIDATION.md"
do
  if [ ! -f "$file" ]; then
    echo "ERROR: Missing $file"
    exit 1
  fi
done

# Include grok history if available
HISTORY_FILE=""
if [ -f "$HOME/Desktop/grok_history.txt" ]; then
  HISTORY_FILE="$HOME/Desktop/grok_history.txt"
  echo "[*] Including grok_history.txt"
fi

# Create tarball
echo "[*] Creating tarball..."
tar -czf "$TARBALL" \
  -C "$INPUT_DIR" \
    GROK_ARCHITECTURE_EXTRACT.md \
    UNIVERSAL_LIVE_MAPPING.md \
    DEEP_PROJECT_ECOSYSTEM_MAPPING.md \
    COMPLETE_LAYER_AUDIT.md \
    ECOSYSTEM_COHERENCE_VALIDATION.md \
  $([ -n "$HISTORY_FILE" ] && echo "-C $(dirname $HISTORY_FILE) $(basename $HISTORY_FILE)" || echo "")

# Verify tarball created
if [ ! -f "$TARBALL" ]; then
  echo "ERROR: Failed to create tarball"
  exit 1
fi

# Compute checksum
echo "[*] Computing checksum..."
sha256sum "$TARBALL" > "$CHECKSUM_FILE"
TARBALL_SIZE=$(du -h "$TARBALL" | awk '{print $1}')
echo "[*] Tarball size: $TARBALL_SIZE"
echo "[*] Checksum: $(cat $CHECKSUM_FILE)"

echo "[*] Input tarball ready: $TARBALL"
```

#### Transfer to AMS via rsync

**Method 1: Direct rsync with SSH env forwarding** (recommended)

```bash
#!/bin/bash
# Script: transfer-to-ams.sh

set -euo pipefail

AMS_HOST="51.15.18.106"
AMS_USER="operator"
AMS_WORK_DIR="/tmp/master-plan-work"
LOCAL_WORK_DIR="/tmp/master-plan-work"

# Verify HA token is set
if [ -z "${HA_TOKEN:-}" ]; then
  echo "ERROR: HA_TOKEN not set. Active HA session required."
  exit 1
fi

# Verify SSH access to AMS
echo "[*] Testing SSH access to AMS..."
ssh -o ConnectTimeout=5 "$AMS_USER@$AMS_HOST" "echo OK" || {
  echo "ERROR: Cannot reach AMS at $AMS_HOST"
  exit 1
}

# Create work directory on AMS
echo "[*] Creating work directory on AMS..."
ssh -o SendEnv=HA_TOKEN "$AMS_USER@$AMS_HOST" "mkdir -p $AMS_WORK_DIR"

# Transfer tarball
echo "[*] Transferring input tarball to AMS (~5-7 min)..."
rsync -avz \
  --rsync-path="ssh -o SendEnv=HA_TOKEN" \
  --partial \
  --progress \
  "$LOCAL_WORK_DIR/master-plan-input.tar.gz" \
  "$AMS_USER@$AMS_HOST:$AMS_WORK_DIR/"

# Transfer checksum
echo "[*] Transferring checksum to AMS..."
rsync -avz \
  --rsync-path="ssh -o SendEnv=HA_TOKEN" \
  "$LOCAL_WORK_DIR/master-plan-input.sha256" \
  "$AMS_USER@$AMS_HOST:$AMS_WORK_DIR/"

# Verify on AMS
echo "[*] Verifying on AMS..."
ssh -o SendEnv=HA_TOKEN "$AMS_USER@$AMS_HOST" \
  "cd $AMS_WORK_DIR && sha256sum -c master-plan-input.sha256" || {
  echo "ERROR: Checksum mismatch on AMS"
  exit 1
}

echo "[*] Transfer complete and verified"
echo "[*] AMS work directory: $AMS_WORK_DIR"
```

**Method 2: SCP with explicit token passing** (if rsync unavailable)

```bash
# Extract and prepare SSH command with HA token
export HA_TOKEN="$(cat ~/.hat2/HA_TOKEN_CACHE)"

# Use scp with ProxyCommand to pass env
scp -o ProxyCommand="ssh -W %h:%p -o SendEnv=HA_TOKEN operator@51.15.18.106" \
  /tmp/master-plan-work/master-plan-input.tar.gz \
  localhost:/tmp/master-plan-work/
```

#### Extraction on AMS

```bash
#!/bin/bash
# Script: extract-input-ams.sh (runs on AMS after transfer)

set -euo pipefail

WORK_DIR="/tmp/master-plan-work"
TARBALL="$WORK_DIR/master-plan-input.tar.gz"

# Verify token inherited
echo "[*] HA_TOKEN on AMS: ${HA_TOKEN:0:20}..."

# Extract tarball
echo "[*] Extracting input tarball on AMS..."
cd "$WORK_DIR"
tar -tzf "$TARBALL" | head -5
tar -xzf "$TARBALL"

# Verify extraction
echo "[*] Extracted files:"
ls -lh "$WORK_DIR"/*.md 2>/dev/null | wc -l
echo " Markdown files extracted"

# Create phase directories
mkdir -p "$WORK_DIR/input" "$WORK_DIR/output" "$WORK_DIR/logs"
mv "$WORK_DIR"/*.md "$WORK_DIR/input/" 2>/dev/null || true

echo "[*] Ready for processing"
```

### Output Data (AMS → Mac)

#### What to Transfer Back

**Results of 4-phase processing** (~500KB total):
1. LAYER_0_DETAILED_ANALYSIS.md (~60KB)
2. LAYER_1_2_3_INTEGRATION_PLAN.md (~80KB)
3. LAYER_4_SPECIFICATION.md (~100KB)
4. KIMI_INTEGRATION_SPEC.md (~80KB)
5. MASTER_INTEGRATION_PLAN.md (~150KB)
6. DEPLOYMENT_ROADMAP.md (~30KB)

**Metadata**:
7. PROGRESS.jsonl (~50KB, append-only progress log)
8. PROCESSING_SUMMARY.json (~10KB)

**Total**: ~500-600KB uncompressed
**Compressed**: ~100-150KB (gzip)
**Time to transfer**: ~3-5 minutes

#### Transfer Results from AMS to Mac

**Method 1: rsync with partial mode** (recommended)

```bash
#!/bin/bash
# Script: transfer-from-ams.sh (runs on Mac)

set -euo pipefail

AMS_HOST="51.15.18.106"
AMS_USER="operator"
AMS_RESULTS_DIR="/tmp/master-plan-work/output"
LOCAL_RESULTS_DIR="${HOME}/.grok/hard-allow/MASTER_RESULTS"

# Create local results directory
mkdir -p "$LOCAL_RESULTS_DIR"

# Transfer results with partial resume capability
echo "[*] Transferring results from AMS (~3-5 min)..."
rsync -avz \
  --rsync-path="ssh -o SendEnv=HA_TOKEN" \
  --partial \
  --progress \
  --delete \
  "$AMS_USER@$AMS_HOST:$AMS_RESULTS_DIR/" \
  "$LOCAL_RESULTS_DIR/"

# Create checksum file for verification
echo "[*] Creating checksum file..."
(cd "$LOCAL_RESULTS_DIR" && sha256sum *.md *.json > SHA256SUMS)

echo "[*] Results transferred to $LOCAL_RESULTS_DIR"
echo "[*] Files:"
ls -lh "$LOCAL_RESULTS_DIR"
```

#### Atomic Rename (Ensure Consistency)

```bash
#!/bin/bash
# Script: finalize-results.sh (runs on Mac after verification)

set -euo pipefail

LOCAL_RESULTS_DIR="${HOME}/.grok/hard-allow/MASTER_RESULTS"
LOCAL_FINAL_DIR="${HOME}/.grok/hard-allow/MASTER_FINAL"

# Verify results directory
if [ ! -d "$LOCAL_RESULTS_DIR" ]; then
  echo "ERROR: Results directory not found: $LOCAL_RESULTS_DIR"
  exit 1
fi

# Verify required files
REQUIRED_FILES=(
  "MASTER_INTEGRATION_PLAN.md"
  "LAYER_0_DETAILED_ANALYSIS.md"
  "LAYER_1_2_3_INTEGRATION_PLAN.md"
  "LAYER_4_SPECIFICATION.md"
  "KIMI_INTEGRATION_SPEC.md"
  "DEPLOYMENT_ROADMAP.md"
)

echo "[*] Verifying output files..."
for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$LOCAL_RESULTS_DIR/$file" ]; then
    echo "ERROR: Missing $file"
    exit 1
  fi
done

# Backup existing final directory (if any)
if [ -d "$LOCAL_FINAL_DIR" ]; then
  BACKUP_DIR="${HOME}/.grok/hard-allow/MASTER_FINAL_$(date +%s)"
  echo "[*] Backing up existing MASTER_FINAL to $BACKUP_DIR"
  mv "$LOCAL_FINAL_DIR" "$BACKUP_DIR"
fi

# Atomic rename (atomic on POSIX systems)
echo "[*] Atomically finalizing results..."
mv "$LOCAL_RESULTS_DIR" "$LOCAL_FINAL_DIR"

echo "[*] Results finalized at $LOCAL_FINAL_DIR"
echo "[*] Files:"
ls -lh "$LOCAL_FINAL_DIR"/*.md
```

### Data Integrity & Verification

#### Checksum Verification Protocol

**On Mac (before transfer to AMS)**:
```bash
cd /tmp/master-plan-work
sha256sum master-plan-input.tar.gz > master-plan-input.sha256
cat master-plan-input.sha256
# Output: abc123def456... master-plan-input.tar.gz
```

**On AMS (after transfer)**:
```bash
cd /tmp/master-plan-work
sha256sum -c master-plan-input.sha256
# Output: master-plan-input.tar.gz: OK
```

**On Mac (after receiving results)**:
```bash
cd ~/.grok/hard-allow/MASTER_RESULTS
# AMS created SHA256SUMS during processing
sha256sum -c SHA256SUMS
# Output: LAYER_0_DETAILED_ANALYSIS.md: OK
#         LAYER_1_2_3_INTEGRATION_PLAN.md: OK
#         ...
```

#### Partial Transfer Resume

If rsync is interrupted:
```bash
# Re-run the same rsync command
# rsync detects partial files and resumes from byte offset
rsync -avz --partial --progress \
  operator@51.15.18.106:/tmp/master-plan-work/output/ \
  ~/.grok/hard-allow/MASTER_RESULTS/

# To verify after resuming:
# - Check file sizes match (use ssh ls -la on AMS)
# - Re-run checksum verification
```

---

## Part 4: Task Coordination on AMS

### Phase Architecture (4 Parallel Fables)

The MASTER_PLAN processing is divided into 4 phases, each handled by a dedicated Fable agent on AMS. Phases can run sequentially or with overlap for parallelization.

#### Phase 1: Infrastructure Analysis (Fable A)

**Duration**: 30-40 minutes
**Input**: GROK_ARCHITECTURE_EXTRACT.md + LAYER_0 data
**Output**: LAYER_0_DETAILED_ANALYSIS.md

**Responsibilities**:
- Analyze jailbroken.tech infrastructure (multi-tenant, HA)
- Map Grok system components (jailbroken-grok, jailbroken-opus, etc.)
- Analyze HA session management (token lifecycle, authorization)
- Document LAYER_0 completeness and gaps
- Identify integration points for MASTER_PLAN

**Key Outputs**:
- Infrastructure topology diagram
- HA system design spec
- Authorization framework mapping
- LAYER_0 gap analysis

#### Phase 2: Project & Memory Analysis (Fable B)

**Duration**: 40-50 minutes
**Input**: DEEP_PROJECT_ECOSYSTEM_MAPPING.md + COMPLETE_LAYER_AUDIT.md + ECOSYSTEM_COHERENCE_VALIDATION.md
**Output**: LAYER_1_2_3_INTEGRATION_PLAN.md

**Responsibilities**:
- Analyze 175 projects (39% mapped, 59% gap)
- Map project dependencies and coherence
- Analyze learning loops (memory, training feedback)
- Identify orphaned projects and unvisited areas
- Design integration across LAYER 1, 2, 3
- Plan memory system enhancements

**Key Outputs**:
- Project ecosystem coherence plan
- Learning loop architecture
- Memory system integration spec
- Gap closure roadmap (59% → 100%)

#### Phase 3: Neural Layer Design (Fable C)

**Duration**: 30-40 minutes
**Input**: ECOSYSTEM_COHERENCE_VALIDATION.md + Kimi/TERMINATOR docs
**Output**: LAYER_4_SPECIFICATION.md + KIMI_INTEGRATION_SPEC.md

**Responsibilities**:
- Design LAYER_4 (live-mapping, neural synthesis)
- Map Kimi integration into neural layer
- Design multi-modal reasoning pipeline
- Analyze TERMINATOR framework integration
- Plan real-time coherence validation
- Design feedback loops from LAYER 4 → LAYER 1-3

**Key Outputs**:
- LAYER_4 architecture spec
- Kimi integration points
- Multi-modal reasoning pipeline
- Live-mapping protocol

#### Phase 4: Master Plan Synthesis (Fable D)

**Duration**: 20-30 minutes
**Input**: Phase 1, 2, 3 outputs + grok_history context
**Output**: MASTER_INTEGRATION_PLAN.md + DEPLOYMENT_ROADMAP.md

**Responsibilities**:
- Synthesize all 4 layers into unified plan
- Resolve cross-layer dependencies
- Design implementation phases (1-5)
- Create deployment roadmap with timelines
- Identify critical path and parallelizable tracks
- Plan validation and testing strategy

**Key Outputs**:
- MASTER_INTEGRATION_PLAN.md (comprehensive spec)
- DEPLOYMENT_ROADMAP.md (phases, timelines, dependencies)
- Risk assessment and mitigation
- Success criteria and validation plan

### Task Coordination Mechanism

#### Lamport Clock & State Ordering

To ensure Fables don't collide on shared state, use Lamport clocks for ordering updates to shared progress file.

```json
{
  "phase": 1,
  "fable_id": "A",
  "lamport_clock": 42,
  "status": "in_progress",
  "step": "Analyzing infrastructure topology",
  "progress_pct": 45,
  "timestamp": "2026-08-06T14:23:15Z",
  "input_lines": 40000,
  "output_lines": 0,
  "memory_used_mb": 256,
  "estimated_completion": "2026-08-06T14:50:00Z"
}
```

**Protocol**:
1. Each Fable reads PROGRESS.jsonl before writing
2. Fable increments its own Lamport clock by max(all clocks) + 1
3. Fable appends line to PROGRESS.jsonl (atomic append on POSIX)
4. No write conflicts; all updates ordered by Lamport clock

#### Checkpoint File Structure

```bash
# /tmp/master-plan-work/PROGRESS.jsonl
# Append-only progress log (one JSON object per line)

{"phase": 0, "status": "started", "timestamp": "2026-08-06T13:00:00Z", "HA_TOKEN": "***masked***", "lamport_clock": 1}
{"phase": 1, "fable_id": "A", "status": "in_progress", "step": "Infrastructure extraction", "progress_pct": 25, "lamport_clock": 2, "timestamp": "2026-08-06T13:15:30Z"}
{"phase": 1, "fable_id": "A", "status": "in_progress", "step": "HA system analysis", "progress_pct": 50, "lamport_clock": 3, "timestamp": "2026-08-06T13:25:00Z"}
{"phase": 1, "fable_id": "A", "status": "complete", "output": "LAYER_0_DETAILED_ANALYSIS.md", "lines": 2400, "lamport_clock": 4, "timestamp": "2026-08-06T13:35:00Z"}
{"phase": 2, "fable_id": "B", "status": "started", "lamport_clock": 5, "timestamp": "2026-08-06T13:36:00Z"}
...
```

#### Phase Completion Markers

After each phase completes, create atomic marker file:

```bash
# On AMS, after Fable A completes
echo "PHASE_1_COMPLETE" > /tmp/master-plan-work/phase1.complete
date +%s >> /tmp/master-plan-work/phase1.complete

# Fable B checks for this before starting
if [ -f /tmp/master-plan-work/phase1.complete ]; then
  echo "Phase 1 complete, starting Phase 2..."
fi
```

### Phase Sequencing & Parallelization

#### Sequential Execution (Safe, Minimal Coordination)

Phases run one after another:
```
Phase 1 (A): 0-40 min
Phase 2 (B): 40-90 min
Phase 3 (C): 90-130 min
Phase 4 (D): 130-160 min
─────────────────────────
TOTAL:       ~160 minutes (~2.7 hours)
```

#### Parallel Execution (Faster, Requires Coordination)

Phases 1-3 can overlap; Phase 4 waits for all:
```
Phase 1 (A): 0-40 min ──────────────────────────────────────┐
                                                              ├─→ Phase 4: 40-70 min
Phase 2 (B): 5-55 min (starts after phase 1 20% complete) ──┤
                                                              ├─→ (Phase 4 synthesis)
Phase 3 (C): 25-65 min (starts after phase 2 20% complete) ─┘
─────────────────────────────────────────────────────────────
TOTAL:       ~70 minutes (1.2 hours)
```

**Coordination for Parallel Execution**:
- Phase 2 waits for phase1.marker before starting (Fable A emits at 20% complete)
- Phase 3 waits for phase2.marker before starting (Fable B emits at 20% complete)
- Phase 4 waits for all markers (phase1.complete, phase2.complete, phase3.complete)

```bash
# On AMS: marker files for phase progression
touch /tmp/master-plan-work/phase1.started
touch /tmp/master-plan-work/phase2.ready  # Fable A emits at 20%
touch /tmp/master-plan-work/phase3.ready  # Fable B emits at 20%
touch /tmp/master-plan-work/phase4.ready  # Fable C emits at completion
```

**Fable B Starting Logic** (waits for Phase 1 signal):
```bash
# On AMS, Fable B startup
TIMEOUT=300  # 5 minutes max wait
START_TIME=$(date +%s)
while [ ! -f /tmp/master-plan-work/phase2.ready ]; do
  ELAPSED=$(($(date +%s) - START_TIME))
  if [ $ELAPSED -gt $TIMEOUT ]; then
    echo "ERROR: Phase 1 not signaling phase2.ready after 5 min"
    exit 1
  fi
  sleep 5
done
echo "Phase 1 signaled ready, starting Phase 2..."
```

### State Management

#### Shared State File (Read-Only for Coordination)

```json
// /tmp/master-plan-work/state.json
{
  "job_id": "master-plan-2026-08-06-130000",
  "mac_host": "c.local",
  "ams_host": "51.15.18.106",
  "HA_TOKEN_prefix": "ams_***",
  "start_time": "2026-08-06T13:00:00Z",
  "phases": {
    "1": {
      "fable": "A",
      "status": "complete",
      "completion_time": "2026-08-06T13:35:00Z",
      "output_file": "LAYER_0_DETAILED_ANALYSIS.md",
      "output_lines": 2400,
      "errors": null
    },
    "2": {
      "fable": "B",
      "status": "in_progress",
      "completion_time": null,
      "output_file": "LAYER_1_2_3_INTEGRATION_PLAN.md",
      "output_lines": null,
      "errors": null
    },
    "3": {
      "fable": "C",
      "status": "waiting",
      "completion_time": null,
      "output_file": "LAYER_4_SPECIFICATION.md",
      "output_lines": null,
      "errors": null
    },
    "4": {
      "fable": "D",
      "status": "waiting",
      "completion_time": null,
      "output_file": "MASTER_INTEGRATION_PLAN.md",
      "output_lines": null,
      "errors": null
    }
  }
}
```

---

## Part 5: Failure Recovery & Resilience

### Checkpoint Strategy

After each significant milestone, save state to allow resume from checkpoint.

#### Checkpoint Creation (Per Fable)

```bash
# On AMS, Fable A creates checkpoint every 10% progress

checkpoint_phase1_0() {
  # After extracting infrastructure data
  tar czf /tmp/master-plan-work/checkpoints/phase1_step0.tar.gz \
    /tmp/master-plan-work/input/*.md \
    /tmp/master-plan-work/phase1_extracted_data.json
  echo "Checkpoint: phase1_step0"
}

checkpoint_phase1_1() {
  # After analyzing HA system
  tar czf /tmp/master-plan-work/checkpoints/phase1_step1.tar.gz \
    /tmp/master-plan-work/phase1_ha_analysis.json \
    /tmp/master-plan-work/phase1_topology.md
  echo "Checkpoint: phase1_step1"
}

checkpoint_phase1_final() {
  # Before writing output
  cp /tmp/master-plan-work/LAYER_0_DETAILED_ANALYSIS.md \
     /tmp/master-plan-work/checkpoints/phase1_final.md
  echo "Checkpoint: phase1_final"
}
```

#### Checkpoint Index

```json
// /tmp/master-plan-work/checkpoints/INDEX.json
{
  "phase": 1,
  "checkpoints": [
    {
      "name": "phase1_step0",
      "timestamp": "2026-08-06T13:15:00Z",
      "description": "Infrastructure data extracted",
      "file": "phase1_step0.tar.gz",
      "size_kb": 1200
    },
    {
      "name": "phase1_step1",
      "timestamp": "2026-08-06T13:25:00Z",
      "description": "HA system analysis complete",
      "file": "phase1_step1.tar.gz",
      "size_kb": 800
    },
    {
      "name": "phase1_final",
      "timestamp": "2026-08-06T13:35:00Z",
      "description": "Phase 1 complete, output ready",
      "file": "phase1_final.md",
      "size_kb": 150
    }
  ]
}
```

### Resume Protocol

If a Fable dies or is interrupted:

#### 1. Detect Failure (Watchdog on Mac)

```bash
#!/bin/bash
# On Mac: monitor AMS health

AMS_HOST="51.15.18.106"
AMS_USER="operator"

while true; do
  # Check if AMS is responsive
  ssh -o ConnectTimeout=5 "$AMS_USER@$AMS_HOST" "echo OK" && {
    # Check if PROGRESS.jsonl is being updated
    LAST_UPDATE=$(ssh "$AMS_USER@$AMS_HOST" \
      "stat -f %m /tmp/master-plan-work/PROGRESS.jsonl 2>/dev/null || echo 0")
    NOW=$(date +%s)
    DIFF=$((NOW - LAST_UPDATE))
    
    if [ $DIFF -gt 60 ]; then
      echo "WARNING: PROGRESS.jsonl not updated for 60s (possible hang)"
      # Trigger recovery (see below)
    fi
  } || {
    echo "ERROR: AMS unreachable"
    # Trigger recovery
  }
  
  sleep 30
done
```

#### 2. Determine Last Checkpoint

```bash
# On Mac: query AMS for last valid checkpoint
ssh -o SendEnv=HA_TOKEN "$AMS_USER@$AMS_HOST" \
  "tail -1 /tmp/master-plan-work/PROGRESS.jsonl | jq .lamport_clock"
# Output: 15

# Identify corresponding checkpoint
ssh "$AMS_USER@$AMS_HOST" \
  "jq '.[] | select(.lamport_clock <= 15) | .checkpoint_name' \
   /tmp/master-plan-work/checkpoints/INDEX.json | tail -1"
# Output: "phase1_step1"
```

#### 3. Resume from Checkpoint

```bash
#!/bin/bash
# On AMS: resume-master-plan.sh

CHECKPOINT_NAME="$1"  # e.g., "phase1_step1"
WORK_DIR="/tmp/master-plan-work"

# Restore from checkpoint
echo "[*] Resuming from checkpoint: $CHECKPOINT_NAME"
tar -xzf "$WORK_DIR/checkpoints/${CHECKPOINT_NAME}.tar.gz" -C "$WORK_DIR"

# Update PROGRESS.jsonl to mark resume
echo "{\"checkpoint_resume\": \"$CHECKPOINT_NAME\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
  >> "$WORK_DIR/PROGRESS.jsonl"

# Re-launch Fable from checkpoint
export HA_TOKEN="$HA_TOKEN"
export FABLE_CHECKPOINT="$CHECKPOINT_NAME"
fable-master-plan-phase1 --resume
```

### Network Resilience

#### SSH Tunnel Watchdog (Mac)

Monitors SSH tunnel; auto-reconnects on drop:

```bash
#!/bin/bash
# On Mac: ssh-tunnel-watchdog.sh

AMS_HOST="51.15.18.106"
AMS_USER="operator"
PING_INTERVAL=30
TIMEOUT=300

while true; do
  # Test SSH connectivity
  if ssh -o ConnectTimeout=5 "$AMS_USER@$AMS_HOST" "echo OK" >/dev/null 2>&1; then
    echo "[OK] SSH tunnel to AMS alive"
    LAST_OK=$(date +%s)
  else
    NOW=$(date +%s)
    DOWNTIME=$((NOW - ${LAST_OK:-0}))
    
    if [ $DOWNTIME -gt $TIMEOUT ]; then
      echo "[ERROR] SSH tunnel down for $DOWNTIME seconds (>5 min)"
      echo "[ERROR] Aborting AMS work"
      ssh "$AMS_USER@$AMS_HOST" "pkill -f fable-master-plan" || true
      exit 1
    else
      echo "[WARN] SSH tunnel down for $DOWNTIME seconds, retrying..."
    fi
  fi
  
  sleep $PING_INTERVAL
done
```

#### Partial Transfer Resume (rsync)

If rsync drops during data transfer:

```bash
# Re-run the same command; rsync picks up from byte offset
rsync -avz --partial --progress \
  operator@51.15.18.106:/tmp/master-plan-work/output/ \
  ~/.grok/hard-allow/MASTER_RESULTS/

# rsync detects:
# - Partial files on target (continues from byte offset)
# - Newer files on source (skips)
# Verifies via timestamp + size
```

### Disk Space Management

#### Pre-Flight Checks

```bash
#!/bin/bash
# On AMS: check-disk-space.sh

WORK_DIR="/tmp/master-plan-work"
REQUIRED_MB=500

AVAILABLE_MB=$(df "$WORK_DIR" | awk 'NR==2 {print int($4/1024)}')
REQUIRED_MB=500

if [ $AVAILABLE_MB -lt $REQUIRED_MB ]; then
  echo "ERROR: Only ${AVAILABLE_MB}MB available, need ${REQUIRED_MB}MB"
  exit 1
fi

echo "Disk space OK: ${AVAILABLE_MB}MB available"
```

#### Streaming Partial Results (If Disk Low)

If AMS runs out of disk mid-processing:

```bash
#!/bin/bash
# On AMS: stream-partial-results.sh

WORK_DIR="/tmp/master-plan-work"
OUTPUT_DIR="$WORK_DIR/output"
LOCAL_RESULTS_DIR="${HOME}/.grok/hard-allow/MASTER_RESULTS_PARTIAL"

# Create directory on Mac
ssh -o SendEnv=HA_TOKEN operator@mac.local "mkdir -p $LOCAL_RESULTS_DIR"

# Stream completed files back to Mac
for file in "$OUTPUT_DIR"/*.md; do
  [ -f "$file" ] && \
    scp -o SendEnv=HA_TOKEN "$file" "operator@mac.local:$LOCAL_RESULTS_DIR/"
done

# Log partial transfer
echo "Partial results streamed to Mac at $(date)" >> "$WORK_DIR/PROGRESS.jsonl"
```

### Graceful Abort & Cleanup

If operator requests abort (e.g., HA token expired):

```bash
#!/bin/bash
# On Mac: abort-master-plan.sh

echo "[*] Aborting AMS work..."

# Signal AMS to stop
ssh -o SendEnv=HA_TOKEN operator@51.15.18.106 \
  "pkill -TERM -f fable-master-plan"

# Wait for graceful shutdown (30s)
sleep 30

# Force kill if needed
ssh operator@51.15.18.106 "pkill -KILL -f fable-master-plan" || true

# Collect partial results (if any)
echo "[*] Collecting partial results..."
rsync -avz --partial \
  operator@51.15.18.106:/tmp/master-plan-work/output/ \
  ~/.grok/hard-allow/MASTER_RESULTS_PARTIAL/ || true

# Backup progress log
ssh operator@51.15.18.106 "cat /tmp/master-plan-work/PROGRESS.jsonl" \
  > ~/.grok/hard-allow/MASTER_PROGRESS_ABORT_$(date +%s).jsonl

# Clean up on AMS
ssh operator@51.15.18.106 "rm -rf /tmp/master-plan-work"

echo "[*] Abort complete. Partial results in MASTER_RESULTS_PARTIAL/"
echo "[*] Progress log backed up."
```

---

## Part 6: Monitoring & Status

### Real-Time Progress Monitoring (Mac)

#### Watch PROGRESS.jsonl (Live)

```bash
#!/bin/bash
# On Mac: monitor-progress.sh

AMS_HOST="51.15.18.106"
AMS_USER="operator"
PROGRESS_FILE="/tmp/master-plan-work/PROGRESS.jsonl"

watch -n 5 "ssh -o SendEnv=HA_TOKEN $AMS_USER@$AMS_HOST \
  'tail -20 $PROGRESS_FILE | jq -c \"{phase, fable_id, status, progress_pct, timestamp}\"'"
```

#### Resource Usage Monitoring (AMS)

```bash
#!/bin/bash
# On AMS: monitor-resources.sh (auto-logs to PROGRESS.jsonl)

while true; do
  # CPU usage
  CPU_USAGE=$(top -bn1 -p $$ | awk 'NR>7 {sum+=$9} END {print int(sum)}')
  
  # Memory usage
  MEMORY_MB=$(ps aux | grep fable-master-plan | awk '{sum+=$6} END {print int(sum/1024)}')
  
  # Disk usage
  DISK_USED_MB=$(du -s /tmp/master-plan-work | awk '{print int($1/1024)}')
  DISK_AVAIL_MB=$(df /tmp/master-plan-work | awk 'NR==2 {print int($4/1024)}')
  
  # Append to progress log
  echo "{\"type\": \"resource_snapshot\", \"cpu_pct\": $CPU_USAGE, \"memory_mb\": $MEMORY_MB, \"disk_used_mb\": $DISK_USED_MB, \"disk_avail_mb\": $DISK_AVAIL_MB, \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
    >> /tmp/master-plan-work/PROGRESS.jsonl
  
  sleep 30
done
```

#### Summary Report (After Completion)

```bash
#!/bin/bash
# On Mac: generate-summary.sh (after all phases complete)

AMS_HOST="51.15.18.106"
AMS_USER="operator"

echo "=== MASTER_PLAN Processing Summary ==="
echo ""

# Count output files
FILE_COUNT=$(ssh "$AMS_USER@$AMS_HOST" \
  "ls -1 /tmp/master-plan-work/output/*.md 2>/dev/null | wc -l")
echo "Output files: $FILE_COUNT"

# Total output lines
TOTAL_LINES=$(ssh "$AMS_USER@$AMS_HOST" \
  "wc -l /tmp/master-plan-work/output/*.md 2>/dev/null | tail -1 | awk '{print \$1}'")
echo "Total output lines: $TOTAL_LINES"

# Processing time
START_TIME=$(ssh "$AMS_USER@$AMS_HOST" \
  "jq -s '.[0].timestamp' /tmp/master-plan-work/PROGRESS.jsonl")
END_TIME=$(ssh "$AMS_USER@$AMS_HOST" \
  "jq -s '.[-1].timestamp' /tmp/master-plan-work/PROGRESS.jsonl")
echo "Start: $START_TIME"
echo "End:   $END_TIME"

# Phase completion
ssh "$AMS_USER@$AMS_HOST" \
  "jq -s '.[] | select(.status==\"complete\") | {phase, fable_id, completion_time}' \
   /tmp/master-plan-work/PROGRESS.jsonl" | jq .

echo ""
echo "Status: SUCCESS"
```

### Logs & Diagnostics

#### Per-Fable Logs (AMS)

```bash
# /tmp/master-plan-work/logs/fable-A.log
[2026-08-06T13:00:00Z] Starting Phase 1 (Infrastructure Analysis)
[2026-08-06T13:00:05Z] HA_TOKEN inherited from Mac: ams_***
[2026-08-06T13:00:10Z] Reading GROK_ARCHITECTURE_EXTRACT.md (40 KB)
[2026-08-06T13:15:30Z] Extracted infrastructure topology (45% complete)
[2026-08-06T13:25:00Z] HA system analysis complete (80% complete)
[2026-08-06T13:35:00Z] LAYER_0_DETAILED_ANALYSIS.md written (2400 lines)
[2026-08-06T13:35:05Z] Phase 1 complete
```

#### Centralized Progress Log (JSONL Format)

```jsonl
{"timestamp": "2026-08-06T13:00:00Z", "event": "job_start", "mac_host": "c.local", "ams_host": "51.15.18.106"}
{"timestamp": "2026-08-06T13:00:05Z", "phase": 1, "fable": "A", "event": "phase_start"}
{"timestamp": "2026-08-06T13:00:10Z", "phase": 1, "fable": "A", "event": "reading_input", "file": "GROK_ARCHITECTURE_EXTRACT.md", "size_kb": 40}
{"timestamp": "2026-08-06T13:15:30Z", "phase": 1, "fable": "A", "event": "progress", "step": "Infrastructure extraction", "pct": 45, "memory_mb": 256}
{"timestamp": "2026-08-06T13:35:00Z", "phase": 1, "fable": "A", "event": "phase_complete", "output_file": "LAYER_0_DETAILED_ANALYSIS.md", "output_lines": 2400}
{"timestamp": "2026-08-06T13:36:00Z", "phase": 2, "fable": "B", "event": "phase_start"}
...
{"timestamp": "2026-08-06T14:50:00Z", "phase": 4, "fable": "D", "event": "phase_complete", "output_file": "MASTER_INTEGRATION_PLAN.md"}
{"timestamp": "2026-08-06T14:50:05Z", "event": "job_complete", "total_time_minutes": 110, "total_output_lines": 12500}
```

---

## Part 7: Performance Estimates

### Processing Time Breakdown

**Sequential Execution** (phases run one after another):

| Phase | Fable | Task | Duration | Output Size |
|-------|-------|------|----------|-------------|
| 1 | A | Infrastructure Analysis | 30-40 min | ~60KB |
| 2 | B | Project & Memory | 40-50 min | ~80KB |
| 3 | C | Neural Layer | 30-40 min | ~180KB |
| 4 | D | Synthesis | 20-30 min | ~150KB |
| **Total** | | | **120-160 min (2-2.7 hr)** | **~500KB** |

**Parallel Execution** (phases overlap after 20% complete):

| Timeline | Phase | Duration | Cumulative |
|----------|-------|----------|------------|
| 0-40 min | Phase 1 | 40 min | 40 min |
| 5-55 min | Phase 2 (starts at 5 min) | 50 min | 55 min |
| 25-65 min | Phase 3 (starts at 25 min) | 40 min | 65 min |
| 65-95 min | Phase 4 (waits for 1-3) | 30 min | 95 min |
| **Total** | | | **95 min (1.6 hr)** | |

### Data Transfer Times

| Operation | Size | Transfer Time | Notes |
|-----------|------|---------------|----|
| Input tarball (Mac → AMS) | 200MB | 10-15 min | Compressed 60-70% |
| Input extraction (AMS) | - | 1-2 min | Untar + setup |
| Results (AMS → Mac) | 500KB | 3-5 min | Compressed, small |
| **Total Transfer** | | **15-22 min** | Dominates network time |

### Total Wall-Clock Time (Sequential)

```
Setup:                     5 min
Transfer to AMS:           10-15 min
Processing (phases 1-4):   120-160 min
Transfer back:             3-5 min
Finalization:              5 min
─────────────────────────────────
TOTAL:                     143-190 min (2.4-3.2 hours)
```

### Total Wall-Clock Time (Parallel + Optimized)

```
Setup:                     5 min
Transfer to AMS:           10-15 min
Processing (phases overlap): 95 min
Transfer back:             3-5 min
Finalization:              5 min
─────────────────────────────────
TOTAL:                     118-125 min (2-2.1 hours)
```

### Resource Requirements

**On AMS**:
- CPU: 4 cores (can run up to 4 Fables in parallel)
- Memory: 4GB minimum (2GB per active Fable)
- Disk: 1GB (/tmp work space, temporary)
- Network: 100 Mbps+ (10-15 min for 200MB transfer)

**On Mac**:
- Disk: 1GB (~500MB tarball, ~500MB results)
- Memory: 2GB (for orchestration + monitoring)
- Network: Same 100 Mbps+

---

## Part 8: Implementation Checklist

### Pre-Execution Checklist

**HA Setup (Mac)**:
- [ ] Verify HA token active: `echo $HA_TOKEN | wc -c` (should be >60 chars)
- [ ] Verify token expiry: `echo $HA_TOKEN | jq .exp` (should be 6+ hours in future)
- [ ] Verify GROK_HARD_ALLOW_ACTIVE=1: `echo $GROK_HARD_ALLOW_ACTIVE`
- [ ] Confirm infra-ops-comms grant active: `grok --hard-allow && grok --grant-status`

**Network Setup (Mac)**:
- [ ] Test SSH to AMS: `ssh -o ConnectTimeout=5 operator@51.15.18.106 "echo OK"`
- [ ] Configure SSH for env forwarding: `grep -A3 "^Host ams" ~/.ssh/config`
- [ ] Verify SSH key loaded: `ssh-add -l | grep rsa` (should show key)
- [ ] Verify rsync installed: `rsync --version | head -1`

**Input Files (Mac)**:
- [ ] GROK_ARCHITECTURE_EXTRACT.md exists: `ls ~/.grok/hard-allow/GROK_ARCHITECTURE_EXTRACT.md`
- [ ] UNIVERSAL_LIVE_MAPPING.md exists
- [ ] DEEP_PROJECT_ECOSYSTEM_MAPPING.md exists
- [ ] COMPLETE_LAYER_AUDIT.md exists
- [ ] ECOSYSTEM_COHERENCE_VALIDATION.md exists
- [ ] grok_history.txt exists (optional): `ls ~/Desktop/grok_history.txt`

**AMS Setup (Remote)**:
- [ ] SSH access confirmed: `ssh operator@51.15.18.106 "uname -a"`
- [ ] /tmp available and writable: `ssh operator@51.15.18.106 "touch /tmp/test.txt && rm /tmp/test.txt"`
- [ ] 500MB+ disk available: `ssh operator@51.15.18.106 "df /tmp | awk 'NR==2 {print \$4}'"`
- [ ] 4GB+ RAM available: `ssh operator@51.15.18.106 "free -h | grep Mem"`
- [ ] HA token env accepted: `ssh -o SendEnv=HA_TOKEN operator@51.15.18.106 "echo \$HA_TOKEN | wc -c"`

**Local Backup (Mac)**:
- [ ] Backup existing MASTER_* files: `mv ~/.grok/hard-allow/MASTER_* ~/.grok/hard-allow/MASTER_BACKUP_$(date +%s)/`
- [ ] Confirm backup complete: `ls -la ~/.grok/hard-allow/MASTER_BACKUP_*/`

### Execution Checklist

**Phase 0: Prepare Work** (Mac)
- [ ] Run prepare-master-plan-input.sh
- [ ] Verify tarball created: `ls -lh /tmp/master-plan-work/master-plan-input.tar.gz`
- [ ] Verify checksum: `cat /tmp/master-plan-work/master-plan-input.sha256`

**Phase 1: Transfer to AMS**
- [ ] Run transfer-to-ams.sh
- [ ] Verify on AMS: `ssh operator@51.15.18.106 "ls -lh /tmp/master-plan-work/"`
- [ ] Verify checksum on AMS: `ssh operator@51.15.18.106 "cd /tmp/master-plan-work && sha256sum -c master-plan-input.sha256"`

**Phase 2: Extract on AMS**
- [ ] Run extract-input-ams.sh (via SSH)
- [ ] Verify extraction: `ssh operator@51.15.18.106 "ls -lh /tmp/master-plan-work/input/"`
- [ ] Verify HA token inherited: `ssh -o SendEnv=HA_TOKEN operator@51.15.18.106 "echo \$HA_TOKEN | head -c20; echo ..."`

**Phase 3: Launch Fables on AMS**
- [ ] Launch Phase 1 (Fable A): `ssh -o SendEnv=HA_TOKEN operator@51.15.18.106 "nohup fable-master-plan-phase1 > /tmp/master-plan-work/logs/fable-A.log 2>&1 &"`
- [ ] Verify Fable A started: `ssh operator@51.15.18.106 "ps aux | grep fable-master-plan-phase1"`
- [ ] Monitor Phase 1 progress (5-10 min, 0-50%): `watch -n 5 "ssh operator@51.15.18.106 'tail -5 /tmp/master-plan-work/PROGRESS.jsonl'"`

**Phase 4: Parallel Phases 2-3** (optional, for faster completion)
- [ ] After Phase 1 reaches 20%: Launch Phase 2 (Fable B)
- [ ] After Phase 2 reaches 20%: Launch Phase 3 (Fable C)
- [ ] All running in parallel; monitor each via separate terminal

**Phase 5: Monitor All Phases**
- [ ] Run monitor-progress.sh (continuous watch)
- [ ] Run monitor-resources.sh (on AMS, background)
- [ ] Watch for errors in logs: `ssh operator@51.15.18.106 "tail -f /tmp/master-plan-work/logs/*.log"`

**Phase 6: Completion & Transfer**
- [ ] Confirm Phase 4 complete: `ssh operator@51.15.18.106 "tail -1 /tmp/master-plan-work/PROGRESS.jsonl | jq .status"`
- [ ] Run transfer-from-ams.sh
- [ ] Verify on Mac: `ls -lh ~/.grok/hard-allow/MASTER_RESULTS/`
- [ ] Verify checksums: `cd ~/.grok/hard-allow/MASTER_RESULTS && sha256sum -c SHA256SUMS`

**Phase 7: Finalize Results**
- [ ] Run finalize-results.sh
- [ ] Verify atomic rename: `ls -la ~/.grok/hard-allow/ | grep MASTER_FINAL`
- [ ] Verify output files: `ls -lh ~/.grok/hard-allow/MASTER_FINAL/*.md`

### Post-Execution Checklist

**Verification**:
- [ ] All 6 output files present in MASTER_FINAL/
- [ ] All files readable (not corrupted): `head -20 MASTER_INTEGRATION_PLAN.md`
- [ ] No errors in PROGRESS.jsonl: `jq '.[] | select(.status=="error")' PROGRESS.jsonl`
- [ ] Total output lines >=12,000: `wc -l MASTER_FINAL/*.md | tail -1`

**Archival**:
- [ ] Backup PROGRESS.jsonl: `cp ~/.grok/hard-allow/PROGRESS.jsonl ~/.grok/hard-allow/PROGRESS_ARCHIVE_$(date +%s).jsonl`
- [ ] Archive input tarball: `mv /tmp/master-plan-work/master-plan-input.tar.gz ~/.grok/hard-allow/MASTER_INPUT_$(date +%s).tar.gz`
- [ ] Cleanup on AMS: `ssh operator@51.15.18.106 "rm -rf /tmp/master-plan-work"`

**Integration**:
- [ ] Read MASTER_INTEGRATION_PLAN.md: `cat ~/.grok/hard-allow/MASTER_FINAL/MASTER_INTEGRATION_PLAN.md`
- [ ] Review DEPLOYMENT_ROADMAP.md: `cat ~/.grok/hard-allow/MASTER_FINAL/DEPLOYMENT_ROADMAP.md`
- [ ] Integrate into local master plan (app-specific)

---

## Part 9: Rollback & Error Handling

### Rollback to Previous Master Plan (If Issues Found)

```bash
#!/bin/bash
# On Mac: rollback-master-plan.sh

BACKUP_DIR=$(ls -dtr ~/.grok/hard-allow/MASTER_BACKUP_* | tail -1)

if [ -z "$BACKUP_DIR" ]; then
  echo "ERROR: No backup found"
  exit 1
fi

echo "[*] Rolling back to $BACKUP_DIR"
rm -rf ~/.grok/hard-allow/MASTER_FINAL
mv "$BACKUP_DIR" ~/.grok/hard-allow/MASTER_FINAL

echo "[*] Rollback complete"
```

### Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot reach AMS at 51.15.18.106` | SSH connection failed | `ssh operator@51.15.18.106 "echo OK"` to debug |
| `HA_TOKEN not set` | Token not inherited by SSH | Verify `SendEnv HA_TOKEN` in ~/.ssh/config |
| `Checksum mismatch on AMS` | Tarball corrupted in transit | Re-run transfer-to-ams.sh with --partial |
| `Disk space full on AMS` | /tmp ran out | Run stream-partial-results.sh, then cleanup |
| `Fable A hung (no progress 60s+)` | Process crash or deadlock | `ssh operator@51.15.18.106 "pkill -TERM -f fable-master-plan-phase1"` then resume from checkpoint |
| `Results not transferred` | rsync failed mid-transfer | Re-run transfer-from-ams.sh (rsync --partial will resume) |
| `HA token expired` | Processing took >6 hours | Abort (see graceful abort), refresh token on Mac, re-run AMS job from checkpoint |

### Debug Commands

```bash
# Check HA token validity
$ echo $HA_TOKEN | jq .exp
1691433600  # Unix timestamp; check if > now

# Check PROGRESS.jsonl for errors
$ ssh operator@51.15.18.106 \
  "jq '.[] | select(.status==\"error\" or .status==\"failed\")' /tmp/master-plan-work/PROGRESS.jsonl"

# Check disk usage on AMS
$ ssh operator@51.15.18.106 "du -sh /tmp/master-plan-work/"

# Check memory usage (Fables)
$ ssh operator@51.15.18.106 "ps aux | grep fable-master-plan | awk '{print \$6}' | paste -sd+ | bc"

# Tail all logs
$ ssh operator@51.15.18.106 "tail -f /tmp/master-plan-work/logs/*.log"

# Check SSH tunnel status
$ ssh -o ConnectTimeout=5 operator@51.15.18.106 "uptime"
```

---

## Part 10: Security Considerations

### HA Token Security

**Do NOT**:
- Print full token to console (will appear in shell history)
- Commit token to version control
- Email or Slack the token
- Log token to files

**Do**:
- Mask token in logs: `${HA_TOKEN:0:20}...`
- Expire token immediately after MASTER_PLAN completes
- Use token only for authorized scope (infra-ops-comms)
- Monitor token usage via `grok --grant-status`

### SSH Key Security

**Ensure**:
- SSH key has passphrase (`ssh-keygen -p`)
- Key is not world-readable (`chmod 600 ~/.ssh/id_rsa`)
- SSH key forwarding disabled in ~/.ssh/config (`ForwardAgent no`)

### AMS Access Control

**Limit**:
- SSH access to AMS restricted to authorized users (firewall rules)
- /tmp/master-plan-work directory readable only by operator user
- No other users on AMS during processing (single-tenant session)

### Data Privacy

**Ensure**:
- Input files (grok_history, architecture docs) are confidential
- Results (MASTER_PLAN docs) are not shared externally
- Checksum files computed locally (not sent to untrusted systems)
- PROGRESS.jsonl sanitized before sharing (redact HA_TOKEN_prefix)

---

## Part 11: Dependency Assumptions

### Software Requirements

**On Mac**:
- SSH client (built-in on macOS)
- rsync (often pre-installed; `brew install rsync` if needed)
- jq (for JSON parsing; `brew install jq`)
- bash 4+ (or zsh with bash compatibility)

**On AMS**:
- SSH server (sshd running and configured)
- bash 4+ shell
- VS Code Server with HA integration
- Fable agent runtime (capable of running Claude Code agents)
- jq (for JSON processing)
- tar, gzip (for compression/extraction)

### Network Requirements

- SSH tunnel between Mac (client) and AMS (server)
- 100 Mbps+ network connectivity (for 200MB transfer)
- Port 22 (SSH) open on AMS
- No proxy/firewall blocking SSH to 51.15.18.106

### HA Requirements

- Active HA token on Mac (from ~/.hat2 session manager)
- HA session manager running (`node ~/.hat2/scripts/claude-ha-status.mjs` returns OK)
- Fable agent runtime capable of tool use (grok, Mem, Tavily, etc.)
- infra-ops-comms grant active in HA token

---

## Part 12: Future Enhancements

### Potential Improvements

1. **Incremental Processing**: If input updates mid-execution, queue delta for processing
2. **Dynamic Load Balancing**: Auto-scale Fable count based on AMS CPU/memory
3. **Caching Results**: Save phase outputs to persistent cache; skip re-runs if unchanged
4. **Web Dashboard**: Real-time monitoring UI for PROGRESS.jsonl
5. **Multi-AMS Delegation**: Distribute phases across multiple AMS instances
6. **Result Merging**: If multiple jobs run in parallel, merge results intelligently

### Monitoring Enhancements

- Prometheus metrics export (CPU, memory, progress %)
- Grafana dashboard for visualization
- Slack notifications for phase completion/failures
- Email digest of processing summary

---

## Status & Next Steps

### DELEGATION ARCHITECTURE SPEC: COMPLETE

This document specifies the complete remote delegation architecture for MASTER_PLAN_ARCHITECT processing on AMS. The design covers:

✅ End-to-end delegation flow (Mac → AMS → Mac)
✅ HA token inheritance via SSH env vars
✅ Data transfer protocol (tarball, rsync, checksums)
✅ Task coordination (4 parallel Fables, Lamport clocks)
✅ Failure recovery (checkpoints, resume, network resilience)
✅ Performance estimates (2-2.7 hours sequential, 1.6 hours parallel)
✅ Implementation checklist (pre-, execution, post)
✅ Security considerations & best practices
✅ Error handling & debugging guide

### Ready for Next Phase

Awaiting **AMS_ACCESS_CREDENTIALS.md** from parallel extraction task, which will provide:
- SSH private key path (for operator@51.15.18.106)
- AMS hostname/IP verification
- SSH config snippet for ~/.ssh/config
- Pre-configured HA environment on AMS

Once credentials received, execution can proceed immediately with:
1. Run prepare-master-plan-input.sh (creates input tarball)
2. Run transfer-to-ams.sh (transfers with HA token)
3. Launch Fable A-D on AMS (via SSH with inherited token)
4. Monitor progress in real-time (watch PROGRESS.jsonl)
5. Transfer results back (rsync with atomic rename)
6. Integrate into local master plan

---

**Document Version**: 1.0 (Final)
**Last Updated**: 2026-08-06
**Status**: READY FOR EXECUTION
**Author**: Fable B (HAT2_OPUS5_SESSION_OK)
