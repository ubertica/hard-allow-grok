/**
 * Matrix Sync Worker - Background processor and state synchronization
 * Handles Lamport clocks, merge strategies, and recovery logic
 * Part of Layer 2: Shared Matrix Hub
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Lamport Clock for causality tracking across LLMs
 */
export class LamportClock {
  constructor() {
    this.time = 0;
  }

  /**
   * Increment clock (after local event)
   */
  increment() {
    this.time++;
    return this.time;
  }

  /**
   * Update clock (on receiving message from other LLM)
   */
  update(receivedTime) {
    this.time = Math.max(this.time, receivedTime) + 1;
    return this.time;
  }

  /**
   * Get current time
   */
  getTime() {
    return this.time;
  }

  /**
   * Reset
   */
  reset() {
    this.time = 0;
  }
}

/**
 * Version Vector for tracking causality across multiple LLMs
 */
export class VersionVector {
  constructor(llms = ['grok', 'claude', 'kimi', 'fable']) {
    this.vector = {};
    llms.forEach(llm => {
      this.vector[llm] = 0;
    });
  }

  /**
   * Increment counter for a specific LLM
   */
  increment(llm) {
    if (this.vector.hasOwnProperty(llm)) {
      this.vector[llm]++;
    }
  }

  /**
   * Update with received vector
   */
  merge(otherVector) {
    Object.keys(this.vector).forEach(llm => {
      this.vector[llm] = Math.max(this.vector[llm], otherVector[llm] || 0);
    });
  }

  /**
   * Check if this vector happened before other
   */
  happensBefore(other) {
    let atLeastOneLess = false;

    for (const llm in this.vector) {
      if (this.vector[llm] > (other[llm] || 0)) {
        return false; // This is greater, so doesn't happen before
      }
      if (this.vector[llm] < (other[llm] || 0)) {
        atLeastOneLess = true;
      }
    }

    return atLeastOneLess;
  }

  /**
   * Check concurrent (neither happens before the other)
   */
  isConcurrent(other) {
    return !this.happensBefore(other) && !this.isGreaterEqual(other);
  }

  /**
   * Check if >= other
   */
  isGreaterEqual(other) {
    for (const llm in this.vector) {
      if (this.vector[llm] < (other[llm] || 0)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get vector as object
   */
  toObject() {
    return { ...this.vector };
  }

  /**
   * Create from object
   */
  static fromObject(obj) {
    const vv = new VersionVector(Object.keys(obj));
    vv.vector = { ...obj };
    return vv;
  }
}

/**
 * Merge Strategy for combining concurrent updates
 */
export class MergeStrategy {
  /**
   * Merge two state versions using Last-Write-Wins (LWW) strategy
   */
  static mergeLastWriteWins(stateA, stateB) {
    if (!stateA) return stateB;
    if (!stateB) return stateA;

    // Use timestamp to determine winner
    if (stateB.timestamp > stateA.timestamp) {
      return stateB;
    }
    return stateA;
  }

  /**
   * Merge two state versions using Content-Based strategy
   * Prefers higher confidence/quality nodes
   */
  static mergeContentBased(stateA, stateB) {
    if (!stateA) return stateB;
    if (!stateB) return stateA;

    const nodes = new Map();

    // Add nodes from both states
    const allNodes = [...(stateA.nodes || []), ...(stateB.nodes || [])];

    allNodes.forEach(node => {
      const key = `${node.source}_${node.type}_${node.content.slice(0, 30)}`;

      if (nodes.has(key)) {
        const existing = nodes.get(key);
        // Keep node with higher confidence
        if (node.confidence > existing.confidence) {
          nodes.set(key, node);
        }
      } else {
        nodes.set(key, node);
      }
    });

    return {
      ...stateA,
      nodes: Array.from(nodes.values()),
      edges: this.mergeEdges(stateA.edges, stateB.edges),
      conflicts: this.mergeConflicts(stateA.conflicts, stateB.conflicts),
      timestamp: Math.max(stateA.timestamp, stateB.timestamp)
    };
  }

  /**
   * Merge edges (deduplication)
   */
  static mergeEdges(edgesA = [], edgesB = []) {
    const edgeMap = new Map();

    [...edgesA, ...edgesB].forEach(edge => {
      if (!edgeMap.has(edge.id)) {
        edgeMap.set(edge.id, edge);
      }
    });

    return Array.from(edgeMap.values());
  }

  /**
   * Merge conflicts (keep all, with dedup)
   */
  static mergeConflicts(conflictsA = [], conflictsB = []) {
    const conflictMap = new Map();

    [...conflictsA, ...conflictsB].forEach(conflict => {
      if (!conflictMap.has(conflict.id)) {
        conflictMap.set(conflict.id, conflict);
      }
    });

    return Array.from(conflictMap.values());
  }
}

/**
 * Recovery Manager - Restore state after crashes
 */
export class RecoveryManager {
  constructor(basePath = `${process.env.HOME}/.grok/hard-allow`) {
    this.basePath = basePath;
    this.journalPath = path.join(basePath, 'live-mapping-journal.jsonl');
    this.checkpointPath = path.join(basePath, 'matrix-checkpoints');
  }

  /**
   * Find latest checkpoint
   */
  async findLatestCheckpoint() {
    try {
      const files = await fs.readdir(this.checkpointPath);
      const checkpoints = files
        .filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'))
        .sort()
        .reverse();

      return checkpoints.length > 0 ? checkpoints[0] : null;
    } catch {
      return null;
    }
  }

  /**
   * Load checkpoint
   */
  async loadCheckpoint(filename) {
    try {
      const content = await fs.readFile(
        path.join(this.checkpointPath, filename),
        'utf-8'
      );
      return JSON.parse(content);
    } catch (error) {
      console.error('Checkpoint load error:', error.message);
      return null;
    }
  }

  /**
   * Replay journal after checkpoint
   */
  async replayJournal(checkpoint) {
    const state = checkpoint ? JSON.parse(JSON.stringify(checkpoint)) : { nodes: [], edges: [], conflicts: [] };

    try {
      const content = await fs.readFile(this.journalPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      let fromCheckpointTime = checkpoint ? checkpoint.timestamp : 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          // Skip entries before checkpoint
          if (entry.timestamp <= fromCheckpointTime) continue;

          // Apply entry to state
          if (entry.type === 'node-add') {
            const existing = state.nodes.find(n => n.id === entry.node.id);
            if (!existing) {
              state.nodes.push(entry.node);
            }
          } else if (entry.type === 'edge-add') {
            const existing = state.edges.find(e => e.id === entry.edge.id);
            if (!existing) {
              state.edges.push(entry.edge);
            }
          } else if (entry.type === 'conflict-add') {
            const existing = state.conflicts.find(c => c.id === entry.conflict.id);
            if (!existing) {
              state.conflicts.push(entry.conflict);
            }
          }
        } catch (e) {
          console.error('Journal entry parse error:', e.message);
        }
      }

      return state;
    } catch (error) {
      console.error('Journal replay error:', error.message);
      return state;
    }
  }

  /**
   * Create checkpoint
   */
  async createCheckpoint(state) {
    try {
      await fs.mkdir(this.checkpointPath, { recursive: true });

      const timestamp = Date.now();
      const filename = `checkpoint-${timestamp}.json`;
      const filepath = path.join(this.checkpointPath, filename);

      await fs.writeFile(
        filepath,
        JSON.stringify({ ...state, timestamp }, null, 2)
      );

      // Keep only last 10 checkpoints
      const files = await fs.readdir(this.checkpointPath);
      const checkpoints = files
        .filter(f => f.startsWith('checkpoint-'))
        .sort()
        .reverse();

      if (checkpoints.length > 10) {
        const toDelete = checkpoints.slice(10);
        await Promise.all(
          toDelete.map(f =>
            fs.unlink(path.join(this.checkpointPath, f))
          )
        );
      }

      return filename;
    } catch (error) {
      console.error('Checkpoint create error:', error.message);
      return null;
    }
  }

  /**
   * Perform recovery
   */
  async recover() {
    const checkpointFile = await this.findLatestCheckpoint();
    let checkpoint = null;

    if (checkpointFile) {
      console.log(`[Recovery] Found checkpoint: ${checkpointFile}`);
      checkpoint = await this.loadCheckpoint(checkpointFile);
    }

    console.log('[Recovery] Replaying journal...');
    const recoveredState = await this.replayJournal(checkpoint);

    return recoveredState;
  }
}

/**
 * Background processor - manages sync cycles
 */
export class MatrixSyncWorker {
  constructor(hub, basePath = `${process.env.HOME}/.grok/hard-allow`) {
    this.hub = hub;
    this.basePath = basePath;
    this.lamportClock = new LamportClock();
    this.versionVector = new VersionVector();
    this.recoveryManager = new RecoveryManager(basePath);
    this.isRunning = false;
    this.checkpointInterval = 60000; // Create checkpoint every 60 seconds
    this.nodeCountThreshold = 1000; // Or every 1000 nodes
    this.nodeCountSinceCheckpoint = 0;
  }

  /**
   * Start background worker
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[MatrixSyncWorker] Starting...');

    // Attempt recovery
    const recoveredState = await this.recoveryManager.recover();
    if (recoveredState && this.hub) {
      this.hub.state = recoveredState;
      console.log('[MatrixSyncWorker] State recovered');
    }

    // Start checkpoint loop
    this.checkpointTimer = setInterval(async () => {
      await this.checkpoint();
    }, this.checkpointInterval);

    // Listen for hub events
    if (this.hub) {
      this.hub.on('cycle-complete', (event) => {
        this.nodeCountSinceCheckpoint += event.nodesProcessed;

        if (this.nodeCountSinceCheckpoint >= this.nodeCountThreshold) {
          this.checkpoint();
          this.nodeCountSinceCheckpoint = 0;
        }
      });
    }
  }

  /**
   * Stop worker
   */
  async stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
    }

    // Final checkpoint
    await this.checkpoint();
    console.log('[MatrixSyncWorker] Stopped');
  }

  /**
   * Create periodic checkpoint
   */
  async checkpoint() {
    if (!this.hub) return;

    const state = this.hub.getState();
    const filename = await this.recoveryManager.createCheckpoint(state);

    if (filename) {
      console.log(`[MatrixSyncWorker] Checkpoint created: ${filename}`);
    }
  }

  /**
   * Get Lamport clock time
   */
  clockIncrement() {
    return this.lamportClock.increment();
  }

  /**
   * Update Lamport clock from peer
   */
  clockUpdate(peerTime) {
    return this.lamportClock.update(peerTime);
  }

  /**
   * Get current version vector
   */
  getVersionVector() {
    return this.versionVector.toObject();
  }
}

export default MatrixSyncWorker;
