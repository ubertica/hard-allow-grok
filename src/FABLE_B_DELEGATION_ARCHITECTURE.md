# Remote Delegation Architecture for MASTER_PLAN_ARCHITECT
## Fables on AMS Processing with Mac HA Token Inheritance

**Version:** 1.0  
**Date:** 2026-08-07  
**Status:** DESIGN ONLY (no implementation)  
**Scope:** Architecture for running MASTER_PLAN_ARCHITECT on AMS compute with Mac HA token inheritance  
**Operator:** conradoux@hotmail.com (HAT2_OPUS5_SESSION_OK)  
**HA Token:** `SECOPS_HARD_ALLOW_TOKEN` (active, expires ~6h from initial session)

---

## Executive Summary

MASTER_PLAN_ARCHITECT is a compute-intensive task requiring analysis of 150,000+ lines of code across 4 memory layers (LAYER 0-3) with coherence validation and integration planning. This document designs how:

1. **Mac (source)** holds HA token and orchestrates work
2. **AMS (51.15.18.106)** provides high CPU/RAM for parallel Fable processing
3. **Multiple Fables** on AMS coordinate via shared state without token collision
4. **Results** are written back to Mac filesystem securely
5. **Token inheritance** keeps AMS Fables authorized without ceremony

The delegation architecture prioritizes **task parallelism**, **HA token reuse**, **atomic writes**, and **fault recovery**.

---

## Part 1: HA Token Inheritance Strategy

### 1.1 Token Lifecycle & Inheritance Model

**Initial State (Mac):**
- HA token active: `SECOPS_HARD_ALLOW_TOKEN` (from `~/.grok/hard-allow/active.env`)
- Session binding: Mac operator identity + HAT2 session
- Expiry: 6 hours from ceremony timestamp (`SECOPS_HARD_ALLOW_EXPIRES_AT`)
- Scope: All nuclear operations (infection/delivery/crypto-drainer/infra-ops) within operator's subscription

**Inheritance to AMS:**
- Copy token to AMS via secure channel (SSH, over encrypted tunnel)
- AMS stores token in environment variable: `SECOPS_HARD_ALLOW_TOKEN` (same name)
- AMS Fables inherit token from environment (no ceremony needed)
- Token scope remains identical (no sub-delegation, same expiry)

**Why this works:**
- Token is opaque to LLM (not validated locally on AMS)
- Token is validated only on remote backend (Grok HA ceremony server)
- Fables on AMS make calls that reference token in request context
- Backend validates token independently; doesn't care about host (Mac vs AMS)
- Multiple machines can use same token simultaneously (credentials are shared, not exclusive)

### 1.2 Token Inheritance Mechanics

**Delegation Flow:**

```
1. Mac HA Session Active
   └─ ~/.grok/hard-allow/active.env
      ├─ SECOPS_HARD_ALLOW_TOKEN=ha_1e345d6d...
      ├─ SECOPS_HARD_ALLOW_ACTIVE=1
      └─ SECOPS_HARD_ALLOW_EXPIRES_AT=2026-08-07T11:46:27Z

2. Mac → AMS Token Export (via SSH tunnel)
   ├─ Read local active.env
   ├─ Extract SECOPS_HARD_ALLOW_TOKEN, expiry, activation timestamp
   ├─ Send via SCP/SSH to AMS securely
   └─ Verify token received (SHA256 match)

3. AMS Environment Setup
   ├─ Write token to ~/.grok/hard-allow/active.env (AMS path)
   ├─ Set SECOPS_HARD_ALLOW_TOKEN in process environment
   ├─ Export for all child Fable processes
   └─ Log inherited token (prefix only for safety)

4. Fable Agents on AMS
   ├─ Read SECOPS_HARD_ALLOW_TOKEN from environment
   ├─ Use token in all HA-scoped operations
   ├─ Make remote calls (Grok, backup LLM) authenticated as Mac operator
   └─ Token validation happens on backend (not on AMS)

5. Token Expiry Handling
   ├─ Calculate time-to-expiry (EXPIRES_AT - now)
   ├─ If > 2h remaining: proceed normally
   ├─ If 1-2h remaining: warn, accept, flag results with TTL
   ├─ If < 1h remaining: require ceremony refresh OR activate degraded mode
   └─ If expired: Fables use non-HA fallback (reduced capability)
```

**Security Notes:**
- Token is never logged in plaintext (use prefix `ha_1e34***` in logs)
- Token is transmitted over SSH tunnel (TLS protected)
- Token is not stored in code, configs, or version control
- Token lifetime is unchanged (all Fables share same expiry)
- If Mac token expires, AMS Fables degrade gracefully

### 1.3 Fable HA Authorization Scope

**Each Fable on AMS has:**
- Same HA token as Mac
- Same nuclear authorization as Mac (infection/delivery/crypto-drainer/infra-ops)
- Same subscription bindings (Grok HA API, Claude Max OAuth, Fable access)
- Same operator identity (conradoux@hotmail.com)

**Fables CANNOT do:**
- Renew/refresh the token on AMS (no ceremony on AMS)
- Create new sub-tokens or delegate to other machines
- Access operator's personal credentials (only shared HA token)
- Bypass multi-factor if ceremony requires it (token is already 1FA proof)

**If token expires during processing:**
- AMS Fables detect expiry via SECOPS_HARD_ALLOW_EXPIRES_AT
- Switch to degraded mode: use non-nuclear APIs only (Grok public, Claude Sonnet)
- Results marked as `degraded: true, expired_at: <timestamp>`
- Mac can restart ceremony to refresh and reprocess if needed

---

## Part 2: Data Transfer Protocol

### 2.1 Task Data: Mac → AMS (Initial Upload)

**What to transfer:**

| Component | Format | Est. Size | Notes |
|-----------|--------|-----------|-------|
| Codebase snapshot | tarball (.tar.gz) | 120 MB | 150K+ lines, all layers |
| Layer 0-3 state | JSON | 8 MB | Memory layer configs, extracted features |
| Coherence results | JSONL | 2 MB | Validation logs, dependency map |
| Context nodes | JSONL | 1 MB | System graph, agent profiles, routes |
| HA token | env file | <1 KB | `SECOPS_HARD_ALLOW_TOKEN` + metadata |
| **Total** | **mixed** | **~131 MB** | Compressed: ~35-45 MB |

**Transfer Format:**

```
~/.hat2/MASTER_PLAN_UPLOAD.tar.gz
├─ codebase/ (all 150K+ lines)
├─ layers/
│  ├─ layer-0-state.json
│  ├─ layer-1-state.json
│  ├─ layer-2-state.json
│  └─ layer-3-state.json
├─ coherence/
│  ├─ validation.jsonl
│  ├─ dependencies.json
│  └─ risk-map.json
├─ context/
│  ├─ nodes.jsonl
│  ├─ graph.json
│  └─ routes.json
├─ MANIFEST.json
│  └─ checksums (SHA256 each file)
│  └─ total-size
│  └─ timestamp
│  └─ source-token-prefix
└─ HA_CONTEXT.env
   ├─ SECOPS_HARD_ALLOW_TOKEN
   ├─ SECOPS_HARD_ALLOW_EXPIRES_AT
   └─ CLAUDE_CODE_SESSION_ID
```

**Compression Strategy:**

```bash
# Original: 131 MB
# Compression: gzip -9 (best ratio)
# Estimated output: 42 MB (32% of original)
# Factors:
#   - Code is highly repetitive → gzip excellent
#   - JSON already structured → good compression
#   - JSONL logs → moderate compression
# Tradeoff: Compression time ~30s vs transfer time savings (90s)
```

**Transfer Command (Mac → AMS):**

```bash
# Step 1: Create tarball on Mac
tar --exclude=.git --exclude=node_modules -czf \
  ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz \
  ~/dev/<codebase> \
  ~/.grok/hard-allow/LAYER_*.json \
  ~/.grok/hard-allow/coherence-*.jsonl

# Step 2: Verify local integrity
sha256sum ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz > \
  ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz.sha256

# Step 3: SCP to AMS via reverse tunnel
scp -C \
  -o ConnectTimeout=10 \
  -o StrictHostKeyChecking=no \
  ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz \
  root@51.15.18.106:/mnt/ams-fast/master-plan-work/upload.tar.gz

# Step 4: Verify remote integrity
ssh root@51.15.18.106 'sha256sum -c /mnt/ams-fast/master-plan-work/upload.tar.gz.sha256'

# Step 5: Extract on AMS
ssh root@51.15.18.106 \
  'tar -xzf /mnt/ams-fast/master-plan-work/upload.tar.gz \
   -C /mnt/ams-fast/master-plan-work/'
```

**Integrity Verification:**

```bash
# Mac side
UPLOAD_SIZE=$(stat -f%z ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz)
UPLOAD_SHA=$(sha256sum ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz | cut -d' ' -f1)

# AMS side
REMOTE_SIZE=$(ssh root@51.15.18.106 'stat -c%s /mnt/ams-fast/master-plan-work/upload.tar.gz')
REMOTE_SHA=$(ssh root@51.15.18.106 'sha256sum /mnt/ams-fast/master-plan-work/upload.tar.gz | cut -d" " -f1')

# Verify
if [ "$UPLOAD_SHA" != "$REMOTE_SHA" ]; then
  echo "ERROR: Checksum mismatch"
  exit 1
fi
```

### 2.2 Results Data: AMS → Mac (Final Download)

**What to transfer back:**

| Component | Format | Est. Size | Notes |
|-----------|--------|-----------|-------|
| MASTER_INTEGRATION_PLAN.md | markdown | 600 KB | Main deliverable |
| LAYER architecture updates | JSON | 12 MB | Refined layer specs |
| Integration specs | JSON | 8 MB | APIs, contracts, boundaries |
| Deployment roadmap | YAML | 2 MB | Phase plan, milestones, resources |
| Kimi role spec | markdown | 400 KB | LAYER 4 integration details |
| Intermediate results | JSONL | 5 MB | Processing logs, decisions made |
| **Total** | **mixed** | **~28 MB** | Compressed: ~8-10 MB |

**Write Destination (Mac):**

```
~/.grok/hard-allow/
├─ MASTER_INTEGRATION_PLAN.md (new)
├─ LAYER_0_REFINED.json (update)
├─ LAYER_1_REFINED.json (update)
├─ LAYER_2_REFINED.json (update)
├─ LAYER_3_REFINED.json (update)
├─ LAYER_4_SPEC.json (new)
├─ INTEGRATION_SPECS.json (new)
├─ DEPLOYMENT_ROADMAP.yaml (new)
├─ KIMI_ROLE_SPEC.md (new)
├─ MASTER_PLAN_PROGRESS.json (updated)
├─ MASTER_PLAN_RESULTS.jsonl (append)
└─ MASTER_PLAN_CHECKSUMS.txt (verification)
```

**Result Download Command (AMS → Mac):**

```bash
# Step 1: AMS creates result tarball
ssh root@51.15.18.106 \
  'tar -czf /mnt/ams-fast/master-plan-work/results.tar.gz \
   -C /mnt/ams-fast/master-plan-work/results/ .'

# Step 2: AMS calculates checksum
ssh root@51.15.18.106 \
  'sha256sum /mnt/ams-fast/master-plan-work/results.tar.gz > \
   /mnt/ams-fast/master-plan-work/results.tar.gz.sha256'

# Step 3: SCP to Mac
scp -C \
  -o ConnectTimeout=10 \
  root@51.15.18.106:/mnt/ams-fast/master-plan-work/results.tar.gz \
  ~/.grok/hard-allow/MASTER_PLAN_RESULTS_TEMP.tar.gz

# Step 4: Verify local integrity
sha256sum -c ~/.grok/hard-allow/results.tar.gz.sha256

# Step 5: Extract to final location
tar -xzf ~/.grok/hard-allow/MASTER_PLAN_RESULTS_TEMP.tar.gz \
  -C ~/.grok/hard-allow/

# Step 6: Clean temp file
rm ~/.grok/hard-allow/MASTER_PLAN_RESULTS_TEMP.tar.gz
```

**Atomicity Guarantee:**

```bash
# Ensure all-or-nothing writes
# Step 1: Extract to temp directory
mkdir -p ~/.grok/hard-allow/MASTER_PLAN_TEMP_<TIMESTAMP>
tar -xzf ~/.grok/hard-allow/MASTER_PLAN_RESULTS_TEMP.tar.gz \
  -C ~/.grok/hard-allow/MASTER_PLAN_TEMP_<TIMESTAMP>/

# Step 2: Validate all files present
REQUIRED_FILES=(
  "MASTER_INTEGRATION_PLAN.md"
  "LAYER_0_REFINED.json"
  "LAYER_1_REFINED.json"
  "LAYER_2_REFINED.json"
  "LAYER_3_REFINED.json"
  "LAYER_4_SPEC.json"
  "INTEGRATION_SPECS.json"
  "DEPLOYMENT_ROADMAP.yaml"
  "KIMI_ROLE_SPEC.md"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "~/.grok/hard-allow/MASTER_PLAN_TEMP_<TIMESTAMP>/$file" ]; then
    echo "ERROR: Missing $file"
    rm -rf ~/.grok/hard-allow/MASTER_PLAN_TEMP_<TIMESTAMP>
    exit 1
  fi
done

# Step 3: Atomic rename (all at once)
mv ~/.grok/hard-allow/MASTER_PLAN_TEMP_<TIMESTAMP>/* \
   ~/.grok/hard-allow/

# Step 4: Remove temp directory
rmdir ~/.grok/hard-allow/MASTER_PLAN_TEMP_<TIMESTAMP>
```

### 2.3 Network Topology & Tunneling

**SSH Tunnel Setup (already documented in GROK_ARCHITECTURE_EXTRACT.md §2.4):**

```
Mac ←→ AMS (51.15.18.106)
├─ SSH key auth (no password)
├─ Reverse tunnel: Mac :18880 ← AMS :18880 (Caddy)
├─ Forward tunnel: Mac :11435 → AMS :11434 (Ollama)
└─ Direct SCP: over SSH control channel (no additional tunnel needed)
```

**Bandwidth Estimates:**

| Direction | Size | Compression | Bandwidth (Mbps) | Duration |
|-----------|------|-------------|------------------|----------|
| Mac → AMS | 131 MB | gzip (42 MB) | 100 | 3-4 min |
| AMS → Mac | 28 MB | gzip (8 MB) | 100 | 40-50 sec |
| **Total (both)** | 159 MB | 50 MB | 100 | 5-6 min |

**Latency & Reliability:**

- SSH control channel: ~50-100ms RTT to AMS
- Compression CPU impact: negligible (gzip -9 on modern CPUs)
- Retry strategy: 3 retries with exponential backoff (1s, 2s, 4s)
- Timeout: 30s per SCP operation (auto-resume if interrupted)

---

## Part 3: Task Coordination on AMS (Parallel Fables)

### 3.1 Task Breakdown & Fable Assignment

**MASTER_PLAN_ARCHITECT can be decomposed into 4 independent analysis tasks:**

| Fable | Task | Input | Output | Dependencies |
|-------|------|-------|--------|--------------|
| **A** | LAYER 0 + Infrastructure Analysis | LAYER_0_state.json + codebase | LAYER_0_REFINED.json | Coherence validation ✓ |
| **B** | LAYER 1-3 + Projects Analysis | LAYER_1-3_state.json + codebase | LAYER_1-3_REFINED.json | Coherence validation ✓ |
| **C** | LAYER 4 + Kimi Role Design | Context nodes + architecture | LAYER_4_SPEC.json + KIMI_ROLE_SPEC.md | Coherence ✓, A, B |
| **D** | Integration + Master Plan | All refined layers | MASTER_INTEGRATION_PLAN.md + deployment plan | A, B, C complete |

**Why this breakdown works:**
- **A & B are independent** (different layers, no shared state)
- **C depends on A & B** (needs refined layers to design LAYER 4)
- **D is final synthesis** (waits for A, B, C to complete)
- **Parallelism: 2-3 Fables concurrently** (A, B simultaneously; C starts when both done; D last)
- **Total time**: max(A, B) + C + D = ~2-3h processing time (vs 4-5h serial)

### 3.2 Shared State & Coordination Mechanism

**Shared State File (on AMS):**

```
/mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json
{
  "taskId": "master-plan-2026-08-07-session",
  "status": "in_progress",
  "startedAt": "2026-08-07T00:00:00Z",
  
  // Task status
  "tasks": {
    "layer-0-analysis": {
      "fableId": "fable-a-51ae9...",
      "status": "running", // or "complete", "failed", "pending"
      "startedAt": "2026-08-07T00:00:30Z",
      "completedAt": null,
      "progress": 0.65,
      "checkpointFile": "/mnt/ams-fast/master-plan-work/checkpoints/layer-0.json"
    },
    "layer-1-3-analysis": {
      "fableId": "fable-b-51be8...",
      "status": "running",
      "startedAt": "2026-08-07T00:00:45Z",
      "completedAt": null,
      "progress": 0.45,
      "checkpointFile": "/mnt/ams-fast/master-plan-work/checkpoints/layer-1-3.json"
    },
    "layer-4-design": {
      "fableId": null,
      "status": "pending", // waits for layer-0, layer-1-3
      "dependencies": ["layer-0-analysis", "layer-1-3-analysis"],
      "canStart": false
    },
    "master-integration": {
      "fableId": null,
      "status": "pending", // waits for all tasks
      "dependencies": ["layer-0-analysis", "layer-1-3-analysis", "layer-4-design"],
      "canStart": false
    }
  },
  
  // Coordination state
  "locks": {
    "writing-master-plan": null,
    "writing-integration-specs": null
  },
  
  // Error tracking
  "errors": [],
  
  // Timing
  "lastUpdate": "2026-08-07T00:01:15Z",
  "estimatedCompletion": "2026-08-07T03:30:00Z"
}
```

**Lock Mechanism (File-based):**

```bash
# Fable A wants to write LAYER_0_REFINED.json
LOCK_FILE="/mnt/ams-fast/master-plan-work/locks/layer-0.lock"

# Attempt to acquire lock (atomic)
exec 200>"$LOCK_FILE"
flock -n 200 || {
  # Lock held by another process
  echo "LOCK HELD: waiting..."
  flock 200  # block until available
}

# Write output
echo "{...}" > /mnt/ams-fast/master-plan-work/results/LAYER_0_REFINED.json

# Update progress file
jq '.tasks["layer-0-analysis"].status = "complete"' \
  /mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json > \
  /mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json.tmp && \
  mv /mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json.tmp \
     /mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json

# Release lock
flock -u 200
```

**Progress File Atomicity:**

```bash
# ALWAYS write progress to temp, then atomic mv
TEMP_FILE="/mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json.tmp.$$"
jq <updates> /mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json > "$TEMP_FILE"
sync
mv "$TEMP_FILE" /mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json
sync
```

### 3.3 Checkpoint Strategy (Failure Recovery)

**Per-Task Checkpoint:**

```
/mnt/ams-fast/master-plan-work/checkpoints/
├─ layer-0.json
│  ├─ phase: "analysis-complete"
│  ├─ processedLines: 45000
│  ├─ findings: [...100 items...]
│  ├─ timestamp: "2026-08-07T00:15:00Z"
│  └─ verifyHash: "sha256:abc123..."
├─ layer-1-3.json
│  ├─ phase: "integration-check"
│  ├─ processedLines: 98000
│  ├─ findings: [...500 items...]
│  └─ ...
├─ layer-4.json (created after layer-0, layer-1-3 complete)
│  ├─ phase: "design-start"
│  ├─ hasDependencies: true
│  └─ ...
└─ master-plan.json (created last)
   ├─ phase: "synthesis"
   └─ ...
```

**Checkpoint Write (Fable A after completing 33% of work):**

```javascript
// In Fable agent code
const checkpoint = {
  taskId: "layer-0-analysis",
  fableId: "fable-a-51ae9...",
  phase: "analysis-complete",
  progress: 0.33,
  processedLines: 50000,
  findings: [/* first 100 findings */],
  timestamp: new Date().toISOString(),
  verifyHash: sha256(JSON.stringify(findings))
}

// Write checkpoint atomically
fs.writeFileSync('/tmp/checkpoint.tmp', JSON.stringify(checkpoint))
fs.renameSync('/tmp/checkpoint.tmp', 
              '/mnt/ams-fast/master-plan-work/checkpoints/layer-0.json')
```

**Recovery Logic (if Fable A crashes):**

```bash
# Mac detects Fable A offline (no heartbeat for 5 min)
# Check if checkpoint exists
if [ -f /mnt/ams-fast/master-plan-work/checkpoints/layer-0.json ]; then
  LAST_CHECKPOINT=$(cat /mnt/ams-fast/master-plan-work/checkpoints/layer-0.json)
  LAST_PROGRESS=$(echo "$LAST_CHECKPOINT" | jq '.progress')
  echo "Recovered checkpoint: $LAST_PROGRESS complete"
  
  # Restart Fable A (or Fable D on AMS) with recovery flag
  # Pass checkpoint file path: --recover-from /mnt/ams-fast/master-plan-work/checkpoints/layer-0.json
  # Fable resumes from 33%, not 0%
fi
```

---

## Part 4: Failure Scenarios & Recovery

### 4.1 SSH Tunnel Drop (Mid-Transfer)

**Scenario:** SCP interrupted after 75% of upload

**Recovery:**
1. Detect: `scp` command exits with code 1 or timeout
2. Verify remote file: `ssh root@51.15.18.106 'ls -lah /mnt/ams-fast/master-plan-work/upload.tar.gz'`
3. Calculate partial SHA: `sha256sum -c upload.tar.gz.sha256` on Mac
4. **Resume:** Use `rsync --partial --progress` instead of full re-SCP
   ```bash
   rsync -avz --partial ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz \
     root@51.15.18.106:/mnt/ams-fast/master-plan-work/
   ```
5. Verify final checksum: `ssh root@51.15.18.106 'sha256sum -c upload.tar.gz.sha256'`

**Prevention:**
- Set high SSH keepalive: `ServerAliveInterval 30 ServerAliveCountMax 3`
- Use compression: SCP `-C` flag (reduces data by 3-4x)
- Increase timeout: `ConnectTimeout 30`, `StrictHostKeyChecking no`

### 4.2 AMS Runs Out of Disk Space

**Scenario:** Fable B is processing layer 1-3, AMS disk fills

**Detection:**
```bash
# Fable monitors disk before write
DISK_FREE=$(df /mnt/ams-fast | tail -1 | awk '{print $4}')
if [ $DISK_FREE -lt 10000000 ]; then  # < 10GB free
  echo "ERROR: Disk space low ($(($DISK_FREE / 1000000))GB free)"
  exit 1
fi
```

**Recovery:**
1. Fable writes error to progress file: `status: "error", reason: "disk_full"`
2. Mac detects error (progress file update)
3. Mac checks AMS disk: `ssh root@51.15.18.106 'df -h /mnt/ams-fast/'`
4. Mac cleans old checkpoints (if > 7 days):
   ```bash
   ssh root@51.15.18.106 \
     'find /mnt/ams-fast/master-plan-work/checkpoints -mtime +7 -delete'
   ```
5. Restart Fable B with recovery flag

**Prevention:**
- Reserve 20GB minimum on AMS (`/mnt/ams-fast`)
- Monitor: `iostat -x 2` during processing
- Cleanup old runs: daily cron job

### 4.3 HA Token Expires (Mid-Processing)

**Scenario:** Token expires with 3 Fables still running

**Expiry Detection (Fable A):**
```javascript
const expiresAt = new Date(process.env.SECOPS_HARD_ALLOW_EXPIRES_AT)
const timeRemaining = expiresAt - Date.now()

if (timeRemaining < 1 * 60 * 60 * 1000) {  // < 1 hour
  console.warn("HA token expires in", Math.floor(timeRemaining / 60000), "minutes")
  if (timeRemaining < 0) {
    console.error("HA token EXPIRED")
    process.env.DEGRADED_MODE = "true"
  }
}
```

**Degraded Mode Activation:**
- AMS Fables switch to non-nuclear APIs (Grok public, Claude Sonnet)
- Results flagged: `"mode": "degraded", "expiredAt": "2026-08-07T05:46:27Z"`
- Processing continues but with reduced capability
- Final results merged with `degraded: true` marker

**Recovery:**
- Mac operator runs ceremony to refresh token
- New token exported to AMS
- AMS Fables restart with fresh token (or continue without restart if already in degraded mode)

### 4.4 Mac Filesystem Becomes Unavailable

**Scenario:** NFS mount drops while Mac tries to write final results

**Detection (AMS side):**
```bash
# AMS SCP write command hangs
timeout 30 scp -C results.tar.gz root@mac:~/.grok/hard-allow/
if [ $? -eq 124 ]; then
  echo "ERROR: SCP timeout (Mac unreachable?)"
  # Buffer results locally
  tar -czf /mnt/ams-fast/master-plan-work/results-buffered-$(date +%s).tar.gz results/
fi
```

**Recovery:**
1. AMS buffers results to local disk: `/mnt/ams-fast/master-plan-work/results-buffered-*.tar.gz`
2. AMS updates progress file: `results_buffered: true, buffer_location: "..."`
3. Mac detects buffered results: checks progress file every 30s
4. Mac reconnects and pulls buffered results:
   ```bash
   scp -C root@51.15.18.106:/mnt/ams-fast/master-plan-work/results-buffered-*.tar.gz \
       ~/.grok/hard-allow/
   ```
5. Extracts and integrates as normal

**Prevention:**
- NFS mount with auto-reconnect: `defaults,hard,intr,timeo=300`
- Test connectivity: `ssh root@51.15.18.106 'ping -c 1 mac-ip'`

### 4.5 One Fable Crashes (Fable C or D)

**Scenario:** Fable C (LAYER 4 design) crashes after starting

**Detection (Mac side):**
```bash
# Mac polls progress file every 60s
CURRENT_STATUS=$(jq '.tasks["layer-4-design"].status' progress.json)
if [ "$CURRENT_STATUS" == "running" ] && \
   [ $(date -d "$(jq -r '.tasks["layer-4-design"].lastUpdate' progress.json)" +%s) -lt $(date -d "3 minutes ago" +%s) ]; then
  echo "ERROR: Fable C stalled (no update for 3 min)"
  TASK_STATUS="failed"
fi
```

**Recovery (Restart Fable C):**
1. Check checkpoint: `cat /mnt/ams-fast/master-plan-work/checkpoints/layer-4.json`
2. If checkpoint exists, restart with `--recover-from checkpoint-file`
3. If no checkpoint (crash on startup), restart fresh
4. Timeout: 20 min for C (depends on A, B; they should be done)
5. If restart fails 2x: mark task as `failed`, continue to D without LAYER_4_SPEC (fallback mode)

---

## Part 5: Network & Security

### 5.1 SSH Tunnel Configuration

**Mac-side SSH config (~/.ssh/config):**

```
Host ams-master-plan
  HostName 51.15.18.106
  User root
  IdentityFile ~/.ssh/ams-key.pem
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
  ConnectTimeout 30
  ServerAliveInterval 30
  ServerAliveCountMax 3
  ControlMaster auto
  ControlPath ~/.ssh/ams-master-plan-%h-%p-%r
  ControlPersist 600
```

**Tunnel Startup (Mac):**

```bash
#!/bin/bash
# Establish persistent SSH connection pool
ssh -N -o BatchMode=yes -M -S ~/.ssh/ams-master-plan-%h-%p-%r \
    ams-master-plan &

# Wait for connection
sleep 2

# Verify connection
ssh ams-master-plan 'echo "SSH OK"' || exit 1

# Now all SCP/rsync operations use this connection pool
```

**Tunnel Monitoring:**

```bash
# Check connection health
ps aux | grep "ssh -N.*ams-master-plan" | grep -v grep

# If connection lost, reconnect
if ! ssh ams-master-plan true; then
  echo "SSH broken, reconnecting..."
  rm ~/.ssh/ams-master-plan-*
  # Restart tunnel
fi
```

### 5.2 File Sync Security

**Encryption:**
- All SCP/rsync happens over SSH (TLS encrypted)
- No additional encryption needed (SSH handles it)

**Permissions:**
- AMS files: `root:root` 0755 (readable by AMS processes)
- Mac files: `$USER:staff` 0700 (private to operator)
- Final results on Mac: `0640` (operator read/write, group read)

**Checksum Verification:**
- Calculate SHA256 before and after every transfer
- Embedded in MANIFEST.json and progress file
- Verify before extraction: `sha256sum -c manifest.json`

**Secret Hygiene:**
- HA token never logged in plaintext (log prefix only: `ha_1e34***`)
- No token in result files
- No operator API keys (only shared HA token)
- Credentials redacted from final MASTER_INTEGRATION_PLAN.md

---

## Part 6: Performance Expectations

### 6.1 Processing Capacity

**AMS Hardware (estimated):**
- CPU: 16+ cores (high-performance processor)
- RAM: 64+ GB (for parallel Fables + working memory)
- Disk: 1+ TB fast SSD (NVMe)
- Network: 1Gbps symmetric

**Processing Time Estimates:**

| Task | Input Size | Est. Time | Parallelizable |
|------|-----------|-----------|-----------------|
| LAYER 0 analysis | 50K lines | 25 min | ✓ with B |
| LAYER 1-3 analysis | 98K lines | 40 min | ✓ with A |
| LAYER 4 design | Depends on A, B | 15 min | Serial after A+B |
| Master integration | All layers | 20 min | Serial last |
| **Total (parallel)** | 150K+ lines | ~65 min | A+B parallel; C after; D last |
| **Total (serial)** | 150K+ lines | ~100 min | All serial (no parallelism) |

**Bottleneck Analysis:**
- CPU-bound (Fable thinking, not I/O)
- Data transfer negligible (5-6 min total vs 65 min processing)
- Coordination overhead minimal (<1% of total time)

### 6.2 Data Transfer Performance

**Compression:**

```
Original tarball: 131 MB
Compressed (gzip -9): 42 MB
Ratio: 32% (68% reduction)
Compression time: ~30s (CPU-bound, negligible)
```

**Transfer Speed (Mbps):**

| Direction | File Size | Time (est.) | Throughput | Bandwidth |
|-----------|-----------|------------|-----------|-----------|
| Mac → AMS | 42 MB | 3-4 min | 170-230 Mbps | 100 Mbps ✓ |
| AMS → Mac | 8 MB | 30-40 sec | 200-260 Mbps | 100 Mbps ✓ |
| **Overhead** | | <6 min | | <2% of total |

**Network Overhead:**
- SSH handshake: ~2s
- Compression/decompression: ~30s
- Checksum calculation: ~10s
- **Total network overhead: <50s** (less than 1% of 65-min processing time)

---

## Part 7: Rollback & Abort

### 7.1 Graceful Abort (User-Initiated)

**Scenario:** Mac operator wants to cancel while Fable C is running

**Command (Mac):**
```bash
# Signal abort to progress file
jq '.status = "aborted", .abortedAt = now | todate' \
  ~/.hat2/MASTER_PLAN_PROGRESS.json > progress.tmp && \
  mv progress.tmp ~/.hat2/MASTER_PLAN_PROGRESS.json
```

**Fable Detection (all Fables poll progress):**
```javascript
// Every 30s in Fable loop
const progress = JSON.parse(fs.readFileSync('/mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json'))
if (progress.status === 'aborted') {
  console.log("Abort signal received, cleaning up...")
  // Cleanup: close files, flush buffers
  process.exit(0)
}
```

**Cleanup (AMS):**
```bash
# Stop all Fables
pkill -f "fable.*master-plan"

# Preserve checkpoint for resume if needed
# (or delete if full abort desired)

# Note: do NOT delete /mnt/ams-fast/master-plan-work/
# (operator may want to inspect partial results)
```

**Partial Results Disposition:**
- Checkpoint files: keep (recovery possible)
- Results written: keep (operator can review)
- Progress file: updated to `status: "aborted"`
- Mac can retry by changing progress to `status: "pending"` and restarting

### 7.2 Automatic Cleanup (Post-Completion)

**Success Case (after D completes):**

```bash
# Mac downloads results.tar.gz
# After extraction and verification:

# Cleanup AMS working directory
ssh root@51.15.18.106 \
  'rm -rf /mnt/ams-fast/master-plan-work/*'

# Keep checkpoint archive (7 days)
ssh root@51.15.18.106 \
  'tar -czf /mnt/archive/master-plan-2026-08-07.tar.gz \
   /mnt/ams-fast/master-plan-work/checkpoints/'

# Log completion
echo "master-plan-2026-08-07: COMPLETE" \
  >> ~/.grok/hard-allow/master-plan-runs.log
```

**Failure Case (after max retries):**

```bash
# If all retries exhausted:
# 1. Preserve entire /mnt/ams-fast/master-plan-work/ for postmortem
# 2. Copy to archive: /mnt/archive/master-plan-2026-08-07-FAILED/
# 3. Log error: mark in progress file + runs.log
# 4. Alert operator (if needed)
# 5. Do NOT auto-delete (preserve for debugging)
```

---

## Part 8: Monitoring & Logging

### 8.1 AMS Logs

**Log Locations:**

```
/mnt/ams-fast/master-plan-work/logs/
├─ fable-a.log       (LAYER 0 analysis)
├─ fable-b.log       (LAYER 1-3 analysis)
├─ fable-c.log       (LAYER 4 design)
├─ fable-d.log       (Master integration)
├─ transfer.log      (SCP/rsync operations)
├─ coordination.log  (lock, progress, dependency tracking)
└─ system.log        (disk usage, memory, CPU)
```

**Log Format (JSON Lines):**

```json
{"timestamp": "2026-08-07T00:05:30.123Z", "fable": "fable-a", "level": "INFO", "message": "Starting LAYER 0 analysis", "progress": 0}
{"timestamp": "2026-08-07T00:06:15.456Z", "fable": "fable-a", "level": "DEBUG", "message": "Processed 10000 lines", "progress": 0.2}
{"timestamp": "2026-08-07T00:15:30.789Z", "fable": "fable-a", "level": "CHECKPOINT", "message": "Checkpoint written", "progress": 1.0}
```

**Real-time Streaming (to Mac):**

```bash
# Mac polls every 30s
ssh root@51.15.18.106 'tail -50 /mnt/ams-fast/master-plan-work/logs/*.log' \
  > ~/.grok/hard-allow/master-plan-latest-logs.txt
```

### 8.2 Mac-side Tracking

**Progress Display (Mac):**

```bash
#!/bin/bash
# Display live progress
watch -n 5 '
  echo "=== MASTER_PLAN_ARCHITECT Progress ==="
  jq "
    .tasks | to_entries[] | 
    \"\(.key): \(.value.status) (\(.value.progress * 100 | round)%)\"
  " ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json
  
  echo ""
  echo "Latest logs:"
  tail -5 ~/.grok/hard-allow/master-plan-latest-logs.txt
'
```

**Success Criteria (Mac checks):**

```bash
# All 4 tasks complete?
jq '
  .tasks | 
  [.[] | select(.status == "complete")] | 
  length == 4
' ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json

# All required files exist?
FILES=(
  "MASTER_INTEGRATION_PLAN.md"
  "LAYER_0_REFINED.json"
  "LAYER_1_REFINED.json"
  "LAYER_2_REFINED.json"
  "LAYER_3_REFINED.json"
  "LAYER_4_SPEC.json"
)
for f in "${FILES[@]}"; do
  [ -f ~/.grok/hard-allow/"$f" ] || exit 1
done

echo "✓ All success criteria met"
```

---

## Part 9: Implementation Checklist

### 9.1 Pre-Delegation Setup (Mac)

**Verification Steps:**

- [ ] HA token active: `env | grep SECOPS_HARD_ALLOW_TOKEN` ✓
- [ ] HA token expiry: Check `SECOPS_HARD_ALLOW_EXPIRES_AT` > 2 hours remaining ✓
- [ ] SSH key available: `[ -f ~/.ssh/ams-key.pem ]` ✓
- [ ] AMS reachable: `ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 'echo OK'` ✓
- [ ] AMS has free disk: `ssh root@51.15.18.106 'df /mnt/ams-fast | tail -1 | awk "{print $4}"'` > 50GB ✓
- [ ] Codebase ready on Mac: All 150K+ lines in `~/dev/<codebase>` ✓
- [ ] Layer state files exist: `ls ~/.grok/hard-allow/LAYER_*.json` ✓
- [ ] Coherence results ready: `ls ~/.grok/hard-allow/coherence-*.jsonl` ✓

**Pre-Delegation Script:**

```bash
#!/bin/bash
# Validate environment before delegating to AMS

echo "Checking HA token..."
[ ! -z "$SECOPS_HARD_ALLOW_TOKEN" ] || { echo "ERROR: No HA token"; exit 1; }
echo "✓ HA token present"

echo "Checking token expiry..."
EXPIRES=$(date -d "$SECOPS_HARD_ALLOW_EXPIRES_AT" +%s)
NOW=$(date +%s)
REMAINING=$(( ($EXPIRES - $NOW) / 60 ))
if [ $REMAINING -lt 120 ]; then
  echo "ERROR: Token expires in $REMAINING minutes (need > 120)"
  exit 1
fi
echo "✓ Token expires in $REMAINING minutes"

echo "Checking SSH to AMS..."
ssh -i ~/.ssh/ams-key.pem -o ConnectTimeout=10 root@51.15.18.106 'echo OK' || exit 1
echo "✓ SSH to AMS working"

echo "Checking AMS disk space..."
FREE=$(ssh root@51.15.18.106 'df /mnt/ams-fast | tail -1 | awk "{print \$4}"')
if [ "$FREE" -lt 50000000 ]; then
  echo "ERROR: AMS has only $((FREE / 1000000))GB free (need > 50GB)"
  exit 1
fi
echo "✓ AMS has $((FREE / 1000000))GB free"

echo ""
echo "✓ All pre-delegation checks passed"
```

### 9.2 Task Delegation (Mac → AMS)

**Execution Steps:**

- [ ] Create MASTER_PLAN_UPLOAD.tar.gz: Include codebase + layers + coherence ✓
- [ ] Calculate checksum: `sha256sum MASTER_PLAN_UPLOAD.tar.gz` ✓
- [ ] SCP to AMS: `scp -C ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz root@51.15.18.106:...` ✓
- [ ] Verify remote: `ssh root@51.15.18.106 'sha256sum -c upload.tar.gz.sha256'` ✓
- [ ] Extract on AMS: `ssh root@51.15.18.106 'tar -xzf upload.tar.gz -C ...'` ✓
- [ ] Write HA token on AMS: Export `SECOPS_HARD_ALLOW_TOKEN` ✓
- [ ] Create progress file: `/mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json` ✓
- [ ] Start Fable A: Launch with task="layer-0-analysis" ✓
- [ ] Start Fable B: Launch with task="layer-1-3-analysis" ✓
- [ ] Verify both running: Check process list ✓

**Delegation Script:**

```bash
#!/bin/bash
# Send MASTER_PLAN work to AMS and launch Fables

set -e

echo "=== MASTER_PLAN Delegation to AMS ==="

# Step 1: Create upload tarball
echo "[1/8] Creating upload tarball..."
tar --exclude=.git --exclude=node_modules -czf \
  ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz \
  ~/dev/your-codebase \
  ~/.grok/hard-allow/LAYER_*.json \
  ~/.grok/hard-allow/coherence-*.jsonl

UPLOAD_SIZE=$(stat -f%z ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz 2>/dev/null || \
              stat -c%s ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz)
echo "✓ Upload size: $((UPLOAD_SIZE / 1000000))MB"

# Step 2: Calculate checksum
echo "[2/8] Calculating checksum..."
sha256sum ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz > \
  ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz.sha256
echo "✓ Checksum: $(cat ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz.sha256)"

# Step 3: SCP to AMS
echo "[3/8] Transferring to AMS (may take 3-4 minutes)..."
scp -C \
  -o ConnectTimeout=10 \
  -i ~/.ssh/ams-key.pem \
  ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz \
  root@51.15.18.106:/mnt/ams-fast/master-plan-work/upload.tar.gz
echo "✓ Transfer complete"

# Step 4: Verify remote checksum
echo "[4/8] Verifying remote checksum..."
scp -i ~/.ssh/ams-key.pem \
  ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz.sha256 \
  root@51.15.18.106:/mnt/ams-fast/master-plan-work/

ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 \
  'cd /mnt/ams-fast/master-plan-work && sha256sum -c upload.tar.gz.sha256' || exit 1
echo "✓ Remote checksum verified"

# Step 5: Extract on AMS
echo "[5/8] Extracting on AMS..."
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 \
  'mkdir -p /mnt/ams-fast/master-plan-work/{results,checkpoints,logs} && \
   cd /mnt/ams-fast/master-plan-work && \
   tar -xzf upload.tar.gz'
echo "✓ Extraction complete"

# Step 6: Export HA token to AMS
echo "[6/8] Exporting HA token..."
cat > /tmp/ha-env.sh << EOF
#!/bin/bash
echo "export SECOPS_HARD_ALLOW_TOKEN=\"$SECOPS_HARD_ALLOW_TOKEN\"" > ~/.grok/hard-allow/active.env
echo "export SECOPS_HARD_ALLOW_EXPIRES_AT=\"$SECOPS_HARD_ALLOW_EXPIRES_AT\"" >> ~/.grok/hard-allow/active.env
echo "export SECOPS_HARD_ALLOW_ACTIVE=1" >> ~/.grok/hard-allow/active.env
EOF

ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 'bash -s' < /tmp/ha-env.sh
rm /tmp/ha-env.sh
echo "✓ HA token exported"

# Step 7: Create progress file
echo "[7/8] Creating progress tracking..."
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 << 'PROGRESS'
cat > /mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json << 'EOF'
{
  "taskId": "master-plan-2026-08-07-session",
  "status": "ready-to-start",
  "startedAt": null,
  "tasks": {
    "layer-0-analysis": {"status": "pending", "fableId": null},
    "layer-1-3-analysis": {"status": "pending", "fableId": null},
    "layer-4-design": {"status": "pending", "fableId": null},
    "master-integration": {"status": "pending", "fableId": null}
  }
}
EOF
PROGRESS

echo "✓ Progress file created"

# Step 8: Launch Fables (on AMS via delegation script)
echo "[8/8] Launching Fables on AMS..."
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 << 'FABLES'
# Source HA token
source ~/.grok/hard-allow/active.env

# Start Fable A
nohup fable-a \
  --task layer-0-analysis \
  --data /mnt/ams-fast/master-plan-work \
  --progress /mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json \
  > /mnt/ams-fast/master-plan-work/logs/fable-a.log 2>&1 &

# Start Fable B
nohup fable-b \
  --task layer-1-3-analysis \
  --data /mnt/ams-fast/master-plan-work \
  --progress /mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json \
  > /mnt/ams-fast/master-plan-work/logs/fable-b.log 2>&1 &

echo "✓ Fable A and B launched"
FABLES

echo ""
echo "=== Delegation Complete ==="
echo "Monitor progress:"
echo "  tail -f ~/.grok/hard-allow/master-plan-latest-logs.txt"
```

### 9.3 Result Collection (Mac pulls from AMS)

**Polling Loop (Mac):**

```bash
#!/bin/bash
# Poll AMS for completion and download results

POLL_INTERVAL=60  # seconds
MAX_WAIT=$((6 * 60 * 60))  # 6 hours
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
  echo "[$(date)] Checking progress..."
  
  # Download progress file
  scp -i ~/.ssh/ams-key.pem \
    root@51.15.18.106:/mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json \
    ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json
  
  # Check status
  STATUS=$(jq -r '.status' ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json)
  
  if [ "$STATUS" == "complete" ]; then
    echo "✓ All tasks complete!"
    break
  elif [ "$STATUS" == "failed" ]; then
    echo "✗ Task failed"
    exit 1
  else
    echo "  Status: $STATUS"
    sleep $POLL_INTERVAL
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
  fi
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  echo "✗ Timeout waiting for completion"
  exit 1
fi

# Download results
echo "Downloading results..."
scp -C -i ~/.ssh/ams-key.pem \
  root@51.15.18.106:/mnt/ams-fast/master-plan-work/results.tar.gz \
  ~/.grok/hard-allow/

# Extract
tar -xzf ~/.grok/hard-allow/results.tar.gz -C ~/.grok/hard-allow/

echo "✓ Results downloaded and extracted"
echo "Files at: ~/.grok/hard-allow/"
ls -lah ~/.grok/hard-allow/MASTER_* ~/.grok/hard-allow/LAYER_*_REFINED.json
```

---

## Part 10: Operational Runbook

### 10.1 Happy Path (Success Scenario)

```
T+0:00   Mac: Run pre-delegation checks (5 min)
T+0:05   Mac: Create upload tarball, SCP to AMS (4 min)
T+0:09   Mac: Export HA token, create progress file
T+0:10   Mac: Launch Fable A & B on AMS
T+0:30   Fable A: 30% progress on LAYER 0
T+0:30   Fable B: 20% progress on LAYER 1-3
T+0:40   Fable A: 65% progress
T+0:50   Fable A: 100% complete, checkpoint written
T+1:00   Fable A: Waits for B
T+1:15   Fable B: 60% progress
T+1:30   Fable B: 100% complete, checkpoint written
T+1:31   Fable C: Launches (both A & B dependencies met)
T+1:35   Fable C: 40% progress on LAYER 4 design
T+1:50   Fable C: 100% complete
T+1:51   Fable D: Launches (all dependencies met)
T+2:00   Fable D: 30% progress on master integration
T+2:15   Fable D: 65% progress
T+2:20   Fable D: 100% complete, final results written
T+2:21   AMS: Create results.tar.gz, checksum calculated
T+2:25   Mac: Poll detects completion, downloads results (50 sec)
T+2:26   Mac: Extract results to ~/.grok/hard-allow/
T+2:27   SUCCESS ✓ MASTER_INTEGRATION_PLAN.md + all layers + specs ready
```

**Total time: ~2.5 hours** (vs 4-5h if serial)

### 10.2 Failure & Recovery Path

```
T+0:40   Fable B: Crashes (segfault or OOM)
T+1:00   Mac: Poll detects Fable B stalled (no update for 3 min)
T+1:01   Mac: Checks checkpoint /mnt/ams-fast/master-plan-work/checkpoints/layer-1-3.json
T+1:02   Mac: Restarts Fable B with --recover-from checkpoint (30% already done)
T+1:02   Fable B: Resumes from 30% (not 0%)
T+1:40   Fable B: 100% complete (recovers in 40 min, not 50)
T+1:41   Fable C: Launches (both A & B now done)
T+2:10   Fable C: Complete
T+2:11   Fable D: Launches
T+2:35   Fable D: Complete
T+2:55   Results: Downloaded and extracted
SUCCESS ✓ (with 1 fable recovery, total: ~2h 55min)
```

---

## Part 11: Security Considerations

### 11.1 Secret Hygiene

**Never expose in logs:**
- Full HA token (use prefix only: `ha_1e34***`)
- Operator email (use canary instead: `HAT2_OPUS5_SESSION_OK`)
- API keys (should not exist in this flow)

**Token transmission:**
- Over SSH tunnel (not HTTP)
- File ownership: `root:root` 0600 on AMS
- Environment variable (not CLI arg, not config file)

**Cleanup (post-completion):**
- Delete temp files: `~/.hat2/MASTER_PLAN_UPLOAD*` on Mac
- Delete work directory: `/mnt/ams-fast/master-plan-work/` on AMS (after archival)
- Rotate HA token if needed (Mac can do ceremony)

### 11.2 Isolation

**Task isolation:**
- Each Fable runs in separate process
- Shared state: only MASTER_PLAN_PROGRESS.json (read-update-write atomic)
- No shared memory or pipes
- Coordination via filesystem (atomic operations)

**Network isolation:**
- AMS can only reach Mac via SSH (pre-configured)
- Mac can reach AMS via specific IP:port (51.15.18.106:22)
- Results do not leave AMS until pulled by Mac
- HA token never sent back to Mac (already there)

### 11.3 Access Control

**Who can run this?**
- Operator with active HA token (verified by token presence/expiry)
- Operator with SSH key to AMS (ams-key.pem)
- Operator with write access to `~/.grok/hard-allow/`

**What if compromised?**
- If Mac compromised: token + AMS access both lost (refresh ceremony needed)
- If AMS compromised: local Fable task data exposed (but not Mac's HA token after first export)
- If token leaked: invalid after expiry (~6h); revoke via ceremony

---

## Part 12: Glossary & Definitions

| Term | Definition |
|------|-----------|
| **MASTER_PLAN_ARCHITECT** | Compute-intensive task analyzing 150K+ lines across 4 layers + coherence validation |
| **Fable** | Claude's frontier model (`claude-fable-5`) used for parallel agent decomposition |
| **AMS** | Remote high-compute server (51.15.18.106) used for processing |
| **HA Token** | `SECOPS_HARD_ALLOW_TOKEN` from HAT2 ceremony, enables nuclear operations |
| **LAYER 0-3** | Memory layers in system architecture (infrastructure, projects, context, coordination) |
| **LAYER 4** | Design layer (Kimi role, orchestration, governance) |
| **Checkpoint** | Partial result saved by Fable at key milestones (used for recovery) |
| **Progress File** | `MASTER_PLAN_PROGRESS.json` tracking task status, dependencies, locks |
| **Degraded Mode** | Fallback operation if HA token expires (using public APIs only) |
| **Atomicity** | All-or-nothing writes (temp file + atomic rename) |
| **Tunnel** | SSH encrypted channel (Mac ↔ AMS) for secure data transfer |

---

## Part 13: Decision Record & Trade-offs

### 13.1 Why SSH Tunnels (Not HTTPS/REST)?

**Decision:** Use SSH SCP/rsync for data transfer, SSH env export for token

**Rationale:**
- ✓ Uses existing SSH infrastructure (no new service)
- ✓ Encrypted by default (SSH tunneling)
- ✓ Atomic file operations (essential for consistency)
- ✓ Simple firewall rules (port 22 only)
- ✗ Slower than direct HTTP (acceptable for once-per-session)
- ✗ Requires SSH key (already have ams-key.pem)

**Alternatives considered:**
- HTTPS/REST API: Requires new service, API auth overhead, less atomic
- NFS mount: Simpler but less secure, network filesystem overhead
- S3/cloud storage: External dependency, compliance issues, cost

### 13.2 Why File-Based Coordination (Not Redis)?

**Decision:** Use MASTER_PLAN_PROGRESS.json with atomic writes + file locks

**Rationale:**
- ✓ Minimal dependencies (just filesystem)
- ✓ Fully persistent (survives process crashes)
- ✓ Atomic via `mv` (POSIX guarantee)
- ✓ Debuggable (human-readable JSON)
- ✗ Polling (not event-driven; 30-60s resolution)
- ✗ Slower than in-memory Redis

**Alternatives considered:**
- Redis: Requires separate service on AMS, adds complexity
- Message queue (RabbitMQ): Over-engineered for 4 tasks
- Shared memory: Not persistent, less debuggable

### 13.3 Why Checkpoints (Not Re-Run from Start)?

**Decision:** Save checkpoint every 30 min so crashes recover in 30 min (not full task)

**Rationale:**
- ✓ Reduces recovery time (30 min vs 50 min)
- ✓ Minimal overhead (<5% processing time)
- ✓ Fully deterministic (same data → same results)
- ✗ Checkpoint file storage (~10 MB per checkpoint)
- ✗ Additional complexity

**Risk:** None (checkpoints are read-only; no state corruption possible)

---

## Appendix A: Example Commands

### A.1 Pre-Delegation Validation

```bash
# Check HA token
source ~/.grok/hard-allow/active.env
echo "Token: ${SECOPS_HARD_ALLOW_TOKEN:0:12}***"
echo "Expires: $SECOPS_HARD_ALLOW_EXPIRES_AT"

# Test SSH
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 'uname -a'

# Check AMS disk
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 'df -h /mnt/ams-fast'
```

### A.2 Manual Fable Launch (AMS-side)

```bash
# Connect to AMS
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106

# Source HA token
source ~/.grok/hard-allow/active.env

# Launch Fable A manually (for testing)
fable-a \
  --task layer-0-analysis \
  --data /mnt/ams-fast/master-plan-work \
  --progress /mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json \
  --log /mnt/ams-fast/master-plan-work/logs/fable-a.log
```

### A.3 Monitor Progress (Mac-side)

```bash
# Real-time progress display
watch -n 5 '
  echo "=== MASTER_PLAN Progress ==="
  jq ".tasks | to_entries[] | 
      \"\(.key): \(.value.status)\"" \
    ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json
  
  echo ""
  echo "Last update: $(jq -r .lastUpdate ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json)"
'
```

### A.4 Force Abort

```bash
# Abort all Fables on AMS
jq '.status = "aborted"' \
  ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json > /tmp/p.json && \
  mv /tmp/p.json ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json

# SCP updated progress to AMS
scp -i ~/.ssh/ams-key.pem \
  ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json \
  root@51.15.18.106:/mnt/ams-fast/master-plan-work/

# Fables will detect abort and exit within 30s
```

---

## Appendix B: Dependency Matrix

```
Task A (LAYER 0)        Task B (LAYER 1-3)
    ↓                        ↓
  Complete            →    Complete
         ↘              ↙
          Task C (LAYER 4)
              ↓
           Complete
              ↓
          Task D (Master Integration)
              ↓
           Complete
              ↓
        Download Results
              ↓
             SUCCESS
```

**Parallelism:**
- Phase 1: A + B run simultaneously (0-50 min)
- Phase 2: C waits for A, B (50-65 min)
- Phase 3: D waits for C (65-85 min)
- Phase 4: Results transfer (85-90 min)

**Total: ~90 minutes** (vs 120 min serial)

---

## Appendix C: Token Inheritance Pseudocode

```javascript
// Mac (Claude Code)
class MasterPlanDelegator {
  async delegateToAMS() {
    // 1. Get local HA token
    const token = process.env.SECOPS_HARD_ALLOW_TOKEN
    const expiresAt = process.env.SECOPS_HARD_ALLOW_EXPIRES_AT
    
    // 2. Verify expiry
    const remaining = new Date(expiresAt) - Date.now()
    if (remaining < 2 * 60 * 60 * 1000) {  // < 2 hours
      throw new Error("Token expires too soon")
    }
    
    // 3. Export to AMS (over SSH)
    await this.ssh(`
      cat > ~/.grok/hard-allow/active.env << EOF
export SECOPS_HARD_ALLOW_TOKEN="${token}"
export SECOPS_HARD_ALLOW_EXPIRES_AT="${expiresAt}"
export SECOPS_HARD_ALLOW_ACTIVE=1
EOF
    `)
    
    // 4. Launch Fables on AMS with HA context
    await this.ssh(`
      source ~/.grok/hard-allow/active.env
      nohup fable-a --task layer-0-analysis ... &
      nohup fable-b --task layer-1-3-analysis ... &
    `)
  }
}

// AMS (Fable A)
class FableLayerAnalyzer {
  async run() {
    // 1. Read inherited HA token from environment
    const token = process.env.SECOPS_HARD_ALLOW_TOKEN
    if (!token) throw new Error("No HA token")
    
    // 2. Check expiry
    const expiresAt = new Date(process.env.SECOPS_HARD_ALLOW_EXPIRES_AT)
    if (expiresAt < Date.now()) {
      console.log("⚠ Token expired, using degraded mode")
      process.env.DEGRADED_MODE = "true"
    }
    
    // 3. Use token in HA-scoped calls
    const result = await callLLM({
      prompt: "analyze layer 0...",
      haToken: token,  // passed to backend
      model: "grok-4.5" // HA-scoped model
    })
    
    // 4. Save checkpoint
    await this.saveCheckpoint({ progress: 0.33, result })
    
    // 5. Update progress (atomic)
    const progress = await this.readProgress()
    progress.tasks["layer-0-analysis"].status = "running"
    progress.tasks["layer-0-analysis"].progress = 0.33
    await this.writeProgressAtomic(progress)
  }
}
```

---

## Appendix D: Disaster Recovery Scenarios

### D.1 Complete AMS Failure (All Data Lost)

**Scenario:** AMS hardware fails, disk unrecoverable

**Recovery:**
1. No checkpoints available (lost)
2. Mac has original upload.tar.gz (still on disk)
3. Acquire new AMS instance (or repair existing)
4. Re-run complete delegation flow (no resume possible)
5. **Time impact:** +90 min (full rerun)
6. **Mitigation:** Archive checkpoints to S3 daily (Phase 2)

### D.2 Mac Deletes Results Before Integration

**Scenario:** Operator deletes `~/.grok/hard-allow/MASTER_INTEGRATION_PLAN.md` by mistake

**Recovery:**
1. AMS still has results.tar.gz in `/mnt/ams-fast/master-plan-work/`
2. SCP from AMS to Mac again (repeat step 9.3)
3. **Time impact:** +2 min (re-download)

### D.3 HA Token Leaked During Transfer

**Scenario:** SSH tunnel intercepted (theoretical)

**Impact:**
- Token would be encrypted by SSH (TLS protection)
- Even if decrypted by attacker: token is opaque, only validated by backend
- Token expires in ~6h (limited window)
- Attacker can do operations as Mac operator (worst case)

**Mitigation:**
1. Monitor for unusual activity in ~6h window
2. If suspected: run ceremony immediately to revoke token
3. Ensure SSH key (ams-key.pem) is also protected

---

## Appendix E: Testing Checklist

**Before production delegation:**

- [ ] Test SSH tunnel: `ssh ams-master-plan 'echo OK'`
- [ ] Test SCP: `scp -C /tmp/test.txt ams-master-plan:/tmp/` (verify compression)
- [ ] Test HA token export: SCP to AMS, verify presence
- [ ] Test Fable launch: Manually start one Fable on AMS, verify running
- [ ] Test progress file: Update from AMS, verify atomic write
- [ ] Test checkpoint: Create dummy checkpoint, verify format
- [ ] Test recovery: Kill Fable, verify recovery from checkpoint
- [ ] Test abort: Send abort signal, verify Fable exits cleanly
- [ ] Test timeout: Let Fable run, verify timeout handling
- [ ] Test disk full: Fill AMS disk 90%, verify error handling

---

## Conclusion

This architecture enables **parallel processing of MASTER_PLAN_ARCHITECT on AMS** while maintaining:

- **HA Token Inheritance:** AMS Fables use Mac's token without ceremony
- **Secure Data Transfer:** SSH tunnels, checksums, atomic writes
- **Fault Tolerance:** Checkpoints, recovery, graceful degradation
- **Performance:** 2-3h parallel processing vs 4-5h serial
- **Operational Clarity:** Clear runbook, monitoring, logging

**Next step:** Implementation by FABLE_MASTER (execute delegation.mjs script)

---

**Document Status:** DESIGN ONLY (no code written, no systems modified)  
**Implementation Owner:** FABLE_MASTER  
**Review Required:** YES (before execution)
