/**
 * Matrix Health Monitor - Real-time system metrics and health tracking
 * HTTP endpoint for live metrics: :9999/matrix/health
 * Layer 6: Monitoring & Metrics
 */

import http from 'http';
import { performance } from 'perf_hooks';

export class LatencyTracker {
  constructor() {
    this.samples = [];
    this.maxSamples = 10000;
  }

  /**
   * Record a latency sample
   */
  recordSample(latencyMs) {
    this.samples.push({
      value: latencyMs,
      timestamp: Date.now()
    });

    // Keep bounded
    if (this.samples.length > this.maxSamples) {
      this.samples = this.samples.slice(-5000);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    if (this.samples.length === 0) {
      return {
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0
      };
    }

    const values = this.samples.map(s => s.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      average: sum / values.length,
      min: values[0],
      max: values[values.length - 1],
      p50: values[Math.floor(values.length * 0.5)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)]
    };
  }

  /**
   * Get recent average (last N seconds)
   */
  getRecentAverage(windowSec = 60) {
    const cutoff = Date.now() - (windowSec * 1000);
    const recent = this.samples.filter(s => s.timestamp > cutoff);

    if (recent.length === 0) return 0;

    const sum = recent.reduce((a, b) => a + b.value, 0);
    return sum / recent.length;
  }

  /**
   * Reset
   */
  reset() {
    this.samples = [];
  }
}

export class ConflictMonitor {
  constructor() {
    this.conflicts = [];
    this.resolutions = [];
  }

  /**
   * Record conflict detection
   */
  recordConflict(conflict) {
    this.conflicts.push({
      ...conflict,
      detectedAt: Date.now()
    });

    if (this.conflicts.length > 10000) {
      this.conflicts = this.conflicts.slice(-5000);
    }
  }

  /**
   * Record conflict resolution
   */
  recordResolution(conflictId, resolution) {
    this.resolutions.push({
      conflictId,
      resolution,
      resolvedAt: Date.now()
    });

    if (this.resolutions.length > 10000) {
      this.resolutions = this.resolutions.slice(-5000);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const resolutionRate =
      this.conflicts.length > 0
        ? (this.resolutions.length / this.conflicts.length) * 100
        : 0;

    const typeCount = {};
    this.conflicts.forEach(c => {
      typeCount[c.type] = (typeCount[c.type] || 0) + 1;
    });

    const severityCount = {};
    this.conflicts.forEach(c => {
      severityCount[c.severity] = (severityCount[c.severity] || 0) + 1;
    });

    return {
      totalConflicts: this.conflicts.length,
      resolvedConflicts: this.resolutions.length,
      resolutionRate: resolutionRate.toFixed(1),
      byType: typeCount,
      bySeverity: severityCount
    };
  }

  /**
   * Get recent conflicts
   */
  getRecentConflicts(count = 10) {
    return this.conflicts
      .sort((a, b) => b.detectedAt - a.detectedAt)
      .slice(0, count);
  }

  /**
   * Reset
   */
  reset() {
    this.conflicts = [];
    this.resolutions = [];
  }
}

export class ThroughputMeter {
  constructor() {
    this.buckets = {}; // LLM -> count
    this.timestamps = [];
    this.startTime = Date.now();
  }

  /**
   * Record node creation from an LLM
   */
  recordNodes(llm, count) {
    if (!this.buckets[llm]) {
      this.buckets[llm] = 0;
    }
    this.buckets[llm] += count;

    this.timestamps.push({
      llm,
      count,
      timestamp: Date.now()
    });

    if (this.timestamps.length > 100000) {
      this.timestamps = this.timestamps.slice(-50000);
    }
  }

  /**
   * Get throughput (nodes/second)
   */
  getThroughput() {
    const elapsedSec = (Date.now() - this.startTime) / 1000;
    const totalNodes = Object.values(this.buckets).reduce((a, b) => a + b, 0);

    return elapsedSec > 0 ? totalNodes / elapsedSec : 0;
  }

  /**
   * Get per-LLM throughput
   */
  getPerLLMThroughput() {
    const elapsedSec = (Date.now() - this.startTime) / 1000;
    const result = {};

    Object.entries(this.buckets).forEach(([llm, count]) => {
      result[llm] = elapsedSec > 0 ? count / elapsedSec : 0;
    });

    return result;
  }

  /**
   * Get recent throughput (nodes/sec in last window)
   */
  getRecentThroughput(windowSec = 60) {
    const cutoff = Date.now() - (windowSec * 1000);
    const recent = this.timestamps.filter(t => t.timestamp > cutoff);

    const totalNodes = recent.reduce((sum, t) => sum + t.count, 0);
    return totalNodes / windowSec;
  }

  /**
   * Get total nodes by LLM
   */
  getNodesByLLM() {
    return { ...this.buckets };
  }

  /**
   * Reset
   */
  reset() {
    this.buckets = {};
    this.timestamps = [];
    this.startTime = Date.now();
  }
}

export class HealthMonitor {
  constructor(port = 9999) {
    this.port = port;
    this.latencyTracker = new LatencyTracker();
    this.conflictMonitor = new ConflictMonitor();
    this.throughputMeter = new ThroughputMeter();

    this.startTime = Date.now();
    this.isRunning = false;
    this.server = null;
  }

  /**
   * Start HTTP health endpoint
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.listen(this.port, () => {
      console.log(
        `[HealthMonitor] Live metrics endpoint: http://localhost:${this.port}/matrix/health`
      );
    });

    this.server.on('error', (error) => {
      console.error('[HealthMonitor] Server error:', error.message);
    });
  }

  /**
   * Stop health endpoint
   */
  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.server) {
      this.server.close();
    }
  }

  /**
   * Handle HTTP requests
   */
  handleRequest(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/matrix/health' || req.url === '/health') {
      const health = this.getHealthStatus();
      res.writeHead(200);
      res.end(JSON.stringify(health, null, 2));
    } else if (req.url === '/matrix/metrics') {
      const metrics = this.getMetrics();
      res.writeHead(200);
      res.end(JSON.stringify(metrics, null, 2));
    } else if (req.url === '/matrix/latency') {
      const latency = this.latencyTracker.getStats();
      res.writeHead(200);
      res.end(JSON.stringify(latency, null, 2));
    } else if (req.url === '/matrix/conflicts') {
      const conflicts = this.conflictMonitor.getStats();
      res.writeHead(200);
      res.end(JSON.stringify(conflicts, null, 2));
    } else if (req.url === '/matrix/throughput') {
      const throughput = {
        overall: this.throughputMeter.getThroughput(),
        perLLM: this.throughputMeter.getPerLLMThroughput(),
        recent60s: this.throughputMeter.getRecentThroughput(60),
        totalByLLM: this.throughputMeter.getNodesByLLM()
      };
      res.writeHead(200);
      res.end(JSON.stringify(throughput, null, 2));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  /**
   * Get overall health status
   */
  getHealthStatus() {
    const uptime = Date.now() - this.startTime;
    const latency = this.latencyTracker.getStats();
    const conflicts = this.conflictMonitor.getStats();
    const throughput = this.throughputMeter.getThroughput();

    // Calculate health score (0-100)
    let score = 100;

    // Deduct for high latency
    if (latency.average > 100) score -= 10;
    if (latency.p99 > 500) score -= 10;

    // Deduct for low resolution rate
    const resRate = parseFloat(conflicts.resolutionRate);
    if (resRate < 80) score -= 15;

    // Deduct for low throughput
    if (throughput < 1) score -= 10;

    const status = score >= 80 ? 'healthy' : score >= 60 ? 'degraded' : 'unhealthy';

    return {
      status,
      score,
      uptime,
      uptime_ms: uptime,
      timestamp: Date.now(),
      latency: {
        average: latency.average.toFixed(2),
        p95: latency.p95.toFixed(2),
        p99: latency.p99.toFixed(2)
      },
      conflicts: conflicts.resolutionRate,
      throughput: throughput.toFixed(2)
    };
  }

  /**
   * Get detailed metrics
   */
  getMetrics() {
    return {
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      latency: this.latencyTracker.getStats(),
      conflicts: this.conflictMonitor.getStats(),
      throughput: {
        overall: this.throughputMeter.getThroughput(),
        perLLM: this.throughputMeter.getPerLLMThroughput(),
        recent60s: this.throughputMeter.getRecentThroughput(60)
      }
    };
  }

  /**
   * Record latency
   */
  recordLatency(latencyMs) {
    this.latencyTracker.recordSample(latencyMs);
  }

  /**
   * Record conflict
   */
  recordConflict(conflict) {
    this.conflictMonitor.recordConflict(conflict);
  }

  /**
   * Record resolution
   */
  recordResolution(conflictId, resolution) {
    this.conflictMonitor.recordResolution(conflictId, resolution);
  }

  /**
   * Record nodes
   */
  recordNodes(llm, count) {
    this.throughputMeter.recordNodes(llm, count);
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.latencyTracker.reset();
    this.conflictMonitor.reset();
    this.throughputMeter.reset();
    this.startTime = Date.now();
  }
}

export default HealthMonitor;
