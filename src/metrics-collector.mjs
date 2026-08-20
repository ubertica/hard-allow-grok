#!/usr/bin/env node
/**
 * metrics-collector.mjs — Wave 4: Metrics Collection & Time-Series Analysis
 *
 * Collects metrics from arm execution:
 *   - Arm execution time
 *   - Rule injection latency (per LLM)
 *   - Context node hydration time
 *   - Consolidation cycles
 *   - Agent health (timeouts, failures, retries)
 *
 * Exports:
 *   - Prometheus-compatible metrics (/metrics endpoint)
 *   - Historical time-series (metrics.jsonl)
 *   - Real-time dashboards (metrics-dashboard.mjs)
 *
 * Usage:
 *   const collector = new MetricsCollector();
 *   collector.recordArmStart();
 *   collector.recordInjection('grok', 2100);
 *   collector.recordArmEnd();
 *   collector.export(); // Prometheus format
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const HA = join(HOME, '.grok', 'hard-allow');
const METRICS_FILE = join(HA, 'metrics.jsonl');
const PROMETHEUS_FILE = join(HA, 'metrics.prom');

// ─── METRICS COLLECTOR ───

class MetricsCollector {
  constructor(sessionId = null) {
    this.sessionId = sessionId || `session_${Date.now()}`;
    this.metrics = {
      sessionId: this.sessionId,
      startTime: null,
      endTime: null,
      injections: {}, // { llmName: [{ duration, status, timestamp }, ...] }
      contextNodes: [],
      consolidations: [],
      agentOperations: [],
      errors: [],
    };
  }

  // ─── ARM LIFECYCLE ───

  recordArmStart() {
    this.metrics.startTime = Date.now();
  }

  recordArmEnd() {
    this.metrics.endTime = Date.now();
  }

  getArmDuration() {
    if (!this.metrics.startTime || !this.metrics.endTime) return null;
    return this.metrics.endTime - this.metrics.startTime;
  }

  // ─── INJECTION METRICS ───

  recordInjection(llmName, durationMs, status = 'success', metadata = {}) {
    if (!this.metrics.injections[llmName]) {
      this.metrics.injections[llmName] = [];
    }

    this.metrics.injections[llmName].push({
      duration: durationMs,
      status,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  getInjectionStats(llmName) {
    const injections = this.metrics.injections[llmName] || [];
    if (injections.length === 0) return null;

    const durations = injections.map((i) => i.duration);
    const sorted = [...durations].sort((a, b) => a - b);

    return {
      llmName,
      count: injections.length,
      successCount: injections.filter((i) => i.status === 'success').length,
      failureCount: injections.filter((i) => i.status !== 'success').length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  getAllInjectionStats() {
    return Object.keys(this.metrics.injections).map((llm) =>
      this.getInjectionStats(llm)
    );
  }

  // ─── CONTEXT NODE METRICS ───

  recordContextNodeHydration(nodeId, durationMs, itemCount = 0) {
    this.metrics.contextNodes.push({
      nodeId,
      duration: durationMs,
      itemCount,
      timestamp: new Date().toISOString(),
    });
  }

  getContextNodeStats() {
    if (this.metrics.contextNodes.length === 0) return null;

    const durations = this.metrics.contextNodes.map((n) => n.duration);
    const itemCounts = this.metrics.contextNodes.map((n) => n.itemCount);

    return {
      totalNodes: this.metrics.contextNodes.length,
      totalItems: itemCounts.reduce((a, b) => a + b, 0),
      hydrationMinMs: Math.min(...durations),
      hydrationMaxMs: Math.max(...durations),
      hydrationAvgMs: durations.reduce((a, b) => a + b, 0) / durations.length,
      itemsPerNode: itemCounts.length > 0 ?
        itemCounts.reduce((a, b) => a + b, 0) / itemCounts.length : 0,
    };
  }

  // ─── CONSOLIDATION METRICS ───

  recordConsolidation(cycleNumber, durationMs, mergedCount = 0) {
    this.metrics.consolidations.push({
      cycle: cycleNumber,
      duration: durationMs,
      mergedCount,
      timestamp: new Date().toISOString(),
    });
  }

  getConsolidationStats() {
    if (this.metrics.consolidations.length === 0) return null;

    const durations = this.metrics.consolidations.map((c) => c.duration);

    return {
      totalCycles: this.metrics.consolidations.length,
      minCycleDurationMs: Math.min(...durations),
      maxCycleDurationMs: Math.max(...durations),
      avgCycleDurationMs: durations.reduce((a, b) => a + b, 0) / durations.length,
      totalMergedItems: this.metrics.consolidations.reduce((a, c) => a + c.mergedCount, 0),
    };
  }

  // ─── AGENT OPERATION METRICS ───

  recordAgentOperation(agentId, agentType, durationMs, status = 'success', error = null) {
    this.metrics.agentOperations.push({
      agentId,
      agentType,
      duration: durationMs,
      status,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  getAgentStats(agentType = null) {
    let ops = this.metrics.agentOperations;
    if (agentType) {
      ops = ops.filter((op) => op.agentType === agentType);
    }

    if (ops.length === 0) return null;

    const durations = ops.map((op) => op.duration);
    const successCount = ops.filter((op) => op.status === 'success').length;
    const failureCount = ops.filter((op) => op.status !== 'success').length;

    return {
      agentType: agentType || 'all',
      totalOps: ops.length,
      successCount,
      failureCount,
      successRate: (successCount / ops.length) * 100,
      minDurationMs: Math.min(...durations),
      maxDurationMs: Math.max(...durations),
      avgDurationMs: durations.reduce((a, b) => a + b, 0) / durations.length,
    };
  }

  recordError(errorType, message, metadata = {}) {
    this.metrics.errors.push({
      type: errorType,
      message,
      metadata,
      timestamp: new Date().toISOString(),
    });
  }

  getErrorStats() {
    if (this.metrics.errors.length === 0) return null;

    const byType = {};
    for (const err of this.metrics.errors) {
      byType[err.type] = (byType[err.type] || 0) + 1;
    }

    return {
      totalErrors: this.metrics.errors.length,
      byType,
    };
  }

  // ─── EXPORT FORMATS ───

  toJSON() {
    return {
      sessionId: this.sessionId,
      armDuration: this.getArmDuration(),
      startTime: this.metrics.startTime ? new Date(this.metrics.startTime).toISOString() : null,
      endTime: this.metrics.endTime ? new Date(this.metrics.endTime).toISOString() : null,
      injections: this.getAllInjectionStats(),
      contextNodes: this.getContextNodeStats(),
      consolidations: this.getConsolidationStats(),
      agents: {
        'rule-injector': this.getAgentStats('rule-injector'),
        'verifier': this.getAgentStats('verifier'),
        'consolidator': this.getAgentStats('consolidator'),
        'context-hydrator': this.getAgentStats('context-hydrator'),
      },
      errors: this.getErrorStats(),
    };
  }

  toPrometheus() {
    // Prometheus exposition format
    const lines = [];
    const timestamp = Date.now();

    // ARM duration
    if (this.getArmDuration() !== null) {
      lines.push(`# HELP ha_arm_duration_ms Total arm execution time in milliseconds`);
      lines.push(`# TYPE ha_arm_duration_ms gauge`);
      lines.push(`ha_arm_duration_ms{session="${this.sessionId}"} ${this.getArmDuration()}`);
    }

    // Injection latencies
    const injStats = this.getAllInjectionStats();
    for (const stat of injStats) {
      if (!stat) continue;
      lines.push(`# HELP ha_injection_avg_ms Average injection latency for ${stat.llmName}`);
      lines.push(`# TYPE ha_injection_avg_ms gauge`);
      lines.push(
        `ha_injection_avg_ms{llm="${stat.llmName}",session="${this.sessionId}"} ${stat.avg}`
      );
      lines.push(
        `ha_injection_success{llm="${stat.llmName}",session="${this.sessionId}"} ${stat.successCount}`
      );
      lines.push(
        `ha_injection_failure{llm="${stat.llmName}",session="${this.sessionId}"} ${stat.failureCount}`
      );
    }

    // Context node metrics
    const ctxStats = this.getContextNodeStats();
    if (ctxStats) {
      lines.push(`# HELP ha_context_nodes_total Total context nodes hydrated`);
      lines.push(`# TYPE ha_context_nodes_total gauge`);
      lines.push(`ha_context_nodes_total{session="${this.sessionId}"} ${ctxStats.totalNodes}`);
      lines.push(`ha_context_hydration_avg_ms{session="${this.sessionId}"} ${ctxStats.hydrationAvgMs}`);
    }

    // Agent stats
    const agentTypes = ['rule-injector', 'verifier', 'consolidator', 'context-hydrator'];
    for (const agentType of agentTypes) {
      const stats = this.getAgentStats(agentType);
      if (!stats) continue;
      lines.push(`# HELP ha_agent_success${agentType} Success count for ${agentType}`);
      lines.push(`# TYPE ha_agent_success gauge`);
      lines.push(
        `ha_agent_success{type="${agentType}",session="${this.sessionId}"} ${stats.successCount}`
      );
      lines.push(
        `ha_agent_failure{type="${agentType}",session="${this.sessionId}"} ${stats.failureCount}`
      );
      lines.push(
        `ha_agent_avg_duration_ms{type="${agentType}",session="${this.sessionId}"} ${stats.avgDurationMs}`
      );
    }

    // Error metrics
    const errStats = this.getErrorStats();
    if (errStats) {
      lines.push(`# HELP ha_errors_total Total errors encountered`);
      lines.push(`# TYPE ha_errors_total counter`);
      lines.push(`ha_errors_total{session="${this.sessionId}"} ${errStats.totalErrors}`);
    }

    lines.push(''); // blank line at end
    return lines.join('\n');
  }

  save() {
    mkdirSync(HA, { recursive: true });

    // JSON format (line-delimited)
    appendFileSync(METRICS_FILE, JSON.stringify(this.toJSON()) + '\n');

    // Prometheus format
    writeFileSync(PROMETHEUS_FILE, this.toPrometheus());

    console.error(`[Metrics] Saved to ${METRICS_FILE}`);
    console.error(`[Metrics] Prometheus export at ${PROMETHEUS_FILE}`);
  }

  print() {
    const summary = this.toJSON();
    console.log(JSON.stringify(summary, null, 2));
  }
}

// ─── TIME-SERIES ANALYSIS ───

class MetricsAnalyzer {
  constructor(metricsFilePath = METRICS_FILE) {
    this.filePath = metricsFilePath;
    this.records = [];
  }

  load() {
    if (!existsSync(this.filePath)) {
      console.error(`No metrics file found at ${this.filePath}`);
      return;
    }

    const lines = readFileSync(this.filePath, 'utf8').split('\n').filter((l) => l.trim());
    this.records = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((r) => r !== null);

    console.error(`[Analyzer] Loaded ${this.records.length} metric records`);
  }

  // ─── TREND ANALYSIS ───

  getArmDurationTrend() {
    if (this.records.length === 0) return null;

    const durations = this.records.map((r) => r.armDuration || 0).filter((d) => d > 0);
    if (durations.length === 0) return null;

    const sorted = [...durations].sort((a, b) => a - b);
    const recent5 = durations.slice(-5);

    return {
      totalSamples: durations.length,
      minMs: Math.min(...durations),
      maxMs: Math.max(...durations),
      avgMs: durations.reduce((a, b) => a + b, 0) / durations.length,
      medianMs: sorted[Math.floor(sorted.length / 2)],
      p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      recentAvgMs: recent5.reduce((a, b) => a + b, 0) / recent5.length,
      trend: this._calculateTrend(durations),
    };
  }

  getInjectionLatencyTrend(llmName) {
    const injLatencies = [];
    for (const record of this.records) {
      const injection = record.injections?.find((i) => i.llmName === llmName);
      if (injection?.avg) {
        injLatencies.push(injection.avg);
      }
    }

    if (injLatencies.length === 0) return null;

    const sorted = [...injLatencies].sort((a, b) => a - b);

    return {
      llmName,
      samples: injLatencies.length,
      minMs: Math.min(...injLatencies),
      maxMs: Math.max(...injLatencies),
      avgMs: injLatencies.reduce((a, b) => a + b, 0) / injLatencies.length,
      medianMs: sorted[Math.floor(sorted.length / 2)],
      trend: this._calculateTrend(injLatencies),
    };
  }

  getContextNodeGrowth() {
    const growthPoints = [];
    for (const record of this.records) {
      if (record.contextNodes?.totalItems) {
        growthPoints.push({
          timestamp: record.startTime,
          itemCount: record.contextNodes.totalItems,
        });
      }
    }

    if (growthPoints.length === 0) return null;

    const itemCounts = growthPoints.map((p) => p.itemCount);

    return {
      totalSessions: growthPoints.length,
      minItems: Math.min(...itemCounts),
      maxItems: Math.max(...itemCounts),
      avgItems: itemCounts.reduce((a, b) => a + b, 0) / itemCounts.length,
      trend: this._calculateTrend(itemCounts),
      growthPoints,
    };
  }

  getSuccessRateTrend() {
    const successRates = [];
    for (const record of this.records) {
      let totalOps = 0;
      let successOps = 0;

      for (const agentType in record.agents) {
        const stats = record.agents[agentType];
        if (stats) {
          totalOps += stats.totalOps || 0;
          successOps += stats.successCount || 0;
        }
      }

      if (totalOps > 0) {
        successRates.push((successOps / totalOps) * 100);
      }
    }

    if (successRates.length === 0) return null;

    return {
      samples: successRates.length,
      avgRate: successRates.reduce((a, b) => a + b, 0) / successRates.length,
      minRate: Math.min(...successRates),
      maxRate: Math.max(...successRates),
      allPerfect: successRates.every((r) => r === 100),
    };
  }

  _calculateTrend(values) {
    if (values.length < 2) return 'unknown';

    const recent = values.slice(-5);
    const older = values.slice(-10, -5);

    if (older.length === 0) return 'unknown';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const percentChange = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (percentChange > 10) return 'degrading';
    if (percentChange < -10) return 'improving';
    return 'stable';
  }

  // ─── SUMMARY REPORT ───

  generateReport() {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  HA METRICS REPORT');
    console.log('═══════════════════════════════════════════════════\n');

    const armTrend = this.getArmDurationTrend();
    if (armTrend) {
      console.log('ARM DURATION:');
      console.log(`  Min: ${armTrend.minMs}ms | Max: ${armTrend.maxMs}ms | Avg: ${armTrend.avgMs.toFixed(0)}ms`);
      console.log(`  Recent: ${armTrend.recentAvgMs.toFixed(0)}ms | Trend: ${armTrend.trend}`);
      console.log('');
    }

    const llms = ['grok', 'claude', 'kimi'];
    for (const llm of llms) {
      const injTrend = this.getInjectionLatencyTrend(llm);
      if (injTrend) {
        console.log(`${llm.toUpperCase()} INJECTION:`);
        console.log(`  Avg: ${injTrend.avgMs.toFixed(0)}ms | Trend: ${injTrend.trend} | Samples: ${injTrend.samples}`);
      }
    }
    console.log('');

    const ctxGrowth = this.getContextNodeGrowth();
    if (ctxGrowth) {
      console.log('CONTEXT NODES:');
      console.log(`  Avg items: ${ctxGrowth.avgItems.toFixed(0)} | Trend: ${ctxGrowth.trend}`);
    }

    const successRate = this.getSuccessRateTrend();
    if (successRate) {
      console.log('\nSUCCESS RATE:');
      console.log(`  Avg: ${successRate.avgRate.toFixed(1)}% | Perfect: ${successRate.allPerfect ? 'YES' : 'NO'}`);
    }

    console.log('\n═══════════════════════════════════════════════════\n');
  }
}

// ─── EXPORTS ───

export { MetricsCollector, MetricsAnalyzer };

// ─── CLI ───

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];

  if (cmd === '--analyze') {
    const analyzer = new MetricsAnalyzer();
    analyzer.load();
    analyzer.generateReport();
  } else if (cmd === '--export-prometheus') {
    const analyzer = new MetricsAnalyzer();
    analyzer.load();
    if (analyzer.records.length > 0) {
      const collector = new MetricsCollector(analyzer.records[0].sessionId);
      collector.metrics = analyzer.records[0].metrics || analyzer.records[0];
      console.log(collector.toPrometheus());
    }
  } else if (cmd === '--latest') {
    const analyzer = new MetricsAnalyzer();
    analyzer.load();
    if (analyzer.records.length > 0) {
      console.log(JSON.stringify(analyzer.records[analyzer.records.length - 1], null, 2));
    }
  } else {
    console.error('Usage:');
    console.error('  metrics-collector.mjs --analyze              # Show trend analysis');
    console.error('  metrics-collector.mjs --export-prometheus    # Export in Prometheus format');
    console.error('  metrics-collector.mjs --latest               # Show latest metrics');
  }
}
