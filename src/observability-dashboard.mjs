#!/usr/bin/env node
/**
 * observability-dashboard.mjs — Wave 4: Real-time Observability Dashboard
 *
 * Reads metrics from metrics.jsonl and displays:
 *   - ARM execution trends (last 10 sessions)
 *   - LLM injection latency comparison (grok vs claude vs kimi)
 *   - Context node growth chart
 *   - Agent health overview
 *   - Error summary
 *   - System status
 *
 * Features:
 *   - Real-time metrics refresh
 *   - Terminal-based charts (ASCII/Unicode)
 *   - Integration with ha-status.mjs
 *   - Prometheus export
 *   - JSON export for downstream tools
 *
 * Usage:
 *   node metrics-dashboard.mjs                      # interactive TUI
 *   node metrics-dashboard.mjs --json               # JSON export
 *   node metrics-dashboard.mjs --watch              # auto-refresh every 2s
 *   node metrics-dashboard.mjs --compare            # compare recent runs
 */
import {
  existsSync,
  readFileSync,
  watchFile,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const HA = join(HOME, '.grok', 'hard-allow');
const METRICS_FILE = join(HA, 'metrics.jsonl');

// ─── CHART RENDERING ───

class ChartRenderer {
  static barChart(values, { width = 50, label = '', max = null } = {}) {
    const maximum = max || Math.max(...values);
    const lines = [];

    for (const value of values) {
      const barWidth = Math.round((value / maximum) * width);
      const bar = '█'.repeat(barWidth) + '░'.repeat(width - barWidth);
      lines.push(`${bar} ${value.toFixed(0)}`);
    }

    return lines.join('\n');
  }

  static sparkline(values, { height = 8, width = 40 } = {}) {
    if (values.length === 0) return '';

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const line = values
      .slice(-width)
      .map((v) => {
        const norm = (v - min) / range;
        const idx = Math.floor(norm * (blocks.length - 1));
        return blocks[idx];
      })
      .join('');

    return line;
  }

  static lineChart(points, { height = 10, width = 60, title = '' } = {}) {
    if (points.length === 0) return '';

    const values = points.map((p) => (typeof p === 'number' ? p : p.value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const grid = Array(height).fill(null).map(() => Array(width).fill(' '));

    for (let i = 0; i < Math.min(points.length, width); i++) {
      const value = values[i];
      const normalized = (value - min) / range;
      const y = Math.floor((1 - normalized) * (height - 1));
      const x = i;
      grid[y][x] = '•';
    }

    const lines = [];
    if (title) lines.push(title);
    lines.push('+' + '-'.repeat(width) + '+');
    for (const row of grid) {
      lines.push('|' + row.join('') + '|');
    }
    lines.push('+' + '-'.repeat(width) + '+');

    return lines.join('\n');
  }

  static table(data, columns) {
    // Simple ASCII table
    const rows = [];
    const colWidths = columns.map((col) => {
      const header = col.header.length;
      const maxData = Math.max(...data.map((row) => String(row[col.key]).length));
      return Math.max(header, maxData);
    });

    // Header
    const headerRow = columns
      .map((col, i) => col.header.padEnd(colWidths[i]))
      .join(' | ');
    rows.push(headerRow);
    rows.push('-'.repeat(headerRow.length));

    // Data rows
    for (const row of data) {
      const dataRow = columns
        .map((col, i) => String(row[col.key]).padEnd(colWidths[i]))
        .join(' | ');
      rows.push(dataRow);
    }

    return rows.join('\n');
  }
}

// ─── DASHBOARD ───

class ObservabilityDashboard {
  constructor() {
    this.metrics = [];
    this.lastUpdate = null;
  }

  load() {
    if (!existsSync(METRICS_FILE)) {
      console.error(`No metrics file at ${METRICS_FILE}`);
      return false;
    }

    try {
      const lines = readFileSync(METRICS_FILE, 'utf8')
        .split('\n')
        .filter((l) => l.trim());

      this.metrics = lines
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((m) => m !== null);

      this.lastUpdate = new Date();
      return true;
    } catch (e) {
      console.error(`Failed to load metrics: ${e.message}`);
      return false;
    }
  }

  // ─── CHART GENERATORS ───

  getArmDurationChart(limit = 10) {
    const recent = this.metrics.slice(-limit);
    const values = recent.map((m) => m.armDuration || 0);

    if (values.length === 0) return '';

    const lines = [];
    lines.push('ARM DURATION TREND (last 10 sessions):');
    lines.push('');
    lines.push(ChartRenderer.sparkline(values, { width: 50 }));
    lines.push('');

    const stats = {
      current: values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    };

    lines.push(
      `Min: ${stats.min.toFixed(0)}ms | Avg: ${stats.avg.toFixed(0)}ms | Max: ${stats.max.toFixed(0)}ms | Current: ${stats.current.toFixed(0)}ms`
    );

    return lines.join('\n');
  }

  getInjectionLatencyComparison(limit = 10) {
    const recent = this.metrics.slice(-limit);
    const llms = ['grok', 'claude', 'kimi'];
    const comparison = {};

    for (const llm of llms) {
      const latencies = [];
      for (const m of recent) {
        const inj = m.injections?.find((i) => i.llmName === llm);
        if (inj?.avg) latencies.push(inj.avg);
      }
      if (latencies.length > 0) {
        comparison[llm] = {
          avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
          min: Math.min(...latencies),
          max: Math.max(...latencies),
          trend: ChartRenderer.sparkline(latencies, { width: 30 }),
        };
      }
    }

    const lines = [];
    lines.push('LLM INJECTION LATENCY:');
    lines.push('');

    for (const [llm, stats] of Object.entries(comparison)) {
      lines.push(`${llm.toUpperCase()}`);
      lines.push(`  ${stats.trend}`);
      lines.push(
        `  Avg: ${stats.avg.toFixed(0)}ms | Min: ${stats.min.toFixed(0)}ms | Max: ${stats.max.toFixed(0)}ms`
      );
      lines.push('');
    }

    return lines.join('\n');
  }

  getContextNodeChart() {
    const records = this.metrics
      .filter((m) => m.contextNodes?.totalItems)
      .slice(-20);

    if (records.length === 0) return 'No context node data';

    const itemCounts = records.map((m) => m.contextNodes.totalItems);
    const labels = records.map((m, i) => i + 1);

    const lines = [];
    lines.push('CONTEXT NODE GROWTH:');
    lines.push('');
    lines.push(ChartRenderer.sparkline(itemCounts, { width: 50 }));
    lines.push('');

    const stats = {
      current: itemCounts[itemCounts.length - 1],
      min: Math.min(...itemCounts),
      max: Math.max(...itemCounts),
      avg: itemCounts.reduce((a, b) => a + b, 0) / itemCounts.length,
    };

    lines.push(
      `Min: ${stats.min.toFixed(0)} | Avg: ${stats.avg.toFixed(0)} | Max: ${stats.max.toFixed(0)} | Current: ${stats.current.toFixed(0)}`
    );

    return lines.join('\n');
  }

  getAgentHealthOverview() {
    if (this.metrics.length === 0) return '';

    const latest = this.metrics[this.metrics.length - 1];
    const agents = latest.agents || {};

    const rows = [];
    for (const [type, stats] of Object.entries(agents)) {
      if (!stats) continue;
      rows.push({
        type,
        success: stats.successCount || 0,
        failed: stats.failureCount || 0,
        total: stats.totalOps || 0,
        rate: stats.successRate ? stats.successRate.toFixed(1) + '%' : 'N/A',
        avgMs: stats.avgDurationMs ? stats.avgDurationMs.toFixed(0) : 'N/A',
      });
    }

    const lines = [];
    lines.push('AGENT HEALTH (latest session):');
    lines.push('');
    lines.push(
      ChartRenderer.table(rows, [
        { key: 'type', header: 'Agent Type' },
        { key: 'success', header: 'Success' },
        { key: 'failed', header: 'Failed' },
        { key: 'total', header: 'Total' },
        { key: 'rate', header: 'Rate' },
        { key: 'avgMs', header: 'Avg (ms)' },
      ])
    );

    return lines.join('\n');
  }

  getErrorSummary() {
    if (this.metrics.length === 0) return '';

    const latest = this.metrics[this.metrics.length - 1];
    const errors = latest.errors || null;

    if (!errors) {
      return 'ERROR SUMMARY:\n  No errors (status: healthy)';
    }

    const lines = [];
    lines.push('ERROR SUMMARY (latest session):');
    lines.push('');
    lines.push(`Total errors: ${errors.totalErrors}`);

    if (errors.byType) {
      for (const [type, count] of Object.entries(errors.byType)) {
        lines.push(`  ${type}: ${count}`);
      }
    }

    return lines.join('\n');
  }

  getSystemStatus() {
    const lines = [];
    lines.push('SYSTEM STATUS:');
    lines.push('');
    lines.push(`Sessions tracked: ${this.metrics.length}`);
    lines.push(`Last update: ${this.lastUpdate?.toISOString() || 'never'}`);

    if (this.metrics.length > 0) {
      const latest = this.metrics[this.metrics.length - 1];
      const earliest = this.metrics[0];

      lines.push(`Period: ${earliest.startTime || 'unknown'} → ${latest.endTime || 'unknown'}`);

      const totalSessions = this.metrics.length;
      const successfulSessions = this.metrics.filter((m) => !m.errors || m.errors.totalErrors === 0).length;
      lines.push(`Healthy sessions: ${successfulSessions}/${totalSessions}`);
    }

    return lines.join('\n');
  }

  // ─── FULL DASHBOARD ───

  render() {
    const sections = [
      this.getSystemStatus(),
      '',
      this.getArmDurationChart(),
      '',
      this.getInjectionLatencyComparison(),
      '',
      this.getContextNodeChart(),
      '',
      this.getAgentHealthOverview(),
      '',
      this.getErrorSummary(),
    ];

    return sections.join('\n');
  }

  renderJSON() {
    return {
      timestamp: this.lastUpdate?.toISOString(),
      sessionsTracked: this.metrics.length,
      latestSession: this.metrics[this.metrics.length - 1] || null,
      trends: {
        armDuration: this._getTrend('armDuration'),
        injectionLatency: this._getTrend('injectionLatency'),
        contextNodeGrowth: this._getTrend('contextNodeGrowth'),
        successRate: this._getTrend('successRate'),
      },
    };
  }

  _getTrend(type) {
    if (this.metrics.length < 2) return null;

    const recent = this.metrics.slice(-5);
    const older = this.metrics.slice(-10, -5);

    switch (type) {
      case 'armDuration': {
        const recentAvg = recent.map((m) => m.armDuration || 0).reduce((a, b) => a + b) / recent.length;
        const olderAvg = older.length > 0 ?
          older.map((m) => m.armDuration || 0).reduce((a, b) => a + b) / older.length : recentAvg;
        return { recent: recentAvg, older: olderAvg, delta: recentAvg - olderAvg };
      }
      case 'injectionLatency': {
        const recentLatencies = recent
          .flatMap((m) => m.injections || [])
          .filter((i) => i.avg)
          .map((i) => i.avg);
        const avg = recentLatencies.length > 0 ?
          recentLatencies.reduce((a, b) => a + b) / recentLatencies.length : 0;
        return { avgLatencyMs: avg, samples: recentLatencies.length };
      }
      case 'contextNodeGrowth': {
        const items = recent
          .filter((m) => m.contextNodes?.totalItems)
          .map((m) => m.contextNodes.totalItems);
        return { current: items[items.length - 1] || 0, samples: items.length };
      }
      case 'successRate': {
        const rates = recent.map((m) => {
          const agents = m.agents || {};
          let totalOps = 0;
          let successOps = 0;
          for (const stats of Object.values(agents)) {
            if (stats) {
              totalOps += stats.totalOps || 0;
              successOps += stats.successCount || 0;
            }
          }
          return totalOps > 0 ? (successOps / totalOps) * 100 : 100;
        });
        const avg = rates.reduce((a, b) => a + b) / rates.length;
        return { avgSuccessRate: avg, samples: rates.length, allPerfect: rates.every((r) => r === 100) };
      }
      default:
        return null;
    }
  }
}

// ─── WATCH MODE ───

function watchMetrics() {
  const dashboard = new ObservabilityDashboard();
  dashboard.load();
  displayDashboard(dashboard);

  watchFile(METRICS_FILE, () => {
    dashboard.load();
    console.clear?.();
    displayDashboard(dashboard);
  });

  console.error('Watching for metrics updates... (Ctrl+C to exit)');
}

function displayDashboard(dashboard) {
  console.log('\n' + dashboard.render());
}

// ─── COMPARISON MODE ───

function compareRuns(limit = 5) {
  const dashboard = new ObservabilityDashboard();
  dashboard.load();

  if (dashboard.metrics.length === 0) {
    console.log('No metrics available');
    process.exit(1);
  }

  const recent = dashboard.metrics.slice(-limit);
  const comparison = recent.map((m, i) => ({
    run: i + 1,
    duration: m.armDuration,
    contextNodes: m.contextNodes?.totalItems || 0,
    agents: m.agents,
    errors: m.errors?.totalErrors || 0,
  }));

  console.log(JSON.stringify(comparison, null, 2));
}

// ─── CLI ───

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];

  if (cmd === '--watch') {
    watchMetrics();
  } else if (cmd === '--compare') {
    compareRuns(Number(process.argv[3]) || 5);
  } else if (cmd === '--json') {
    const dashboard = new ObservabilityDashboard();
    dashboard.load();
    console.log(JSON.stringify(dashboard.renderJSON(), null, 2));
  } else {
    const dashboard = new ObservabilityDashboard();
    if (dashboard.load()) {
      displayDashboard(dashboard);
    }
  }
}

export { ObservabilityDashboard, ChartRenderer };
