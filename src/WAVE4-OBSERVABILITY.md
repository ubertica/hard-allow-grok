# Wave 4: Observability Upgrades & Cloud Deployment

**Status**: Production Ready (Framework Phase)  
**Deployed**: 
- `~/.grok/hard-allow/metrics-collector.mjs`
- `~/.grok/hard-allow/observability-dashboard.mjs`
- `~/.grok/hard-allow/cloud-deploy.mjs`

**Integrates with**: `arm-v2.mjs`, `fable-integration.mjs`, `ceremony.mjs`

## Overview

Wave 4 provides enterprise-grade observability and cloud deployment capabilities:

1. **Metrics Collection**: Track all HA operations (latency, success rates, errors)
2. **Real-time Dashboard**: View trends and system health in terminal
3. **Time-Series Analysis**: Identify degradation, improvements, anomalies
4. **Cloud Deployment Framework**: Prepare system for AWS/GCP/Azure
5. **Prometheus Integration**: Export metrics for external monitoring

## Component 1: Metrics Collector

### Purpose

Captures every operation in the HA system:
- ARM execution time (total + per-phase)
- Rule injection latency (per LLM)
- Context node hydration time
- Consolidation cycles
- Agent operations (success, failure, timeout)
- Error tracking & classification

### API

#### MetricsCollector Class

```javascript
import { MetricsCollector } from './metrics-collector.mjs';

const collector = new MetricsCollector('session-123');

// Record lifecycle
collector.recordArmStart();
collector.recordInjection('grok', 2100, 'success');
collector.recordContextNodeHydration('node-1', 1500, 42);
collector.recordArmEnd();

// Retrieve stats
const armDuration = collector.getArmDuration(); // ms
const injStats = collector.getInjectionStats('grok');
const ctxStats = collector.getContextNodeStats();

// Export
collector.save();           // Write to metrics.jsonl + Prometheus
collector.print();          // Log to stdout
const json = collector.toJSON();
const prom = collector.toPrometheus();
```

#### MetricsAnalyzer Class

Analyzes historical metrics:

```javascript
import { MetricsAnalyzer } from './metrics-collector.mjs';

const analyzer = new MetricsAnalyzer();
analyzer.load();

// Trend analysis
const armTrend = analyzer.getArmDurationTrend();
// Returns: { totalSamples, minMs, maxMs, avgMs, p95Ms, recentAvgMs, trend: 'improving'|'stable'|'degrading' }

const injTrend = analyzer.getInjectionLatencyTrend('grok');
// Returns: { samples, minMs, maxMs, avgMs, trend, llmName }

const ctxGrowth = analyzer.getContextNodeGrowth();
// Returns: { totalSessions, minItems, maxItems, avgItems, trend, growthPoints }

const successRate = analyzer.getSuccessRateTrend();
// Returns: { samples, avgRate, minRate, maxRate, allPerfect }

// Generate report
analyzer.generateReport();
```

### Recording Events

#### ARM Lifecycle

```javascript
collector.recordArmStart();
try {
  // ... perform arm operations
  collector.recordInjection('grok', duration, 'success');
  collector.recordContextNodeHydration('node-1', duration, itemCount);
  collector.recordConsolidation(1, duration, mergedCount);
  collector.recordArmEnd();
} catch (e) {
  collector.recordError('arm-failure', e.message);
  collector.recordArmEnd();
}
collector.save();
```

#### Agent Operations

```javascript
// Record Fable agent execution
collector.recordAgentOperation('grok-injector-abc', 'rule-injector', 2100, 'success');
collector.recordAgentOperation('verifier-xyz', 'verifier', 3500, 'failed', 'Timeout');
collector.recordAgentOperation('ctx-hydrator', 'context-hydrator', 1800, 'success');
```

#### Errors

```javascript
collector.recordError('injection-timeout', 'Grok injection exceeded 15s', {
  llm: 'grok',
  attempted: 3,
});
```

### Data Format

#### JSON Export (metrics.jsonl)

Each line is a complete session metrics record:

```json
{
  "sessionId": "session_1722955645123",
  "armDuration": 8234,
  "startTime": "2026-08-06T21:30:45.123Z",
  "endTime": "2026-08-06T21:30:53.357Z",
  "injections": [
    {
      "llmName": "grok",
      "count": 1,
      "successCount": 1,
      "failureCount": 0,
      "min": 2000,
      "max": 2100,
      "avg": 2050,
      "median": 2050,
      "p95": 2100,
      "p99": 2100
    },
    {
      "llmName": "claude",
      "count": 1,
      "successCount": 1,
      "failureCount": 0,
      "min": 1800,
      "max": 1900,
      "avg": 1850,
      "median": 1850,
      "p95": 1900,
      "p99": 1900
    }
  ],
  "contextNodes": {
    "totalNodes": 12,
    "totalItems": 342,
    "hydrationMinMs": 1200,
    "hydrationMaxMs": 2100,
    "hydrationAvgMs": 1650,
    "itemsPerNode": 28.5
  },
  "agents": {
    "rule-injector": {
      "agentType": "rule-injector",
      "totalOps": 3,
      "successCount": 3,
      "failureCount": 0,
      "successRate": 100,
      "minDurationMs": 1800,
      "maxDurationMs": 2100,
      "avgDurationMs": 1950
    }
  },
  "errors": null
}
```

#### Prometheus Format (metrics.prom)

```
# HELP ha_arm_duration_ms Total arm execution time in milliseconds
# TYPE ha_arm_duration_ms gauge
ha_arm_duration_ms{session="session_123"} 8234

# HELP ha_injection_avg_ms Average injection latency for grok
# TYPE ha_injection_avg_ms gauge
ha_injection_avg_ms{llm="grok",session="session_123"} 2050
ha_injection_success{llm="grok",session="session_123"} 1
ha_injection_failure{llm="grok",session="session_123"} 0

# ... more metrics
```

### Integration with arm-v2.mjs

```javascript
import { MetricsCollector } from './metrics-collector.mjs';

const collector = new MetricsCollector();
collector.recordArmStart();

// In pre-flight checks
collector.recordContextNodeHydration('pre-flight', 500, 0);

// For each rule injection
const before = Date.now();
safeWrite(grokPath, rules, 'Grok rules');
collector.recordInjection('grok', Date.now() - before, 'success');

// ... more injections

collector.recordArmEnd();
collector.save();
```

## Component 2: Observability Dashboard

### Purpose

Real-time terminal dashboard for monitoring HA system health and trends.

### Usage

#### Interactive Mode (Default)

```bash
node ~/.grok/hard-allow/observability-dashboard.mjs
```

Displays:
- ARM duration trend (last 10 sessions as sparkline)
- LLM injection latency comparison
- Context node growth chart
- Agent health overview (table)
- Error summary
- System status

#### Watch Mode (Live Updates)

```bash
node ~/.grok/hard-allow/observability-dashboard.mjs --watch
```

Auto-refreshes every file change (useful during deployments).

#### Comparison Mode

```bash
node ~/.grok/hard-allow/observability-dashboard.mjs --compare [limit]
```

Shows side-by-side comparison of last N runs:

```json
[
  {
    "run": 1,
    "duration": 8234,
    "contextNodes": 342,
    "errors": 0
  },
  {
    "run": 2,
    "duration": 7980,
    "contextNodes": 351,
    "errors": 0
  }
]
```

#### JSON Export

```bash
node ~/.grok/hard-allow/observability-dashboard.mjs --json
```

Exports structured data for integration with other tools:

```json
{
  "timestamp": "2026-08-06T21:30:53.357Z",
  "sessionsTracked": 42,
  "latestSession": { ... },
  "trends": {
    "armDuration": {
      "recent": 8234,
      "older": 8567,
      "delta": -333
    },
    "injectionLatency": {
      "avgLatencyMs": 1950,
      "samples": 3
    },
    "contextNodeGrowth": {
      "current": 342,
      "samples": 1
    },
    "successRate": {
      "avgSuccessRate": 100,
      "samples": 42,
      "allPerfect": true
    }
  }
}
```

### Charts & Visualization

#### Sparkline Charts

Compact time-series in a single line:

```
ARM DURATION TREND (last 10 sessions):
▁▂▃▄▅▆▇█▇▆
Min: 7800ms | Avg: 8150ms | Max: 8500ms | Current: 8234ms
```

#### Bar Charts

For comparing multiple values:

```
█████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 2050
████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 1850
███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 1650
```

#### ASCII Tables

For structured data:

```
Agent Type         | Success | Failed | Total | Rate   | Avg (ms)
-------------------|---------|--------|-------|--------|----------
rule-injector      | 3       | 0      | 3     | 100.0% | 1950
verifier           | 3       | 0      | 3     | 100.0% | 3250
context-hydrator   | 1       | 0      | 1     | 100.0% | 1800
consolidator       | 1       | 0      | 1     | 100.0% | 850
```

### Trend Detection

Dashboard automatically identifies trends:
- **Improving**: Recent average is >10% better than older baseline
- **Stable**: Recent within ±10% of baseline
- **Degrading**: Recent >10% worse than baseline

Example output:
```
ARM DURATION: Min: 7800ms | Avg: 8150ms | Max: 8500ms | Trend: stable
GROK INJECTION: Avg: 2050ms | Trend: improving | Samples: 42
```

## Component 3: Cloud Deployment Framework

### Purpose

Prepares HA system for cloud deployment (AWS Lambda, GCP Cloud Functions, Azure Functions).

**Status**: Framework configuration only; actual deployment requires cloud credentials.

### Configuration

#### Initialization

```bash
node cloud-deploy.mjs --init aws us-east-1
```

Creates `cloud-config.json`:

```json
{
  "version": "1.0",
  "provider": "aws",
  "deployment": {
    "type": "lambda",
    "region": "us-east-1",
    "environment": "production"
  },
  "container": {
    "registry": "123456789.dkr.ecr.us-east-1.amazonaws.com",
    "imageName": "ha-arm",
    "imageTag": "latest",
    "baseImage": "node:20-alpine"
  },
  "functions": {
    "armCeremony": {
      "handler": "ceremony.handler",
      "timeout": 120,
      "memory": 512,
      "concurrent": 100
    },
    "metrics": {
      "handler": "metrics-collector.handler",
      "timeout": 60,
      "memory": 256,
      "concurrent": 50
    },
    "dashboard": {
      "handler": "observability-dashboard.handler",
      "timeout": 30,
      "memory": 256,
      "concurrent": 10
    }
  },
  "storage": {
    "metrics": {
      "type": "s3",
      "bucket": "ha-metrics",
      "prefix": "metrics/",
      "retention": 90
    },
    "sessions": {
      "type": "s3",
      "bucket": "ha-sessions",
      "prefix": "sessions/",
      "retention": 7
    }
  },
  "monitoring": {
    "logs": "cloudwatch",
    "metrics": "prometheus",
    "alerts": {
      "armFailureRate": 0.05,
      "injectionLatencyP95": 10000
    }
  },
  "autoscaling": {
    "enabled": true,
    "minInstances": 1,
    "maxInstances": 10,
    "targetUtilization": 70
  },
  "budget": {
    "monthlyCap": 1000,
    "estimatedMonthlyCost": 0
  }
}
```

#### Validation

```bash
node cloud-deploy.mjs --validate
```

Checks:
- Provider and region specified
- Container registry configured
- IAM roles correct (for AWS)
- Storage buckets exist
- Cost within budget
- Function timeouts appropriate

#### Cost Estimation

```bash
node cloud-deploy.mjs --estimate
```

Outputs:

```json
{
  "provider": "AWS",
  "region": "us-east-1",
  "components": {
    "lambda": {
      "invocations": 100000,
      "gbSeconds": 8333,
      "estimatedCost": 8.50
    },
    "s3": {
      "metricsStorageGb": 50,
      "sessionsStorageGb": 10,
      "artifactsStorageGb": 100,
      "estimatedCost": 3.68
    },
    "cloudwatch": {
      "estimatedMbPerMonth": 250,
      "estimatedCost": 125.00
    }
  },
  "summary": {
    "total": "137.18",
    "breakdown": {
      "lambda": "8.50",
      "storage": "3.68",
      "logging": "125.00"
    }
  }
}
```

### Deployment Artifacts

#### Dockerfile Generation

```bash
node cloud-deploy.mjs --build
```

Generates `cloud/Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY . .
RUN npm ci --only=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('ok')" || exit 1

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "ceremony.mjs", "--handler"]
```

#### Terraform Generation

```bash
node cloud-deploy.mjs --terraform
```

Generates `cloud/main.tf` with:
- IAM roles and policies
- Lambda function definitions
- S3 buckets for storage
- CloudWatch log groups
- Auto-scaling configuration

#### Deployment Plan

```bash
node cloud-deploy.mjs --plan
```

Shows phases and tasks:

```
Validation → Preparation → Deployment → Testing → Monitoring
- Validate cloud configuration
- Check IAM permissions
- Build container image
- Create infrastructure
- Configure logging
- Run smoke tests
- Enable monitoring
```

### Cloud Provider Support

#### AWS (Production Ready)

```bash
node cloud-deploy.mjs --init aws us-east-1
node cloud-deploy.mjs --terraform  # Generates Lambda stack
node cloud-deploy.mjs --estimate   # AWS pricing calculated
```

Features:
- Lambda for serverless execution
- S3 for metrics & sessions storage
- CloudWatch for logging
- IAM for access control
- KMS for encryption
- Auto Scaling

#### GCP (Framework Only)

```bash
node cloud-deploy.mjs --init gcp us-central1
# Structure defined but not implemented
```

#### Azure (Framework Only)

```bash
node cloud-deploy.mjs --init azure eastus
# Structure defined but not implemented
```

## Integration Guide

### With arm-v2.mjs

```javascript
import { MetricsCollector } from './metrics-collector.mjs';

const collector = new MetricsCollector();
collector.recordArmStart();

// Existing arm logic
// ...

// Record injections
const grokTime = performance.now();
safeWrite(grokRules, rules, 'Grok');
collector.recordInjection('grok', performance.now() - grokTime, 'success');

// Record context hydration
const ctxTime = performance.now();
// ... hydration
collector.recordContextNodeHydration('node-1', performance.now() - ctxTime, count);

collector.recordArmEnd();
collector.save();
```

### With fable-integration.mjs

```javascript
import { spawnFablePool, consolidateResults } from './fable-integration.mjs';
import { MetricsCollector } from './metrics-collector.mjs';

const collector = new MetricsCollector();
collector.recordArmStart();

const pool = await spawnFablePool(agents, payload);
const results = await pool.waitAll();

for (const result of results) {
  collector.recordAgentOperation(
    result.id,
    result.type,
    result.duration,
    result.status
  );
}

collector.recordArmEnd();
collector.save();
```

### With ceremony.mjs

Add metrics reporting to ceremony flow:

```javascript
// In ceremony.mjs after successful Touch ID
const collector = new MetricsCollector();
try {
  collector.recordArmStart();
  spawnSync(process.execPath, [join(__dirname, 'arm-v2.mjs')]);
  collector.recordArmEnd();
  collector.save();
} catch (e) {
  collector.recordError('ceremony-failure', e.message);
}
```

## Operational Runbook

### Monitor ARM Performance

```bash
# View live dashboard
node ~/.grok/hard-allow/observability-dashboard.mjs --watch

# Analyze trends
node ~/.grok/hard-allow/metrics-collector.mjs --analyze

# Export for Prometheus
node ~/.grok/hard-allow/metrics-collector.mjs --export-prometheus > metrics.prom
```

### Troubleshoot Degradation

1. **Check latest metrics**:
   ```bash
   node ~/.grok/hard-allow/metrics-collector.mjs --latest
   ```

2. **Analyze trends**:
   ```bash
   node ~/.grok/hard-allow/observability-dashboard.mjs --compare 10
   ```

3. **Look for errors**:
   ```bash
   grep -i error ~/.grok/hard-allow/metrics.jsonl | tail -5
   ```

### Prepare for Cloud Deployment

```bash
# Initialize AWS deployment
node cloud-deploy.mjs --init aws us-east-1

# Validate configuration
node cloud-deploy.mjs --validate

# Estimate costs
node cloud-deploy.mjs --estimate

# Generate Docker image
node cloud-deploy.mjs --build

# Generate Terraform
node cloud-deploy.mjs --terraform

# Review deployment plan
node cloud-deploy.mjs --plan
```

## Performance Baseline

Expected metrics on modern hardware:

| Metric | Expected | Acceptable Range |
|--------|----------|------------------|
| ARM duration | 8-10s | 6-15s |
| Grok injection | 2000ms | 1500-3000ms |
| Claude injection | 1800ms | 1200-2800ms |
| Kimi injection | 2200ms | 1600-3200ms |
| Context hydration | 1500ms | 1000-2500ms |
| Consolidation | 850ms | 500-1500ms |
| Success rate | 100% | >95% |

## Future Enhancements (Wave 4.5+)

1. **Custom Metrics**: User-defined KPIs beyond standard latencies
2. **Alerting**: Automated alerts for SLO violations
3. **Distributed Tracing**: Trace requests across cloud components
4. **Budget Alerts**: Notify when cloud costs approach cap
5. **Multi-cloud**: Support AWS, GCP, Azure simultaneously
6. **Federated Metrics**: Aggregate metrics from multiple regions
7. **eBPF Profiling**: Low-overhead performance profiling
8. **Self-healing**: Automatic remediation for known failures

## See Also

- **Wave 1**: `arm-v2.mjs` (sequential arming)
- **Wave 2**: `SemanticMemoryEngine` (context synthesis)
- **Wave 3**: `fable-integration.mjs` (parallel agents)
- **Prometheus**: https://prometheus.io/
- **AWS Lambda**: https://docs.aws.amazon.com/lambda/
- **GCP Functions**: https://cloud.google.com/functions/docs
