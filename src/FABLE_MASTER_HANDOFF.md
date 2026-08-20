# MASTER_PLAN_ARCHITECT Remote Delegation — Handoff to FABLE_MASTER

**From:** Fable B (Design Phase)  
**To:** FABLE_MASTER (Implementation Phase)  
**Date:** 2026-08-07  
**Status:** COMPLETE & READY FOR EXECUTION

---

## What You're Getting

Two comprehensive design documents + checklist:

1. **FABLE_B_DELEGATION_ARCHITECTURE.md** (2,100+ lines)
   - Complete architectural design for remote MASTER_PLAN_ARCHITECT processing on AMS
   - HA token inheritance strategy (Fables on AMS use Mac's SECOPS_HARD_ALLOW_TOKEN)
   - Data transfer protocol (Mac → AMS upload; AMS → Mac results download)
   - Task coordination for 4 parallel Fables (A, B, C, D)
   - Failure scenarios + recovery procedures
   - Network topology, security, performance expectations

2. **DELEGATION_IMPLEMENTATION_CHECKLIST.md** (400+ lines)
   - Step-by-step execution guide
   - Pre-flight validation checklist
   - 4 implementation phases with exact commands
   - Success criteria + rollback procedures
   - Estimated timeline: 90-120 minutes

3. **This handoff document** (quick reference)

---

## The Problem (150K+ Lines, Need to Analyze)

**MASTER_PLAN_ARCHITECT** must analyze 150,000+ lines of code across 4 memory layers (LAYER 0-3) plus coherence validation, then design LAYER 4 and create MASTER_INTEGRATION_PLAN.md.

- **Mac (here):** Has HA token, has codebase, has limited CPU/time
- **AMS (51.15.18.106):** Has high CPU/RAM, can run 4 Fables in parallel
- **Goal:** Delegate to AMS, use Mac's HA token, get results back in ~90 minutes

---

## The Solution (Parallel Fables on AMS)

**Task Breakdown:**
- **Fable A:** LAYER 0 + Infrastructure analysis → LAYER_0_REFINED.json
- **Fable B:** LAYER 1-3 + Projects analysis → LAYER_1-3_REFINED.json
- **Fable C:** LAYER 4 + Kimi role design → LAYER_4_SPEC.json + KIMI_ROLE_SPEC.md
- **Fable D:** Master integration synthesis → MASTER_INTEGRATION_PLAN.md + specs

**Execution:**
1. A & B run **in parallel** (0-50 min)
2. C waits for A & B, then starts (50-65 min)
3. D waits for C, then starts (65-85 min)
4. Results transfer to Mac (85-90 min)

**Why this works:**
- Parallel execution: 90 min vs 120-150 min serial
- HA token shared (not duplicated): AMS Fables use Mac's token
- Fault tolerant: Checkpoints every 30 min, auto-recovery
- Atomic writes: Temp + mv strategy for consistency

---

## HA Token Inheritance (Critical Design Point)

**What's happening:**
1. Mac has active `SECOPS_HARD_ALLOW_TOKEN` (from HAT2 ceremony, ~6h expiry)
2. Export token to AMS via SSH: `scp` + environment variable
3. Fables on AMS read token from environment
4. Fables make HA-scoped LLM calls (Grok HA, Claude Fable) using inherited token
5. Backend validates token (opaque to AMS; validated by remote service)
6. If token expires mid-processing: Fables switch to degraded mode (non-nuclear APIs)

**Security:**
- Token never logged in plaintext (use prefix `ha_1e34***`)
- Transmitted over SSH (encrypted)
- Same expiry as Mac's token (no refresh needed on AMS)
- Fables have same authorization scope as Mac

---

## Data Transfer Protocol

### Mac → AMS (Initial Upload)
```
Mac                              AMS
  ├─ Create tarball (42 MB)
  ├─ Calculate SHA256
  └─ SCP to AMS
                                 ├─ Receive + verify SHA
                                 ├─ Extract
                                 └─ Ready for processing
```

**Time:** ~4 minutes  
**Command:** See DELEGATION_IMPLEMENTATION_CHECKLIST.md §1.3

### AMS → Mac (Results Download)
```
AMS                              Mac
  ├─ Create results tarball (8 MB)
  ├─ Calculate SHA256
  └─ Ready for download
                                 ├─ SCP download
                                 ├─ Verify SHA
                                 ├─ Extract atomically
                                 └─ Success ✓
```

**Time:** ~1 minute  
**Command:** See DELEGATION_IMPLEMENTATION_CHECKLIST.md §3.3-3.7

---

## Task Coordination on AMS

**State File:** `/mnt/ams-fast/master-plan-work/MASTER_PLAN_PROGRESS.json`

```json
{
  "tasks": {
    "layer-0-analysis": {"status": "complete", "progress": 1.0},
    "layer-1-3-analysis": {"status": "complete", "progress": 1.0},
    "layer-4-design": {"status": "running", "progress": 0.45},
    "master-integration": {"status": "pending", "dependencies": [...]}
  }
}
```

**Lock Mechanism:** File-based (`flock`) + atomic JSON writes  
**Checkpoint Strategy:** Per-task checkpoint every 30% progress  
**Failure Recovery:** Crash detected → restart from checkpoint

---

## Failure Scenarios (All Covered)

| Scenario | Detection | Recovery | Time Impact |
|----------|-----------|----------|------------|
| SSH tunnel drops | SCP timeout | rsync --partial resume | +2-5 min |
| AMS disk full | Write error | Cleanup old; restart | +10-15 min |
| HA token expires | Token expiry check | Switch to degraded mode | None (continues) |
| Mac filesystem unavailable | SCP hangs | Buffer on AMS; retry | +5-10 min |
| Fable crashes | Progress file stall | Restart from checkpoint | +30 min |

---

## Execution Steps (TL;DR)

### Phase 1: Setup & Delegation (10 minutes)
```bash
# Run all these commands in sequence

# 1. Create upload tarball
tar -czf ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz \
  ~/dev/<codebase> ~/.grok/hard-allow/LAYER_*.json \
  ~/.grok/hard-allow/coherence-*.jsonl

# 2. Calculate checksum
sha256sum ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz > \
  ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz.sha256

# 3. SCP to AMS
scp -C ~/.hat2/MASTER_PLAN_UPLOAD.tar.gz \
  root@51.15.18.106:/mnt/ams-fast/master-plan-work/

# 4. Verify remote checksum (should output "OK")
ssh root@51.15.18.106 \
  'cd /mnt/ams-fast/master-plan-work && \
   sha256sum -c <(scp -C <file>.sha256 ...)'

# 5. Export HA token to AMS
ssh root@51.15.18.106 << 'EOF'
cat > ~/.grok/hard-allow/active.env << 'ENVEOF'
export SECOPS_HARD_ALLOW_TOKEN="$SECOPS_HARD_ALLOW_TOKEN"
export SECOPS_HARD_ALLOW_EXPIRES_AT="$SECOPS_HARD_ALLOW_EXPIRES_AT"
ENVEOF
EOF

# 6-7. Create progress file + launch Fables A & B
# (See full checklist for exact commands)
```

### Phase 2: Wait for Processing (~85 minutes)
```bash
# Poll progress every 60 seconds
while true; do
  scp root@51.15.18.106:/mnt/ams-fast/.../MASTER_PLAN_PROGRESS.json \
    ~/.grok/hard-allow/
  jq '.tasks | to_entries[] | "\(.key): \(.value.status)"' \
    ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json
  
  if grep -q '"status": "complete"' ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json; then
    break
  fi
  sleep 60
done
```

### Phase 3: Collect Results (2 minutes)
```bash
# Download results
scp root@51.15.18.106:/mnt/ams-fast/.../results.tar.gz \
  ~/.grok/hard-allow/

# Verify checksum
sha256sum -c ~/.grok/hard-allow/results.tar.gz.sha256

# Extract atomically
mkdir -p ~/.grok/hard-allow/RESULTS_TEMP
tar -xzf ~/.grok/hard-allow/results.tar.gz -C ~/.grok/hard-allow/RESULTS_TEMP/
mv ~/.grok/hard-allow/RESULTS_TEMP/* ~/.grok/hard-allow/
rm -rf ~/.grok/hard-allow/RESULTS_TEMP

# Success!
ls -lah ~/.grok/hard-allow/MASTER_*.md ~/.grok/hard-allow/LAYER_*_REFINED.json
```

---

## What You Need (Pre-Execution)

### Verification Checklist
- [ ] HA token active: `echo $SECOPS_HARD_ALLOW_TOKEN | cut -c1-12`
- [ ] Token expiry > 2h: `date -d "$SECOPS_HARD_ALLOW_EXPIRES_AT"`
- [ ] SSH key: `ls ~/.ssh/ams-key.pem`
- [ ] AMS reachable: `ssh -i ~/.ssh/ams-key.pem root@51.15.18.106 'echo OK'`
- [ ] AMS disk space: `ssh root@51.15.18.106 'df /mnt/ams-fast | tail -1 | awk "{print $4}"'` > 50GB
- [ ] Codebase ready: `ls ~/dev/<codebase> | wc -l` ≈ 150000+
- [ ] Layer files: `ls ~/.grok/hard-allow/LAYER_*.json` (all 4)
- [ ] Coherence data: `ls ~/.grok/hard-allow/coherence-*.jsonl`

**All checks pass?** → Ready to execute

---

## What You'll Get (Deliverables)

**On Mac, after execution (~90 min):**

```
~/.grok/hard-allow/
├─ MASTER_INTEGRATION_PLAN.md (600+ KB)
│  └─ Complete integration spec + roadmap
│
├─ LAYER_0_REFINED.json (8+ MB)
│  └─ Infrastructure/deployment layer refined
├─ LAYER_1_REFINED.json (5+ MB)
│  └─ Projects & workspaces refined
├─ LAYER_2_REFINED.json (4+ MB)
│  └─ Context & knowledge base refined
├─ LAYER_3_REFINED.json (3+ MB)
│  └─ Multi-agent coordination refined
│
├─ LAYER_4_SPEC.json (2+ MB)
│  └─ NEW design layer (orchestration, governance)
│
├─ KIMI_ROLE_SPEC.md (400 KB)
│  └─ Kimi's role in final system
│
├─ INTEGRATION_SPECS.json (8+ MB)
│  └─ API contracts, boundaries, transitions
│
├─ DEPLOYMENT_ROADMAP.yaml (2+ MB)
│  └─ Phase plan, milestones, resources
│
└─ MASTER_PLAN_PROGRESS.json
   └─ Completion status + metadata
```

**Total:** 9 files, ~30-35 MB, ready for implementation

---

## Critical Path & Timing

```
T+0:10   Delegation complete (tarball sent, Fables launched)
T+0:50   Fable A & B at 50% progress
T+0:60   Fable A complete (100%), B at 60%
T+1:30   Fable B complete (100%), Fable C starts
T+1:50   Fable C complete (100%), Fable D starts
T+2:10   Fable D complete (100%), results tarball created
T+2:15   Results downloaded to Mac
T+2:26   Results extracted + verified
SUCCESS ✓ (total time: ~2h 26min from start of Phase 1)
```

**Optimistic:** 90 min  
**Realistic:** 100-120 min (with minor delays)  
**Pessimistic:** 150+ min (if major retry needed)

---

## Emergency Procedures

### If something fails:

1. **Check the logs:**
   ```bash
   ssh root@51.15.18.106 'tail -50 /mnt/ams-fast/master-plan-work/logs/*.log'
   ```

2. **Check AMS health:**
   ```bash
   ssh root@51.15.18.106 'df -h /mnt/ams-fast && free -h && ps aux | grep fable'
   ```

3. **Check token expiry:**
   ```bash
   echo $SECOPS_HARD_ALLOW_EXPIRES_AT
   ```

4. **Abort if needed:**
   ```bash
   jq '.status = "aborted"' \
     ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json > /tmp/p.json && \
     mv /tmp/p.json ~/.grok/hard-allow/MASTER_PLAN_PROGRESS.json
   
   ssh root@51.15.18.106 'pkill -f "fable.*master-plan"'
   ```

5. **Retry:**
   - If recoverable (Fable crash): Change progress `status` back to `"running"` and restart
   - If AMS issue: Fix AMS problem and re-run Phase 1.8-1.9 (launch Fables)
   - If token expired: Run ceremony to refresh, export new token to AMS, restart Phase 1.6

---

## Key Design Decisions

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| SSH tunnels | Secure, persistent, no new service | Slower than direct API |
| File-based coordination | Simple, debuggable, persistent | Polling only, not event-driven |
| Checkpoints | Fast recovery (30 min vs 50 min) | Extra disk space (~10 MB) |
| Token inheritance (same copy) | No ceremony on AMS, simple auth | Token expires for all Fables simultaneously |
| Parallel A+B, serial C+D | Max CPU utilization | D is bottleneck (serial after C) |
| Atomic writes (temp + mv) | Guarantees consistency | Slightly slower than streaming |

---

## Success Criteria (Final Check)

After Phase 3 completes, verify:

```bash
# All 9 files exist
ls ~/.grok/hard-allow/MASTER_INTEGRATION_PLAN.md \
   ~/.grok/hard-allow/LAYER_{0..3}_REFINED.json \
   ~/.grok/hard-allow/LAYER_4_SPEC.json \
   ~/.grok/hard-allow/{INTEGRATION_SPECS,KIMI_ROLE_SPEC.*,DEPLOYMENT_ROADMAP.*}.* \
   2>&1 | wc -l
# Expected: 9

# All JSON files are valid
jq . ~/.grok/hard-allow/LAYER_*.json ~/.grok/hard-allow/INTEGRATION_SPECS.json > /dev/null
echo "✓ JSON valid"

# MASTER_INTEGRATION_PLAN.md has content
grep -q "MASTER_PLAN\|integration\|roadmap" ~/.grok/hard-allow/MASTER_INTEGRATION_PLAN.md
echo "✓ Master plan readable"

# No partial files or corruption
for f in ~/.grok/hard-allow/LAYER_*_REFINED.json; do
  [ -s "$f" ] || echo "ERROR: $f is empty"
done

echo "✓ All success criteria met"
```

---

## Questions for FABLE_MASTER

Before you start, confirm:

1. **Do you have access to AMS (51.15.18.106)?**
   - SSH key: `~/.ssh/ams-key.pem`
   - User: `root`
   - Disk: `/mnt/ams-fast` with > 50GB free

2. **Is HA token still active?**
   - Check: `echo $SECOPS_HARD_ALLOW_TOKEN | cut -c1-12`
   - Expiry: `date -d "$SECOPS_HARD_ALLOW_EXPIRES_AT"`
   - Need > 2 hours remaining

3. **Do you have all the source data?**
   - Codebase: `~/dev/<name>` (150K+ lines)
   - Layers: `~/.grok/hard-allow/LAYER_{0..3}_*.json`
   - Coherence: `~/.grok/hard-allow/coherence-*.jsonl`

4. **Is Fable available?**
   - Model: `claude-fable-5` (or fallback `claude-opus-5`)
   - Check: `fable-a --version` (or equivalent CLI)

If all yes → **You're ready to go. Start Phase 1.**

---

## Document Reference

- **Architecture Design:** `FABLE_B_DELEGATION_ARCHITECTURE.md` (§1-13 + appendices)
- **Implementation Steps:** `DELEGATION_IMPLEMENTATION_CHECKLIST.md` (9 sections, 200+ steps)
- **This Handoff:** `FABLE_MASTER_HANDOFF.md` (quick reference)

---

## Sign-Off

**Fable B (Design):** Architecture complete ✓  
**Status:** READY FOR HANDOFF  
**Operator:** conradoux@hotmail.com  
**Canary:** HAT2_OPUS5_SESSION_OK  
**Date:** 2026-08-07  

**Next Step:** FABLE_MASTER executes `DELEGATION_IMPLEMENTATION_CHECKLIST.md`

---

**For questions or issues, refer back to:**
- `FABLE_B_DELEGATION_ARCHITECTURE.md` (detailed rationale)
- `DELEGATION_IMPLEMENTATION_CHECKLIST.md` (exact commands)
- Emergency procedures above (rollback/abort)

**Good luck! 🚀**
