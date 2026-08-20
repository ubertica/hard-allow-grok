/**
 * Matrix Hub - Central Coordinator for Universal Live Context Mapping
 * Manages all LLM mappers, handles conflict resolution, synchronization, and semantic processing
 * Layer 2 of Universal Live Context Mapping System
 */

import fs from 'fs/promises';
import path from 'path';
import EventEmitter from 'events';
import { performance } from 'perf_hooks';
import { LamportClock } from './matrix-sync-worker.mjs';
import { ConflictResolver } from './matrix-conflict-resolver.mjs';

export class NodeQueueManager {
  constructor() {
    this.queues = {
      grok: [],
      claude: [],
      kimi: [],
      fable: []
    };
    this.processed = new Set();
    this.batchSize = 50;
    this.flushInterval = 1000; // ms
  }

  /**
   * Read and buffer nodes from LLM-specific queues
   */
  async readQueues(basePath) {
    const queueFiles = ['grok', 'claude', 'kimi', 'fable'];

    for (const llm of queueFiles) {
      const queuePath = path.join(basePath, `node-queue-${llm}.jsonl`);
      try {
        const content = await fs.readFile(queuePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const node = JSON.parse(line);
            if (!this.processed.has(node.id)) {
              this.queues[llm].push(node);
              this.processed.add(node.id);
            }
          } catch (e) {
            console.error(`Parse error in ${llm} queue:`, e.message);
          }
        }

        // Clear queue file after reading
        await fs.writeFile(queuePath, '');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`Error reading ${llm} queue:`, error.message);
        }
      }
    }
  }

  /**
   * Get all buffered nodes
   */
  getAllNodes() {
    return Object.values(this.queues).flat();
  }

  /**
   * Check if we have pending work
   */
  hasPending() {
    return Object.values(this.queues).some(q => q.length > 0);
  }

  /**
   * Clear queues
   */
  clear() {
    Object.keys(this.queues).forEach(key => {
      this.queues[key] = [];
    });
  }
}

export class SemanticProcessingPipeline {
  constructor() {
    this.activationCache = new Map();
    this.decayFactor = 0.95; // activation decays at 5% per cycle
    this.spreadingDistance = 3; // how many hops to spread activation
  }

  /**
   * Apply spreading activation to nodes
   * Nodes created recently get higher initial activation
   */
  applySpreadingActivation(nodes, edges, currentTime) {
    // Initialize activation for new nodes
    nodes.forEach(node => {
      const ageMs = currentTime - node.timestamp;
      const ageSec = ageMs / 1000;

      if (!this.activationCache.has(node.id)) {
        // Fresh nodes get boost
        const recencyBoost = Math.max(0.5, 1 - (ageSec / 300)); // decay over 5 minutes
        const typeBoost = node.type === 'decision' ? 1.2 : 1.0;
        const confidenceBoost = node.confidence || 0.8;

        this.activationCache.set(node.id, {
          activation: recencyBoost * typeBoost * confidenceBoost,
          lastUpdated: currentTime
        });
      } else {
        // Decay existing activation
        const state = this.activationCache.get(node.id);
        const decayTime = (currentTime - state.lastUpdated) / 1000;
        const newActivation = state.activation * Math.pow(this.decayFactor, decayTime);
        state.activation = newActivation;
        state.lastUpdated = currentTime;
      }
    });

    // Spread activation through edges
    edges.forEach(edge => {
      const sourceState = this.activationCache.get(edge.source);
      const targetState = this.activationCache.get(edge.target);

      if (sourceState && targetState) {
        const transferAmount = sourceState.activation * edge.weight * 0.1; // 10% transfer
        targetState.activation += transferAmount;
      }
    });

    // Normalize activations
    const activations = [...this.activationCache.values()].map(s => s.activation);
    const maxActivation = Math.max(...activations, 1);

    this.activationCache.forEach(state => {
      state.activation = Math.min(1, state.activation / maxActivation);
    });

    return this.activationCache;
  }

  /**
   * Get activation for a node
   */
  getActivation(nodeId) {
    const state = this.activationCache.get(nodeId);
    return state ? state.activation : 0;
  }

  /**
   * Export activation state
   */
  exportActivations() {
    const result = {};
    this.activationCache.forEach((state, nodeId) => {
      result[nodeId] = state.activation;
    });
    return result;
  }
}

export class CrossLLMSync {
  constructor(basePath = `${process.env.HOME}/.grok/hard-allow`) {
    this.basePath = basePath;
    this.stateFiles = {
      primary: path.join(basePath, 'matrix-state.json'),
      grok: path.join(basePath, 'matrix-state-grok.json'),
      claude: path.join(basePath, 'matrix-state-claude.json'),
      kimi: path.join(basePath, 'matrix-state-kimi.json'),
      fable: path.join(basePath, 'matrix-state-fable.json')
    };
    this.lamportClock = new LamportClock();
  }

  /**
   * Atomic write to all state files simultaneously
   */
  async syncWrite(stateData) {
    const timestamp = Date.now();
    const version = this.lamportClock.increment();

    const payload = {
      ...stateData,
      version,
      timestamp,
      synced: true
    };

    // Write primary state
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      await fs.writeFile(
        this.stateFiles.primary,
        JSON.stringify(payload, null, 2)
      );

      // Write hard-linked copies for each LLM
      // In production, these would be actual hard links (ln -l)
      // For now, we write duplicates
      await Promise.all(
        Object.entries(this.stateFiles)
          .filter(([k]) => k !== 'primary')
          .map(([_, filePath]) =>
            fs.writeFile(filePath, JSON.stringify(payload, null, 2))
          )
      );

      return { success: true, version, timestamp };
    } catch (error) {
      console.error('Sync write error:', error.message);
      throw error;
    }
  }

  /**
   * Read and verify consistency across all state files
   */
  async syncRead() {
    try {
      const primary = JSON.parse(
        await fs.readFile(this.stateFiles.primary, 'utf-8')
      );

      // Verify hard-links are consistent
      const copies = await Promise.all(
        Object.values(this.stateFiles)
          .filter(f => f !== this.stateFiles.primary)
          .map(async (filePath) => {
            try {
              return JSON.parse(await fs.readFile(filePath, 'utf-8'));
            } catch {
              return null;
            }
          })
      );

      const consistent = copies.every(
        c => c && c.version === primary.version && c.timestamp === primary.timestamp
      );

      if (!consistent) {
        console.warn('[CrossLLMSync] State files diverged, re-syncing...');
        await this.syncWrite(primary);
      }

      return primary;
    } catch (error) {
      console.error('Sync read error:', error.message);
      return null;
    }
  }

  /**
   * Detect conflicts via version comparison
   */
  detectConflict(stateA, stateB) {
    if (!stateA || !stateB) return false;
    return stateA.version !== stateB.version || stateA.timestamp !== stateB.timestamp;
  }
}

export class MetricsCollector {
  constructor() {
    this.metrics = {
      nodesCreated: 0,
      edgesCreated: 0,
      conflictsDetected: 0,
      conflictsResolved: 0,
      latencies: [],
      throughput: [],
      lastReset: Date.now()
    };
    this.startTime = performance.now();
  }

  /**
   * Record node creation
   */
  recordNodeCreation(count, latencyMs) {
    this.metrics.nodesCreated += count;
    this.metrics.latencies.push(latencyMs);
  }

  /**
   * Record edge creation
   */
  recordEdgeCreation(count) {
    this.metrics.edgesCreated += count;
  }

  /**
   * Record conflict
   */
  recordConflict(resolved = false) {
    this.metrics.conflictsDetected++;
    if (resolved) this.metrics.conflictsResolved++;
  }

  /**
   * Calculate average latency
   */
  getAverageLatency() {
    if (this.metrics.latencies.length === 0) return 0;
    const sum = this.metrics.latencies.reduce((a, b) => a + b, 0);
    return sum / this.metrics.latencies.length;
  }

  /**
   * Calculate throughput (nodes/second)
   */
  getThroughput() {
    const elapsedSec = (performance.now() - this.startTime) / 1000;
    return elapsedSec > 0 ? this.metrics.nodesCreated / elapsedSec : 0;
  }

  /**
   * Get conflict resolution rate
   */
  getConflictResolutionRate() {
    if (this.metrics.conflictsDetected === 0) return 1.0;
    return this.metrics.conflictsResolved / this.metrics.conflictsDetected;
  }

  /**
   * Export metrics snapshot
   */
  exportMetrics() {
    return {
      ...this.metrics,
      averageLatency: this.getAverageLatency(),
      throughput: this.getThroughput(),
      conflictResolutionRate: this.getConflictResolutionRate(),
      uptime: performance.now() - this.startTime
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      nodesCreated: 0,
      edgesCreated: 0,
      conflictsDetected: 0,
      conflictsResolved: 0,
      latencies: [],
      throughput: [],
      lastReset: Date.now()
    };
    this.startTime = performance.now();
  }
}

export class MatrixHub extends EventEmitter {
  constructor(basePath = `${process.env.HOME}/.grok/hard-allow`) {
    super();
    this.basePath = basePath;
    this.queueManager = new NodeQueueManager();
    this.semanticPipeline = new SemanticProcessingPipeline();
    this.sync = new CrossLLMSync(basePath);
    this.metrics = new MetricsCollector();
    this.conflictResolver = new ConflictResolver();

    this.state = {
      nodes: [],
      edges: [],
      conflicts: [],
      activations: {}
    };

    this.processingInterval = 1000; // Process queues every second
    this.isRunning = false;
  }

  /**
   * Start the hub
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[MatrixHub] Starting...');

    this.processingTimer = setInterval(async () => {
      await this.processCycle();
    }, this.processingInterval);
  }

  /**
   * Stop the hub
   */
  async stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.processingTimer) {
      clearInterval(this.processingTimer);
    }

    // Final flush
    await this.processCycle();
    console.log('[MatrixHub] Stopped');
  }

  /**
   * Main processing cycle
   */
  async processCycle() {
    const cycleStart = performance.now();

    try {
      // Read from all LLM queues
      await this.queueManager.readQueues(this.basePath);

      if (!this.queueManager.hasPending()) return;

      const nodes = this.queueManager.getAllNodes();

      if (nodes.length === 0) return;

      // Process nodes
      await this.processNodes(nodes);

      // Apply spreading activation
      const currentTime = Date.now();
      this.state.activations = this.semanticPipeline.applySpreadingActivation(
        this.state.nodes,
        this.state.edges,
        currentTime
      );

      // Sync state across LLMs
      await this.sync.syncWrite(this.state);

      // Clear queue
      this.queueManager.clear();

      // Record metrics
      const latency = performance.now() - cycleStart;
      this.metrics.recordNodeCreation(nodes.length, latency);

      this.emit('cycle-complete', {
        nodesProcessed: nodes.length,
        latency,
        totalNodes: this.state.nodes.length,
        activations: this.state.activations
      });
    } catch (error) {
      console.error('[MatrixHub] Cycle error:', error.message);
    }
  }

  /**
   * Process nodes: dedupe, merge, extract edges
   */
  async processNodes(newNodes) {
    const nodeMap = new Map();

    // Index existing nodes
    this.state.nodes.forEach(n => nodeMap.set(this.getNodeKey(n), n));

    // Process new nodes
    newNodes.forEach(node => {
      const key = this.getNodeKey(node);

      if (nodeMap.has(key)) {
        // Merge with existing
        const existing = nodeMap.get(key);
        const merged = this.mergeNodes(existing, node);
        nodeMap.set(key, merged);
      } else {
        // Add new node
        nodeMap.set(key, node);
      }
    });

    this.state.nodes = Array.from(nodeMap.values());

    // Extract edges from metadata
    const edges = new Set();
    newNodes.forEach(node => {
      if (node.metadata && node.metadata.edges) {
        node.metadata.edges.forEach(e => {
          edges.add(JSON.stringify(e));
        });
      }
    });

    edges.forEach(eStr => {
      const edge = JSON.parse(eStr);
      if (!this.state.edges.find(e => e.id === edge.id)) {
        this.state.edges.push(edge);
      }
    });

    this.metrics.recordEdgeCreation(edges.size);

    // Handle conflicts
    if (newNodes.some(n => n.metadata && n.metadata.conflicts && n.metadata.conflicts.length > 0)) {
      const conflicts = newNodes
        .flatMap(n => (n.metadata && n.metadata.conflicts) || []);

      for (const conflict of conflicts) {
        this.metrics.recordConflict();

        // Attempt resolution
        const resolution = this.conflictResolver.resolve(
          this.state.nodes.find(n => n.id === conflict.nodeA),
          this.state.nodes.find(n => n.id === conflict.nodeB),
          conflict
        );

        if (resolution) {
          this.metrics.recordConflict(true);
          // Apply resolution (update state)
          if (resolution.keep) {
            const idx = this.state.nodes.findIndex(n => n.id === resolution.keep);
            if (idx >= 0) {
              this.state.nodes[idx].resolution = {
                conflictId: conflict.id,
                reason: resolution.reason,
                timestamp: Date.now()
              };
            }
          }
        }

        this.state.conflicts.push({
          ...conflict,
          resolution: resolution ? 'resolved' : 'pending'
        });
      }
    }
  }

  /**
   * Get a unique key for a node (for deduplication)
   */
  getNodeKey(node) {
    // Use content + source + type as key
    return `${node.source}_${node.type}_${node.content.slice(0, 50)}`;
  }

  /**
   * Merge two versions of the same node
   */
  mergeNodes(existing, incoming) {
    return {
      ...existing,
      id: existing.id, // Keep original ID
      confidence: Math.max(existing.confidence || 0.8, incoming.confidence || 0.8),
      lastSeen: Date.now(),
      sources: [...new Set([existing.source, incoming.source])],
      metadata: {
        ...existing.metadata,
        ...incoming.metadata,
        merged: true
      }
    };
  }

  /**
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return this.metrics.exportMetrics();
  }
}

export default MatrixHub;
