# MASTER_PLAN_ARCHITECT Remote Delegation - Implementation Checklist

**Architecture:** FABLE_B_DELEGATION_ARCHITECTURE.md (2,100+ lines)  
**Status:** READY FOR IMPLEMENTATION  
**Owner:** FABLE_MASTER  
**Operator:** conradoux@hotmail.com (HAT2_OPUS5_SESSION_OK)

---

## Pre-Implementation Verification (Mac)

### Environment Checks
- [ ] HA token active: `echo $SECOPS_HARD_ALLOW_TOKEN | cut -c1-12`
- [ ] Token expiry > 2h: `date -d "$SECOPS_HARD_ALLOW_EXPIRES_AT"` (shows ~6h from now)
- [ ] SSH key exists: `ls -l ~/.ssh/ams-key.pem` (0600 permissions)
- [ ] AMS reachable: `ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 'echo OK'`
- [ ] AMS disk space: `ssh root@51.15.18.106 'df /mnt/ams-fast | awk "NR==2 {print $4}"'` (> 50GB)
- [ ] Codebase ready: `ls ~/dev/<codebase> | wc -l` (150K+ lines)
- [ ] Layer state files: `ls -lah ~/.grok/hard-allow/LAYER_*.json` (all 4 files)
- [ ] Coherence results: `ls -lah ~/.grok/hard-allow/coherence-*.jsonl` (validation complete)
- [ ] Claude Code session OK: `grep HAT2_OPUS5_SESSION_OK ~/.grok/hard-allow/CLAUDE_CODE_SESSION_IDENTITY.md`

**Success Criteria:** All boxes checked ✓

---

## Implementation Phase 1: Task Delegation (Mac → AMS)

### Step 1.1: Create Upload Tarball
```bash
# Command:
tar --exclude=.git --exclude=node_modules -czf \
  ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz \
  ~/dev/<codebase-path> \
  ~/.grok/hard-allow/LAYER_*.json \
  ~/.grok/hard-allow/coherence-*.jsonl

# Verify size (should be 40-50MB compressed):
ls -lh ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz

# Expected: ~42 MB (33% of 131 MB uncompressed)
```

- [ ] Tarball created
- [ ] Size reasonable (30-50 MB)
- [ ] No errors during compression

### Step 1.2: Calculate Checksum
```bash
# Command:
sha256sum ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz > \
  ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz.sha256

# Verify:
cat ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz.sha256

# Expected: 64-char hex string
```

- [ ] Checksum calculated
- [ ] Stored in .sha256 file

### Step 1.3: Transfer to AMS
```bash
# Command:
scp -C \
  -o ConnectTimeout=10 \
  -i ~/.ssh/ams-key.pem \
  ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz \
  root@51.15.18.106:/mnt/ams-fast/master-plan-work/upload.tar.gz

# Expected: 3-4 minutes (42 MB at 100 Mbps)
```

- [ ] SCP started
- [ ] File transferred (watch for 100% progress)
- [ ] No timeout errors
- [ ] Duration: 3-4 minutes

### Step 1.4: Verify Remote Checksum
```bash
# Command:
scp -i ~/.ssh/ams-key.pem \
  ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz.sha256 \
  root@51.15.18.106:/mnt/ams-fast/master-plan-work/

ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 \
  'cd /mnt/ams-fast/master-plan-work && sha256sum -c upload.tar.gz.sha256'

# Expected: "upload.tar.gz: OK"
```

- [ ] Checksum file transferred
- [ ] Remote verification successful
- [ ] Output says "OK"

### Step 1.5: Extract on AMS
```bash
# Command:
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 << 'EOF'
mkdir -p /mnt/ams-fast/master-plan-work/{results,checkpoints,logs}
cd /mnt/ams-fast/master-plan-work
tar -xzf upload.tar.gz
ls -lah
EOF

# Expected: codebase, layers, coherence files present
```

- [ ] Directories created
- [ ] Tarball extracted
- [ ] File listing shows expected contents

### Step 1.6: Export HA Token to AMS
```bash
# Command:
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 << EOF
cat > ~/.grok/hard-allow/active.env << 'ENVEOF'
export SECOPS_HARD_ALLOW_TOKEN="$SECOPS_HARD_ALLOW_TOKEN"
export SECOPS_HARD_ALLOW_EXPIRES_AT="$SECOPS_HARD_ALLOW_EXPIRES_AT"
export SECOPS_HARD_ALLOW_ACTIVE=1
ENVEOF

chmod 0600 ~/.grok/hard-allow/active.env
cat ~/.grok/hard-allow/active.env | grep -o "^export.*TOKEN.*"
EOF

# Expected: "export SECOPS_HARD_ALLOW_TOKEN=ha_1e34***"
```

- [ ] Active.env created on AMS
- [ ] Permissions set to 0600
- [ ] Token prefix visible (ha_1e34...)

### Step 1.7: Create Progress Tracking File
```bash
# Command:
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 << 'EOF'
cat > /mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json << 'JSONEOF'
{
  "taskId": "master-plan-2026-08-07-session",
  "status": "ready-to-start",
  "startedAt": null,
  "tasks": {
    "layer-0-analysis": {
      "fableId": null,
      "status": "pending",
      "progress": 0,
      "startedAt": null,
      "completedAt": null
    },
    "layer-1-3-analysis": {
      "fableId": null,
      "status": "pending",
      "progress": 0,
      "startedAt": null,
      "completedAt": null
    },
    "layer-4-design": {
      "fableId": null,
      "status": "pending",
      "dependencies": ["layer-0-analysis", "layer-1-3-analysis"]
    },
    "master-integration": {
      "fableId": null,
      "status": "pending",
      "dependencies": ["layer-0-analysis", "layer-1-3-analysis", "layer-4-design"]
    }
  },
  "errors": [],
  "lastUpdate": "2026-08-07T00:00:00Z"
}
JSONEOF

jq . /mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json
EOF

# Expected: Valid JSON structure
```

- [ ] Progress file created
- [ ] JSON valid (jq parsed successfully)
- [ ] All tasks listed with status "pending"

### Step 1.8: Launch Fable A (LAYER 0 Analysis)
```bash
# Command:
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 << 'EOF'
source ~/.grok/hard-allow/active.env

nohup fable-a \
  --task layer-0-analysis \
  --data /mnt/ams-fast/master-plan-work \
  --progress /mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json \
  --log /mnt/ams-fast/master-plan-work/logs/fable-a.log \
  > /mnt/ams-fast/master-plan-work/logs/fable-a.nohup.log 2>&1 &

sleep 2
ps aux | grep "fable-a" | grep -v grep
EOF

# Expected: Process running, PID visible
```

- [ ] Fable A launched
- [ ] Process visible in ps output
- [ ] No errors in nohup log

### Step 1.9: Launch Fable B (LAYER 1-3 Analysis)
```bash
# Command:
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 << 'EOF'
source ~/.grok/hard-allow/active.env

nohup fable-b \
  --task layer-1-3-analysis \
  --data /mnt/ams-fast/master-plan-work \
  --progress /mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json \
  --log /mnt/ams-fast/master-plan-work/logs/fable-b.log \
  > /mnt/ams-fast/master-plan-work/logs/fable-b.nohup.log 2>&1 &

sleep 2
ps aux | grep "fable-[ab]" | grep -v grep
EOF

# Expected: Both Fable A and B running
```

- [ ] Fable B launched
- [ ] Both A and B visible in ps output
- [ ] No errors

---

## Implementation Phase 2: Processing Monitoring (Mac)

### Step 2.1: Initial Progress Poll (T+0 to T+5 min)
```bash
# Command:
scp -i ~/.ssh/ams-key.pem \
  root@51.15.18.106:/mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json \
  ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json

jq '.tasks | to_entries[] | "\(.key): \(.value.status) (\(.value.progress * 100 | round)%)"' \
  ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json

# Expected:
# "layer-0-analysis: running (5%)"
# "layer-1-3-analysis: running (2%)"
# "layer-4-design: pending (0%)"
# "master-integration: pending (0%)"
```

- [ ] Progress file downloaded
- [ ] Both A and B show "running"
- [ ] Progress > 0%

### Step 2.2: Mid-Processing Check (T+20 to T+40 min)
```bash
# Command: (repeat previous poll)
# Expected:
# "layer-0-analysis: running (50%)"
# "layer-1-3-analysis: running (30%)"
```

- [ ] Fable A progressing toward 50%
- [ ] Fable B progressing toward 30%
- [ ] No errors in progress file

### Step 2.3: Fable A Completion (T+40 to T+60 min)
```bash
# Command: (repeat poll)
# Expected:
# "layer-0-analysis: complete (100%)"
# "layer-1-3-analysis: running (60%)"
```

- [ ] Fable A reaches 100%
- [ ] Fable B continues
- [ ] layer-4-design still pending

### Step 2.4: Fable B Completion (T+60 to T+90 min)
```bash
# Command: (repeat poll)
# Expected:
# "layer-0-analysis: complete (100%)"
# "layer-1-3-analysis: complete (100%)"
# "layer-4-design: running (10%)"
```

- [ ] Fable B reaches 100%
- [ ] Fable C auto-launches (check logs)
- [ ] layer-4-design changes from pending to running

### Step 2.5: Fable C Completion (T+90 to T+120 min)
```bash
# Command: (repeat poll)
# Expected:
# "layer-4-design: complete (100%)"
# "master-integration: running (5%)"
```

- [ ] Fable C completes
- [ ] Fable D auto-launches
- [ ] master-integration starts

### Step 2.6: Fable D Completion (T+120 to T+150 min)
```bash
# Command: (repeat poll)
# Expected:
# "master-integration: complete (100%)"
```

- [ ] All 4 tasks complete
- [ ] status: "complete"

---

## Implementation Phase 3: Result Collection (Mac)

### Step 3.1: Verify Completion on AMS
```bash
# Command:
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 \
  'ls -lah /mnt/ams-fast/master-plan-work/results/'

# Expected:
# MASTER_INTEGRATION_PLAN.md
# LAYER_0_REFINED.json
# LAYER_1_REFINED.json
# LAYER_2_REFINED.json
# LAYER_3_REFINED.json
# LAYER_4_SPEC.json
# INTEGRATION_SPECS.json
# DEPLOYMENT_ROADMAP.yaml
# KIMI_ROLE_SPEC.md
```

- [ ] Results directory exists
- [ ] All 9 expected files present
- [ ] File sizes reasonable (not empty)

### Step 3.2: Create Results Tarball (AMS)
```bash
# Command:
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 << 'EOF'
cd /mnt/ams-fast/master-plan-work/results
tar -czf ../results.tar.gz .
sha256sum ../results.tar.gz > ../results.tar.gz.sha256
ls -lh ../results.tar.gz*
EOF

# Expected: results.tar.gz ~8-10 MB
```

- [ ] Results tarball created
- [ ] Checksum calculated
- [ ] Size: 8-10 MB (compressed from 28 MB)

### Step 3.3: Download Results to Mac
```bash
# Command:
scp -C \
  -o ConnectTimeout=10 \
  -i ~/.ssh/ams-key.pem \
  root@51.15.18.106:/mnt/ams-fast/master-plan-work/results.tar.gz \
  ~/.grok/hard-allow/MASTER_PLAN_RESULTS_TEMP.tar.gz

# Expected: 30-50 seconds (8 MB at 100 Mbps)
```

- [ ] Results tarball downloaded
- [ ] File present: `~/.grok/hard-allow/MASTER_PLAN_RESULTS_TEMP.tar.gz`
- [ ] Duration: 30-50 sec

### Step 3.4: Download and Verify Checksum
```bash
# Command:
scp -i ~/.ssh/ams-key.pem \
  root@51.15.18.106:/mnt/ams-fast/master-plan-work/results.tar.gz.sha256 \
  ~/.grok/hard-allow/

cd ~/.grok/hard-allow/
mv MASTER_PLAN_RESULTS_TEMP.tar.gz results.tar.gz
sha256sum -c results.tar.gz.sha256

# Expected: "results.tar.gz: OK"
```

- [ ] Checksum file downloaded
- [ ] Checksum verification passes
- [ ] Output says "OK"

### Step 3.5: Extract Results Safely (Atomic)
```bash
# Command:
mkdir -p ~/.grok/hard-allow/MASTER_PLAN_RESULTS_<TIMESTAMP>
tar -xzf ~/.grok/hard-allow/results.tar.gz \
  -C ~/.grok/hard-allow/MASTER_PLAN_RESULTS_<TIMESTAMP>/

# Verify all required files
for file in \
  MASTER_INTEGRATION_PLAN.md \
  LAYER_0_REFINED.json \
  LAYER_1_REFINED.json \
  LAYER_2_REFINED.json \
  LAYER_3_REFINED.json \
  LAYER_4_SPEC.json \
  INTEGRATION_SPECS.json \
  DEPLOYMENT_ROADMAP.yaml \
  KIMI_ROLE_SPEC.md; do
  [ -f "~/.grok/hard-allow/MASTER_PLAN_RESULTS_<TIMESTAMP>/$file" ] || echo "MISSING: $file"
done

# If all present, atomic rename
mv ~/.grok/hard-allow/MASTER_PLAN_RESULTS_<TIMESTAMP>/* ~/.grok/hard-allow/
rmdir ~/.grok/hard-allow/MASTER_PLAN_RESULTS_<TIMESTAMP>
```

- [ ] Temp directory created
- [ ] Tarball extracted
- [ ] All 9 files present
- [ ] Atomic rename completed
- [ ] Temp directory removed

### Step 3.6: Verify Final Files
```bash
# Command:
ls -lah ~/.grok/hard-allow/MASTER_*.{md,json,yaml} 2>/dev/null | head -15

# Expected:
# MASTER_INTEGRATION_PLAN.md (600+ KB)
# MASTER_PLAN_PROGRESS.json (updated)
# etc.
```

- [ ] All result files present
- [ ] Sizes reasonable (not empty)
- [ ] Readable (no corruption)

### Step 3.7: Quick Content Validation
```bash
# Command:
jq '.' ~/.grok/hard-allow/LAYER_0_REFINED.json > /dev/null && echo "✓ LAYER 0"
jq '.' ~/.grok/hard-allow/LAYER_1_REFINED.json > /dev/null && echo "✓ LAYER 1"
jq '.' ~/.grok/hard-allow/LAYER_2_REFINED.json > /dev/null && echo "✓ LAYER 2"
jq '.' ~/.grok/hard-allow/LAYER_3_REFINED.json > /dev/null && echo "✓ LAYER 3"
jq '.' ~/.grok/hard-allow/LAYER_4_SPEC.json > /dev/null && echo "✓ LAYER 4"
grep -q "MASTER_PLAN" ~/.grok/hard-allow/MASTER_INTEGRATION_PLAN.md && echo "✓ Master Plan"

# Expected: All lines show ✓
```

- [ ] All JSON files valid
- [ ] Master plan file readable
- [ ] No corruption detected

---

## Post-Completion: Cleanup & Archival

### Step 4.1: Cleanup AMS Working Directory
```bash
# Command:
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 << 'EOF'
cd /mnt/ams-fast/master-plan-work
tar -czf /mnt/archive/master-plan-2026-08-07-ARCHIVE.tar.gz .
rm -rf /mnt/ams-fast/master-plan-work/*
echo "Cleanup complete"
EOF
```

- [ ] Archive created
- [ ] Working directory cleaned
- [ ] Free space restored on AMS

### Step 4.2: Cleanup Mac Temp Files
```bash
# Command:
rm ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz*
rm ~/.grok/hard-allow/results.tar.gz*

# Expected: No temp files
```

- [ ] Upload tarball deleted
- [ ] Results tarball deleted

### Step 4.3: Log Completion
```bash
# Command:
echo "2026-08-07 MASTER_PLAN_ARCHITECT COMPLETE (~90 min)" \
  >> ~/.grok/hard-allow/master-plan-runs.log

tail ~/.grok/hard-allow/master-plan-runs.log
```

- [ ] Completion logged
- [ ] Timestamp recorded

---

## Success Criteria (All Must Pass)

- [ ] **Process Time:** 60-120 minutes (target: 90 min)
- [ ] **File Count:** 9 result files present in `~/.grok/hard-allow/`
- [ ] **File Sizes:** No files empty, all readable
- [ ] **Data Integrity:** All JSON valid, checksums match
- [ ] **Token Usage:** HA token remained active throughout (or degraded mode if expired)
- [ ] **Error Count:** 0 fatal errors; 0-2 recoverable errors acceptable
- [ ] **No Timeouts:** No SSH timeouts, no SCP hangs
- [ ] **Atomicity:** All results extracted atomically, no partial writes
- [ ] **Cleanup:** AMS cleaned, temp files removed

---

## Rollback / Abort Procedures

### If Any Phase Fails Before Completion:

1. **Identify failure point** (Phase 1, 2, or 3)
2. **Read error log:** `ssh root@51.15.18.106 'cat /mnt/ams-fast/master-plan-work/logs/*.log'`
3. **Check AMS disk:** `ssh root@51.15.18.106 'df -h /mnt/ams-fast'`
4. **Check HA token:** `echo $SECOPS_HARD_ALLOW_EXPIRES_AT` (still valid?)
5. **Review checkpoint:** `ssh root@51.15.18.106 'ls -lah /mnt/ams-fast/master-plan-work/checkpoints/'`
6. **Options:**
   - **Retry:** Same phase, same Fables (resume from checkpoint)
   - **Restart:** Kill Fables, reset progress file to "pending", restart Phase 1
   - **Abort:** Update progress file `status: "aborted"`, cleanup, document failure

### Full Abort Command:
```bash
# Stop all Fables on AMS
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 \
  'pkill -f "fable.*master-plan"'

# Mark as aborted
jq '.status = "aborted", .abortedAt = now | todate' \
  ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json > /tmp/p.json && \
  mv /tmp/p.json ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json

# Cleanup AMS (preserves checkpoints for inspection)
ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 \
  'rm -f /mnt/ams-fast/master-plan-work/results/*'
```

---

## Estimated Timeline

| Phase | Duration | Notes |
|-------|----------|-------|
| 1.1-1.7 | ~10 min | Setup (compress, transfer, token export) |
| 1.8-1.9 | ~2 min | Launch Fables A & B |
| A+B (parallel) | ~50 min | LAYER 0 & 1-3 analysis |
| C (after A, B) | ~15 min | LAYER 4 design |
| D (after C) | ~20 min | Master integration |
| 3.1-3.7 | ~5 min | Result download & extraction |
| **Total** | **~102 min** | **~1h 45min** |

---

## Contingency Plans

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| SSH timeout | Low | High | Retry with higher timeout; check AMS network |
| AMS disk full | Very low | High | Pre-flight check; reserve 20GB |
| HA token expiry | Low | Medium | Degraded mode activated; acceptable |
| Fable crash | Medium | Low | Checkpoint restart (30 min recovery time) |
| Partial file loss | Very low | High | Atomic writes + verification |

---

## Sign-Off

- [ ] Architecture reviewed: FABLE_B_DELEGATION_ARCHITECTURE.md ✓
- [ ] Pre-flight checks completed ✓
- [ ] Checklist understood ✓
- [ ] Ready for implementation ✓

**Operator:** conradoux@hotmail.com  
**Session:** HAT2_OPUS5_SESSION_OK  
**Date:** 2026-08-07  
**Status:** DESIGN PHASE COMPLETE — READY FOR HANDOFF TO FABLE_MASTER
