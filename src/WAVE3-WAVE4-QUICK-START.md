# Wave 3 + Wave 4: Quick Start Guide

**Setup Time**: 5 minutes  
**Production Ready**: YES

## Installation

All files pre-installed in `~/.grok/hard-allow/`:

```bash
# Verify installation
ls -lh ~/.grok/hard-allow/{fable-integration,metrics-collector,observability-dashboard,cloud-deploy}.mjs
```

## Wave 3: Fable Integration

### Overview

Parallel multi-agent arming system:
- 3 LLM injectors run simultaneously (2s vs 6s)
- Context hydrator runs in parallel
- Automatic rollback on ANY critical failure
- Circuit breaker for unreliable agents

### Basic Usage

```javascript
// In arm-v2.mjs or custom script
import { spawnFablePool, consolidateResults } from './fable-integration.mjs';

// Spawn 3 parallel rule injectors
const pool = await spawnFablePool(
  ['rule-injector', 'rule-injector', 'rule-injector', 'context-hydrator'],
  { rules: sessionRules, grants: [...] },
  { defaultTimeout: 20000 }
);

// Wait for all agents
const results = await pool.waitAll();
console.log(`Success: ${results.filter(r => r.status === 'success').length}/${results.length}`);

// Consolidate and save metrics
const consolidated = await consolidateResults(pool);
```

### Configuration

```bash
# Set environment variables
export FABLE_AGENT_TIMEOUT_MS=30000           # 30s timeout
export FABLE_CIRCUIT_BREAKER_THRESHOLD=3      # fail after 3 timeouts
export FABLE_METRICS_ENABLED=1                # collect metrics
```

### Troubleshooting

```bash
# View agent logs
grep "FablePool\|FableAgent" ~/.grok/hard-allow/fable-agents.jsonl

# Check circuit breaker status
cat ~/.grok/hard-allow/fable-agents.jsonl | tail -1 | jq '.agents[] | select(.circuitBreakerCount > 0)'
```

## Wave 4: Observability & Cloud

### 1. Metrics Collection

#### Automatic Collection

Already integrated into arm-v2.mjs — metrics recorded to `~/.grok/hard-allow/metrics.jsonl`

#### Manual Collection

```javascript
import { MetricsCollector } from './metrics-collector.mjs';

const collector = new MetricsCollector();
collector.recordArmStart();

// ... perform work ...

collector.recordInjection('grok', 2100, 'success');
collector.recordContextNodeHydration('node-1', 1500, 42);
collector.recordArmEnd();

collector.save();  // Write to metrics.jsonl + metrics.prom
```

#### View Metrics

```bash
# Latest metrics
node ~/.grok/hard-allow/metrics-collector.mjs --latest | jq .

# Trend analysis
node ~/.grok/hard-allow/metrics-collector.mjs --analyze

# Prometheus format
node ~/.grok/hard-allow/metrics-collector.mjs --export-prometheus > metrics.prom
```

### 2. Real-Time Dashboard

#### Interactive Dashboard

```bash
# View system health
node ~/.grok/hard-allow/observability-dashboard.mjs

# Expected output:
# SYSTEM STATUS:
#   Sessions tracked: 42
#   Healthy sessions: 42/42
# 
# ARM DURATION TREND (last 10 sessions):
#   ▁▂▃▄▅▆▇█▇▆
#   Min: 7800ms | Avg: 8150ms | Max: 8500ms | Current: 8234ms
#
# LLM INJECTION LATENCY:
#   GROK
#     ▁▂▃▄▅▆▇█▆▅  (30 chars)
#     Avg: 2050ms | Min: 2000ms | Max: 2100ms
```

#### Watch Mode (Live Updates)

```bash
# Auto-refresh on file change
node ~/.grok/hard-allow/observability-dashboard.mjs --watch

# Run in another terminal: node ~/.grok/hard-allow/ceremony.mjs
# Dashboard updates automatically
```

#### Comparison Mode

```bash
# Compare last 5 runs
node ~/.grok/hard-allow/observability-dashboard.mjs --compare 5

# Output:
# [
#   { "run": 1, "duration": 8234, "contextNodes": 342, "errors": 0 },
#   { "run": 2, "duration": 7980, "contextNodes": 351, "errors": 0 },
#   ...
# ]
```

#### JSON Export

```bash
# Export for integration with other tools
node ~/.grok/hard-allow/observability-dashboard.mjs --json > dashboard.json
```

### 3. Cloud Deployment Framework

#### Initialize AWS Deployment

```bash
node ~/.grok/hard-allow/cloud-deploy.mjs --init aws us-east-1

# Generates: ~/.grok/hard-allow/cloud-config.json
cat ~/.grok/hard-allow/cloud-config.json | jq .deployment
```

#### Validate Configuration

```bash
node ~/.grok/hard-allow/cloud-deploy.mjs --validate

# Output:
# ✓ Configuration is valid
# Warnings:
#   - Container registry not configured — local build only
```

#### Estimate Costs

```bash
node ~/.grok/hard-allow/cloud-deploy.mjs --estimate

# Output:
# {
#   "summary": {
#     "total": "137.18",
#     "breakdown": {
#       "lambda": "8.50",
#       "storage": "3.68",
#       "logging": "125.00"
#     }
#   }
# }
```

#### Generate Deployment Artifacts

```bash
# Generate Dockerfile
node ~/.grok/hard-allow/cloud-deploy.mjs --build
cat ~/.grok/hard-allow/cloud/Dockerfile

# Generate Terraform configuration
node ~/.grok/hard-allow/cloud-deploy.mjs --terraform
cat ~/.grok/hard-allow/cloud/main.tf

# Show deployment plan
node ~/.grok/hard-allow/cloud-deploy.mjs --plan | jq .
```

## Combined Workflows

### Full Arming with Metrics

```bash
# 1. Start ceremony
node ~/.grok/hard-allow/ceremony.mjs

# 2. (automatically) Arming happens with metrics collection
# 3. View metrics
node ~/.grok/hard-allow/metrics-collector.mjs --latest

# 4. View dashboard
node ~/.grok/hard-allow/observability-dashboard.mjs
```

### Local Testing → Cloud Preparation

```bash
# 1. Test locally with metrics
node ~/.grok/hard-allow/ceremony.mjs --check

# 2. View performance
node ~/.grok/hard-allow/observability-dashboard.mjs --watch

# 3. Once satisfied, prepare cloud
node ~/.grok/hard-allow/cloud-deploy.mjs --init aws us-east-1
node ~/.grok/hard-allow/cloud-deploy.mjs --estimate
node ~/.grok/hard-allow/cloud-deploy.mjs --validate

# 4. Generate deployment artifacts
node ~/.grok/hard-allow/cloud-deploy.mjs --build
node ~/.grok/hard-allow/cloud-deploy.mjs --terraform
```

### Performance Analysis

```bash
# Analyze trends over time
node ~/.grok/hard-allow/metrics-collector.mjs --analyze

# Expected output:
# ═══════════════════════════════════════════════════
#   HA METRICS REPORT
# ═══════════════════════════════════════════════════
#
# ARM DURATION:
#   Min: 7800ms | Max: 8500ms | Avg: 8150ms
#   Recent: 8100ms | Trend: stable
#
# GROK INJECTION:
#   Avg: 2050ms | Trend: improving | Samples: 42
#
# CLAUDE INJECTION:
#   Avg: 1850ms | Trend: stable | Samples: 42
#
# KIMI INJECTION:
#   Avg: 2200ms | Trend: degrading | Samples: 42
#
# CONTEXT NODES:
#   Avg items: 342 | Trend: stable
#
# SUCCESS RATE:
#   Avg: 100% | Perfect: YES
```

## Key Metrics to Monitor

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| ARM duration | 8-10s | >15s |
| Grok injection | 2000ms | >3000ms |
| Claude injection | 1800ms | >2800ms |
| Kimi injection | 2200ms | >3200ms |
| Success rate | 100% | <95% |
| Agent health | 100% OK | Any timeouts |

## Common Commands Cheat Sheet

```bash
# Status
node ~/.hat2/scripts/claude-ha-status.mjs

# Arming
node ~/.grok/hard-allow/ceremony.mjs                      # Interactive
node ~/.grok/hard-allow/ceremony.mjs --reuse-if-active   # Reuse session
node ~/.grok/hard-allow/ceremony.mjs --check              # Status only

# Metrics
node ~/.grok/hard-allow/metrics-collector.mjs --analyze    # Trend analysis
node ~/.grok/hard-allow/metrics-collector.mjs --latest     # Latest session

# Dashboard
node ~/.grok/hard-allow/observability-dashboard.mjs        # View dashboard
node ~/.grok/hard-allow/observability-dashboard.mjs --watch # Live updates
node ~/.grok/hard-allow/observability-dashboard.mjs --compare 5 # Compare runs

# Cloud
node ~/.grok/hard-allow/cloud-deploy.mjs --init aws us-east-1
node ~/.grok/hard-allow/cloud-deploy.mjs --validate
node ~/.grok/hard-allow/cloud-deploy.mjs --estimate
node ~/.grok/hard-allow/cloud-deploy.mjs --plan
```

## Troubleshooting

### No metrics appearing

```bash
# Check if metrics file exists
ls -lh ~/.grok/hard-allow/metrics.jsonl

# If not, run arming ceremony
node ~/.grok/hard-allow/ceremony.mjs

# Check metrics were recorded
node ~/.grok/hard-allow/metrics-collector.mjs --latest
```

### Dashboard shows no data

```bash
# Rebuild metrics index
rm ~/.grok/hard-allow/metrics.jsonl
node ~/.grok/hard-allow/ceremony.mjs

# Then view
node ~/.grok/hard-allow/observability-dashboard.mjs
```

### Agent timeouts (Circuit breaker)

```bash
# Check circuit breaker status
cat ~/.grok/hard-allow/fable-agents.jsonl | jq '.agents[] | {id, circuitBreakerCount}'

# Increase timeout
export FABLE_AGENT_TIMEOUT_MS=45000
node ~/.grok/hard-allow/ceremony.mjs

# Check logs
grep "timeout\|circuit" ~/.grok/hard-allow/*.jsonl | tail -10
```

### Cloud validation fails

```bash
# Show current config
node ~/.grok/hard-allow/cloud-deploy.mjs --show

# Errors will list what's missing, e.g.:
# ✗ Configuration has errors:
#   - Missing container registry

# Fix and validate again
node ~/.grok/hard-allow/cloud-deploy.mjs --validate
```

## Integration with Existing Tools

### With Prometheus

```bash
# Export metrics in Prometheus format
node ~/.grok/hard-allow/metrics-collector.mjs --export-prometheus > /tmp/ha-metrics.prom

# Add to scrape config:
# - job_name: 'ha-arm'
#   static_configs:
#     - targets: ['localhost:8080']
#   metrics_path: '/metrics'
```

### With Grafana

Use JSON export:
```bash
node ~/.grok/hard-allow/observability-dashboard.mjs --json | \
  curl -X POST http://grafana:3000/api/dashboards/db \
    -H "Content-Type: application/json" \
    -d @-
```

### With CloudWatch

```bash
# AWS credentials required
aws cloudwatch put-metric-data \
  --namespace HA-Arm \
  --metric-name ArmDuration \
  --value $(node ~/.grok/hard-allow/metrics-collector.mjs --latest | jq .armDuration)
```

## Next Steps

1. **Verify Installation**: Run `node ~/.grok/hard-allow/ceremony.mjs --check`
2. **View Dashboard**: `node ~/.grok/hard-allow/observability-dashboard.mjs`
3. **Analyze Trends**: `node ~/.grok/hard-allow/metrics-collector.mjs --analyze`
4. **Plan Cloud**: `node ~/.grok/hard-allow/cloud-deploy.mjs --plan`
5. **Read Full Docs**: See `WAVE3-FABLE-INTEGRATION.md` and `WAVE4-OBSERVABILITY.md`

## Support

- **Wave 3 Help**: See `WAVE3-FABLE-INTEGRATION.md`
- **Wave 4 Help**: See `WAVE4-OBSERVABILITY.md`
- **Architecture**: See `HA-WAVES-ROADMAP.md`
- **Status Check**: `node ~/.hat2/scripts/claude-ha-status.mjs`
