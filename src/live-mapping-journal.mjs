/**
 * Live Mapping Journal - Persistence layer and audit trail
 * JSONL append-only log for recovery and replay
 * Layer 5: Persistence & Recovery
 */

import fs from 'fs/promises';
import path from 'path';

export class LiveMappingJournal {
  constructor(journalPath = `${process.env.HOME}/.grok/hard-allow/live-mapping-journal.jsonl`) {
    this.journalPath = journalPath;
    this.buffer = [];
    this.bufferSize = 100;
    this.flushInterval = 5000; // 5 seconds
    this.isRunning = false;
    this.writeQueue = [];
    this.isWriting = false;
  }

  /**
   * Start periodic flush
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Stop journal
   */
  async stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Final flush
    await this.flush();
  }

  /**
   * Log a node addition
   */
  async logNodeAdd(node) {
    const entry = {
      type: 'node-add',
      node,
      timestamp: Date.now(),
      sequence: this.buffer.length
    };

    return this.logEntry(entry);
  }

  /**
   * Log an edge addition
   */
  async logEdgeAdd(edge) {
    const entry = {
      type: 'edge-add',
      edge,
      timestamp: Date.now(),
      sequence: this.buffer.length
    };

    return this.logEntry(entry);
  }

  /**
   * Log a conflict
   */
  async logConflict(conflict) {
    const entry = {
      type: 'conflict-add',
      conflict,
      timestamp: Date.now(),
      sequence: this.buffer.length
    };

    return this.logEntry(entry);
  }

  /**
   * Log conflict resolution
   */
  async logResolution(conflictId, resolution) {
    const entry = {
      type: 'conflict-resolution',
      conflictId,
      resolution,
      timestamp: Date.now(),
      sequence: this.buffer.length
    };

    return this.logEntry(entry);
  }

  /**
   * Log activation update
   */
  async logActivationUpdate(nodeId, activation) {
    const entry = {
      type: 'activation-update',
      nodeId,
      activation,
      timestamp: Date.now(),
      sequence: this.buffer.length
    };

    return this.logEntry(entry);
  }

  /**
   * Log P2 improvement
   */
  async logP2Improvement(improvement) {
    const entry = {
      type: 'p2-improvement',
      improvement,
      timestamp: Date.now(),
      sequence: this.buffer.length
    };

    return this.logEntry(entry);
  }

  /**
   * Log any entry
   */
  async logEntry(entry) {
    this.buffer.push(entry);
    this.writeQueue.push(entry);

    // Auto-flush if buffer full
    if (this.buffer.length >= this.bufferSize) {
      return this.flush();
    }

    return true;
  }

  /**
   * Flush buffer to disk
   */
  async flush() {
    if (this.writeQueue.length === 0) return;

    // Prevent concurrent writes
    if (this.isWriting) return;
    this.isWriting = true;

    try {
      const entries = [...this.writeQueue];
      this.writeQueue = [];

      // Prepare directory
      const dir = path.dirname(this.journalPath);
      await fs.mkdir(dir, { recursive: true });

      // Append entries to JSONL file
      const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';

      await fs.appendFile(this.journalPath, lines);

      return true;
    } catch (error) {
      console.error('Journal flush error:', error.message);
      // Re-add to queue on failure
      this.writeQueue.unshift(...entries);
      return false;
    } finally {
      this.isWriting = false;
    }
  }

  /**
   * Read entire journal
   */
  async readAll() {
    try {
      const content = await fs.readFile(this.journalPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      return lines.map((line, idx) => {
        try {
          return { ...JSON.parse(line), lineNumber: idx + 1 };
        } catch (e) {
          console.error(`Parse error on line ${idx + 1}:`, e.message);
          return null;
        }
      }).filter(e => e !== null);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  /**
   * Read journal entries since timestamp
   */
  async readSince(timestamp) {
    const entries = await this.readAll();
    return entries.filter(e => e.timestamp >= timestamp);
  }

  /**
   * Get journal statistics
   */
  async getStats() {
    const entries = await this.readAll();

    const stats = {
      totalEntries: entries.length,
      byType: {},
      timeRange: null,
      size: 0
    };

    entries.forEach(e => {
      stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;
    });

    if (entries.length > 0) {
      stats.timeRange = {
        start: entries[0].timestamp,
        end: entries[entries.length - 1].timestamp,
        duration: entries[entries.length - 1].timestamp - entries[0].timestamp
      };
    }

    // Get file size
    try {
      const stat = await fs.stat(this.journalPath);
      stats.size = stat.size;
    } catch {
      stats.size = 0;
    }

    return stats;
  }

  /**
   * Clear old entries (archive strategy)
   */
  async archiveOldEntries(olderThanMs) {
    const entries = await this.readAll();
    const cutoff = Date.now() - olderThanMs;

    const recent = entries.filter(e => e.timestamp >= cutoff);
    const archived = entries.filter(e => e.timestamp < cutoff);

    if (archived.length > 0) {
      // Write archived to separate file
      const archiveDir = path.join(
        path.dirname(this.journalPath),
        'archives'
      );
      await fs.mkdir(archiveDir, { recursive: true });

      const archiveFile = path.join(
        archiveDir,
        `journal-archive-${Date.now()}.jsonl`
      );

      const archiveLines = archived.map(e => JSON.stringify(e)).join('\n') + '\n';
      await fs.writeFile(archiveFile, archiveLines);

      // Rewrite journal with only recent
      const recentLines = recent.map(e => JSON.stringify(e)).join('\n');
      if (recentLines) {
        await fs.writeFile(this.journalPath, recentLines + '\n');
      } else {
        await fs.writeFile(this.journalPath, '');
      }

      return {
        archived: archived.length,
        retained: recent.length,
        archiveFile
      };
    }

    return { archived: 0, retained: recent.length };
  }

  /**
   * Truncate journal (use with caution)
   */
  async truncate() {
    try {
      await fs.writeFile(this.journalPath, '');
      this.buffer = [];
      this.writeQueue = [];
      return true;
    } catch (error) {
      console.error('Truncate error:', error.message);
      return false;
    }
  }

  /**
   * Export journal as structured data
   */
  async export() {
    const entries = await this.readAll();

    const exported = {
      exportDate: Date.now(),
      totalEntries: entries.length,
      entries
    };

    return exported;
  }

  /**
   * Import journal entries
   */
  async import(data) {
    if (!Array.isArray(data.entries)) {
      throw new Error('Invalid import format: entries must be array');
    }

    for (const entry of data.entries) {
      await this.logEntry(entry);
    }

    await this.flush();
    return data.entries.length;
  }
}

/**
 * Checkpointing utility
 */
export class CheckpointManager {
  constructor(basePath = `${process.env.HOME}/.grok/hard-allow`) {
    this.basePath = basePath;
    this.checkpointPath = path.join(basePath, 'matrix-checkpoints');
  }

  /**
   * Create checkpoint
   */
  async createCheckpoint(state, metadata = {}) {
    try {
      await fs.mkdir(this.checkpointPath, { recursive: true });

      const timestamp = Date.now();
      const filename = `checkpoint-${timestamp}.json`;
      const filepath = path.join(this.checkpointPath, filename);

      const checkpoint = {
        ...state,
        timestamp,
        metadata,
        version: 1
      };

      await fs.writeFile(
        filepath,
        JSON.stringify(checkpoint, null, 2)
      );

      return { filename, filepath, timestamp };
    } catch (error) {
      console.error('Checkpoint create error:', error.message);
      throw error;
    }
  }

  /**
   * List checkpoints
   */
  async listCheckpoints() {
    try {
      const files = await fs.readdir(this.checkpointPath);

      const checkpoints = files
        .filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'))
        .map(f => ({
          filename: f,
          timestamp: parseInt(f.match(/\d+/)[0])
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

      return checkpoints;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  /**
   * Load checkpoint
   */
  async loadCheckpoint(filename) {
    const filepath = path.join(this.checkpointPath, filename);
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Clean old checkpoints (keep last N)
   */
  async cleanOldCheckpoints(keepCount = 5) {
    const checkpoints = await this.listCheckpoints();

    if (checkpoints.length <= keepCount) {
      return { deleted: 0, retained: checkpoints.length };
    }

    const toDelete = checkpoints.slice(keepCount);

    for (const cp of toDelete) {
      const filepath = path.join(this.checkpointPath, cp.filename);
      await fs.unlink(filepath);
    }

    return {
      deleted: toDelete.length,
      retained: keepCount
    };
  }
}

export default LiveMappingJournal;
