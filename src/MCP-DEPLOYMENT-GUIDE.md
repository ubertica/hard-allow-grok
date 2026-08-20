# MCP Context Query Pipeline — Deployment Guide

**Production deployment checklist for always-running semantic context query service.**

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User's LLM Environment                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Claude  │  │   Grok   │  │   Kimi   │  │  Fable   │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │             │             │             │            │
│       └─────────────┴─────────────┴─────────────┘            │
│                     │ MCP Protocol                            │
│                     ▼                                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │     ~/.grok/.mcp/tools/context-query-pipeline.json    │  │
│  │     ~/.claude/.mcp/tools/context-query-pipeline.json  │  │
│  │     ~/.kimi/.mcp/tools/context-query-pipeline.json    │  │
│  │     ~/.fable/.mcp/tools/context-query-pipeline.json   │  │
│  └────────────────┬────────────────────────────────────┘  │
│                   │ (symlink or copy)                        │
└───────────────────┼────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   ┌─────────────┐      ┌──────────────┐
   │TCP:9999     │      │Unix:mcp.sock │
   │9998 health  │      │              │
   └──────┬──────┘      └──────┬───────┘
          │                    │
          └────────┬───────────┘
                   ▼
      ┌────────────────────────────┐
      │  mcp-server-daemon.mjs     │
      │  (always running)          │
      │  • Connection handler      │
      │  • Tool dispatcher         │
      │  • Auto-reload (SIGHUP)    │
      └────────────┬───────────────┘
                   │
      ┌────────────▼───────────┐
      │ QueryEngine (indexed)  │
      │ • Tags index           │
      │ • Capabilities index   │
      │ • Type index           │
      └────────────┬───────────┘
                   │
      ┌────────────▼──────────────────┐
      │  Context Node Registry         │
      │ ~/.grok/context-nodes/         │
      │ ├─ state.json (78 nodes)      │
      │ ├─ search-index.json (full-text)
      │ └─ SHARED_NODE_REGISTRY.json  │
      └───────────────────────────────┘
```

---

## Pre-Deployment Checklist

- [ ] Node.js 18+ installed (`node --version`)
- [ ] Bash available (`bash --version`)
- [ ] macOS (launchd) or Linux (systemd) OS
- [ ] Network ports 9998–9999 available (`lsof -i :9999`)
- [ ] `~/.grok` directory exists and writable
- [ ] Context node registry exists (`~/.grok/context-nodes/state.json`)

---

## Step 1: Install Daemon (5 minutes)

### 1a. Run installation script

```bash
cd ~/.grok/hard-allow
bash mcp-daemon-install.sh --install
```

**What happens:**
- ✓ Verifies Node.js, bash, and required scripts
- ✓ Creates launchd plist (macOS) or systemd service (Linux)
- ✓ Registers tool in all 4 LLM MCP configs
- ✓ Starts daemon immediately
- ✓ Configures auto-start on boot

### 1b. Verify installation

```bash
bash mcp-daemon-install.sh --status
```

**Expected output:**
```
[STATUS] Checking MCP daemon status
[STATUS] Daemon is running (PID: 12345)
[STATUS] launchd service: loaded (macOS)
[STATUS] Health check: OK
[STATUS] Details: {"status":"ok","uptime_ms":1234,...}
```

### 1c. Run startup check

```bash
bash mcp-daemon-startup-check.sh
```

**Expected output:**
```
=== MCP Daemon Startup Check ===

Files:
✓ Tool script exists
✓ Daemon script exists
✓ Install script exists

...

=== Summary ===
Passed: 12
Failed: 0

✓ All checks passed!
Tool is ready to use from all LLMs.
```

---

## Step 2: Verify Registration (2 minutes)

### 2a. Check MCP tool configs

```bash
# Grok
cat ~/.grok/.mcp/tools/context-query-pipeline.json

# Claude
cat ~/.claude/.mcp/tools/context-query-pipeline.json

# Kimi
cat ~/.kimi/.mcp/tools/context-query-pipeline.json

# Fable
cat ~/.fable/.mcp/tools/context-query-pipeline.json
```

**Expected content:**
```json
{
  "type": "command",
  "command": "node",
  "args": [
    "~/.grok/hard-allow/mcp-context-query-pipeline.mjs",
    "--server"
  ],
  ...
}
```

### 2b. Test health endpoints

```bash
# Health check
curl -s http://127.0.0.1:9998/health | jq .

# Cache stats
curl -s http://127.0.0.1:9998/stats | jq .
```

**Expected output:**
```json
{
  "status": "ok",
  "uptime_ms": 2345,
  "connections": 0,
  "pid": 12345,
  "timestamp": "2026-08-07T01:30:00Z"
}
```

### 2c. Test tool directly

```bash
# Query via CLI
node ~/.grok/hard-allow/mcp-context-query-pipeline.mjs "crypto" 5

# Expected: 1-5 matching nodes with scores
```

---

## Step 3: Test from Each LLM (5-10 minutes per LLM)

### Test Claude

```bash
claude

# In Claude:
> Use context_query_pipeline to find all system nodes.

Claude responds with:
✓ Tool call: context_query_pipeline({query: "system", limit: 20})
✓ Returns nodes with scores and labels
✓ Formats as JSON-streaming by default
```

### Test Grok

```bash
grok

# In Grok:
> Run context_query_pipeline for nodes tagged "offense".

Grok responds with:
✓ Tool call executes
✓ Results stream back
✓ Identical response to Claude
```

### Test Kimi

Similar test (check if MCP support is enabled).

### Test Multi-LLM Orchestration

```bash
# Terminal 1: Ask Claude
claude "Query context nodes for 'infrastructure' capabilities"

# Terminal 2: Ask Grok (concurrently)
grok "Find nodes matching tag 'defense'"

# Expected: Both complete within 100-200ms each
```

---

## Step 4: Production Monitoring (Ongoing)

### 4a. Daily health check

```bash
bash ~/.grok/hard-allow/mcp-daemon-install.sh --status
```

Add to crontab (optional):
```bash
# Check daemon health every 6 hours
0 */6 * * * bash ~/.grok/hard-allow/mcp-daemon-install.sh --status >> ~/.grok/hard-allow/health-check.log 2>&1
```

### 4b. Monitor logs

```bash
# Tail daemon logs in real-time
tail -f ~/.grok/hard-allow/mcp-daemon.log

# Search for errors
grep -i error ~/.grok/hard-allow/mcp-daemon.log

# Check connection count
grep "New.*connection" ~/.grok/hard-allow/mcp-daemon.log | wc -l
```

### 4c. Performance metrics

```bash
# Check cache hit rate
curl -s http://127.0.0.1:9998/stats | jq '.size'

# Monitor uptime
curl -s http://127.0.0.1:9998/health | jq '.uptime_ms'

# Check process memory (macOS)
ps aux | grep mcp-server-daemon | grep -v grep
```

### 4d. Network diagnostics

```bash
# Check if ports are listening
lsof -i :9998
lsof -i :9999

# Test TCP connection
nc -zv 127.0.0.1 9999

# Test Unix socket
nc -U ~/.grok/hard-allow/mcp.sock
```

---

## Step 5: Integration with Workflows

### Example 1: Context-aware code generation

```bash
claude

> Query my context for "autonomy core" and use those nodes 
> to generate a task DAG for self-improvement loop implementation.

# Claude uses:
# context_query_pipeline({query: "autonomy", limit: 10})
# → Gets autonomy-core project node + capability details
# → Generates DAG with context awareness
```

### Example 2: Multi-domain threat analysis

```bash
grok

> Search my context for all nodes tagged "offense" + "c2"
> and summarize attack infrastructure.

# Grok uses:
# context_query_pipeline({tags: ["offense", "c2"], limit: 50})
# → Gets huhu-cloud, infrastructure, endpoints
# → Summarizes live C2 infrastructure state
```

### Example 3: Hard-allow grant verification

```bash
claude

> Find all nuclear grants in my context and verify 
> active authorization status.

# Claude uses:
# context_query_pipeline({tags: ["nuclear"], limit: 20})
# → Gets all hardAllow.* nodes
# → Checks expiry tokens and status
```

---

## Troubleshooting Deployment

### Issue: Daemon fails to start

```bash
# Check logs
tail -50 ~/.grok/hard-allow/mcp-daemon.log
tail -50 ~/.grok/hard-allow/mcp-daemon-error.log

# Verify Node.js
node --version  # Should be 18+

# Check if port is in use
lsof -i :9999   # Should be empty

# Kill stale process
kill -9 $(lsof -t -i :9999)

# Try manual start
node ~/.grok/hard-allow/mcp-server-daemon.mjs
```

### Issue: Tool not appearing in LLM config

```bash
# Re-run registration
bash ~/.grok/hard-allow/mcp-tool-registration.sh

# Verify config files exist
ls -la ~/.claude/.mcp/tools/context-query-pipeline.json
ls -la ~/.grok/.mcp/tools/context-query-pipeline.json

# Check config is valid JSON
jq . ~/.claude/.mcp/tools/context-query-pipeline.json
```

### Issue: Slow queries (>500ms)

```bash
# Check cache stats
curl -s http://127.0.0.1:9998/stats

# If cache is full (size=50), reload indexes
kill -HUP $(cat ~/.grok/hard-allow/mcp-daemon.pid)

# Check node registry size
wc -l ~/.grok/context-nodes/state.json

# Monitor query times
grep "call_tool" ~/.grok/hard-allow/mcp-daemon.log | head -20
```

### Issue: Connections timeout or drop

```bash
# Increase TCP backlog (macOS)
sysctl net.inet.tcp.somaxconn

# Check active connections
lsof -i :9999 | grep ESTABLISHED

# Monitor daemon logs for "Connection error"
grep "Connection error" ~/.grok/hard-allow/mcp-daemon.log

# Restart daemon
launchctl stop com.jailbroken.mcp-context-query-pipeline
sleep 2
launchctl start com.jailbroken.mcp-context-query-pipeline
```

---

## Uninstallation (if needed)

```bash
bash ~/.grok/hard-allow/mcp-daemon-install.sh --uninstall
```

**What happens:**
- ✓ Stops daemon
- ✓ Removes launchd plist (macOS) or systemd service (Linux)
- ✓ Leaves tool scripts and configs in place (safe to reinstall)

---

## Performance Tuning

### Increase cache size (for high-volume deployments)

Edit `mcp-context-query-pipeline.mjs`, line ~150:
```javascript
this.cache = new LRUCache(100, 5 * 60 * 1000);  // Changed from 50 to 100
```

Restart daemon:
```bash
kill -HUP $(cat ~/.grok/hard-allow/mcp-daemon.pid)
```

### Enable debug logging

```bash
# Set environment variable
export DEBUG_MCP_DAEMON=1

# Restart daemon
launchctl stop com.jailbroken.mcp-context-query-pipeline
launchctl start com.jailbroken.mcp-context-query-pipeline

# Tail debug logs
tail -f ~/.grok/hard-allow/mcp-daemon.log | grep DEBUG
```

### Parallel connection limits

Daemon auto-scales to number of CPUs. No tuning needed.

---

## Backup & Recovery

### Backup daemon configuration

```bash
# Backup installed plist/service
cp ~/Library/LaunchAgents/com.jailbroken.mcp-context-query-pipeline.plist \
   ~/.grok/hard-allow/backup-launchd.plist

# Backup tool configs
cp -r ~/.grok/.mcp/tools ~/.grok/hard-allow/backup-mcp-tools
cp -r ~/.claude/.mcp/tools ~/.grok/hard-allow/backup-claude-mcp-tools
```

### Restore from backup

```bash
# If launchd plist was deleted
cp ~/.grok/hard-allow/backup-launchd.plist \
   ~/Library/LaunchAgents/com.jailbroken.mcp-context-query-pipeline.plist
launchctl load ~/Library/LaunchAgents/com.jailbroken.mcp-context-query-pipeline.plist

# If tool configs were deleted
cp -r ~/.grok/hard-allow/backup-mcp-tools/* ~/.grok/.mcp/tools/
```

---

## Production Deployment Checklist

### Pre-deployment
- [ ] All nodes in `~/.grok/context-nodes/state.json` are valid JSON
- [ ] Node registry is under 1GB (typical: ~5MB)
- [ ] Network ports 9998–9999 are available
- [ ] User has write permission to `~/.grok/hard-allow/`
- [ ] Daemon install/uninstall scripts are executable

### Installation
- [ ] `mcp-daemon-install.sh --install` completes without errors
- [ ] `mcp-daemon-install.sh --status` shows "ok"
- [ ] `mcp-daemon-startup-check.sh` passes all tests (12/12)
- [ ] Daemon appears in launchctl (macOS) or systemctl (Linux)

### Validation
- [ ] curl to health endpoint returns 200 OK
- [ ] Tool configs exist in all 4 LLM directories
- [ ] Tool test query returns results within 100ms
- [ ] Each LLM (Claude, Grok, Kimi) can invoke tool successfully

### Post-deployment
- [ ] Health checks passing (daemon running, ports listening)
- [ ] Cache stats show reasonable hit rate
- [ ] Logs are being written to mcp-daemon.log
- [ ] No error messages in daemon logs
- [ ] Uninstall script tested (optional, for rollback plan)

---

## Support & Escalation

### Quick support checklist

1. **Is daemon running?**
   ```bash
   ps aux | grep mcp-server-daemon
   ```

2. **Are ports listening?**
   ```bash
   lsof -i :9998
   lsof -i :9999
   ```

3. **Health check passing?**
   ```bash
   curl -s http://127.0.0.1:9998/health
   ```

4. **Recent errors in logs?**
   ```bash
   tail -50 ~/.grok/hard-allow/mcp-daemon*.log | grep -i error
   ```

5. **Node registry valid?**
   ```bash
   jq . ~/.grok/context-nodes/state.json > /dev/null && echo "valid"
   ```

If all 5 checks pass, tool should be operational. Check LLM-specific MCP configuration if tool still isn't discoverable.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-08-07 | Initial production release |

---

**Last Updated:** 2026-08-07  
**Maintainer:** HAT2 Infrastructure  
**Status:** Production Ready
