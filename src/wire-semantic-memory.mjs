#!/usr/bin/env node
/**
 * wire-semantic-memory.mjs — Wave 2 Integration Script
 *
 * Wires SemanticMemoryEngine from /Users/c/dev/semantic-memory/ into the
 * hydrated context nodes at ~/.grok/context-nodes/ to enable:
 *   - Spreading activation (semantic navigation across multi-LLM graph)
 *   - Hebbian consolidation (learning from co-activation patterns)
 *   - Context gating (multi-LLM mode awareness)
 *
 * This script:
 * 1. Loads hydrated context nodes (state.json + graph.jsonl)
 * 2. Instantiates SemanticMemoryEngine with production config
 * 3. Provides CLI for manual testing (activate, spread, recall, consolidate)
 * 4. Exports a callable module for arm-v2.mjs to use per activation wave
 *
 * USAGE:
 *   # Interactive CLI (for testing)
 *   node wire-semantic-memory.mjs
 *
 *   # Programmatic (from arm-v2.mjs)
 *   import { WireSemanticMemory } from './wire-semantic-memory.mjs';
 *   const wire = new WireSemanticMemory(config);
 *   await wire.load();
 *   const activation = wire.activate(seedNodeId, context);
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const CONTEXT_NODES_DIR = join(HOME, '.grok', 'context-nodes');
const STATE_FILE = join(CONTEXT_NODES_DIR, 'state.json');
const GRAPH_FILE = join(CONTEXT_NODES_DIR, 'graph.jsonl');
const REGISTRY_FILE = join(CONTEXT_NODES_DIR, 'SHARED_NODE_REGISTRY.json');

// Dynamic import wrapper to load SemanticMemoryEngine
let SemanticMemoryEngine;
let SemanticContextStore;

async function loadEngineModules() {
  if (SemanticMemoryEngine) return;
  const semanticMemPath = join(HOME, 'dev', 'semantic-memory', 'src');
  const engineModule = await import(`file://${semanticMemPath}/SemanticMemoryEngine.mjs`);
  const storeModule = await import(`file://${semanticMemPath}/ContextStore.mjs`);
  SemanticMemoryEngine = engineModule.SemanticMemoryEngine;
  SemanticContextStore = storeModule.SemanticContextStore;
}

/**
 * Production configuration for Wave 2 multi-LLM context integration.
 * Tuned for:
 *   - Faster spread in trusted (hierarchical) relationships
 *   - Slower spread in temporal associations
 *   - Multi-LLM context gating (Claude/Grok/Kimi awareness)
 *   - Hebbian learning across activation boundaries
 */
const WAVE2_CONFIG = {
  // Spreading activation: wider frontier for richer navigation
  spreadDecay: 0.72,           // 72% falloff per hop (was 65%)
  activationThreshold: 0.015,  // Tighter threshold = deeper searches
  maxHops: 5,                  // One extra hop for deeper navigation
  maxFrontier: 1024,           // Double frontier for multi-LLM scale
  initialActivation: 1.2,      // Slightly stronger initial boost

  // Edge-type tuning for multi-LLM graph
  edgeWeights: {
    associative: 0.55,
    causal: 0.88,              // Stronger causal (++ agent coordination)
    temporal: 0.38,
    hierarchical: 0.80,        // Stronger hierarchical (system structure)
    reference: 0.68,           // Stronger reference (project linkage)
    contradiction: 0.40,       // Weaker inhibition (avoid over-damping)
  },

  // Decay rates tuned for HA sessions (6hr typical session)
  decayRates: {
    associative: 0.010,        // Slower associative decay
    causal: 0.003,             // Nearly permanent causal links
    temporal: 0.040,           // Temporal still transient
    hierarchical: 0.0006,      // Extremely persistent structure
    reference: 0.005,
    contradiction: 0.008,
  },

  // Hebbian learning: strengthen frequently co-used nodes
  learningRate: 0.12,          // Faster learning (was 0.08)
  weightCap: 3.5,              // Higher ceiling for learned edges
  weightFloor: 0.008,          // Lower floor (keeps weak associations)
  hebbCoActivationMin: 0.04,   // Lower threshold for co-fire detection
  consolidationDecay: 0.998,   // Slower global decay (less forgetting)

  // Context gating: sharp separation between multi-LLM contexts
  contextGateStrength: 2.0,    // Very sharp context focusing (was 1.5)
  contextFloor: 0.10,          // Lower floor (allow fading to near-zero)

  // Persistence for multi-LLM hard-links
  writerId: `wave2-${process.env.LLM_NAME || 'claude'}`,
  autosaveEveryMs: 10_000,     // More frequent saves for shared state
};

/**
 * WireSemanticMemory: integrates SemanticMemoryEngine with hydrated nodes
 */
export class WireSemanticMemory {
  constructor(config = {}) {
    this.cfg = { ...WAVE2_CONFIG, ...config };
    this.engine = null;
    this.store = null;
    this.nodes = null;
    this.edges = null;
    this.registry = null;
    this.loadedAt = null;
  }

  /**
   * Load hydrated context nodes from ~/.grok/context-nodes/
   * Reconciles state.json (nodes), graph.jsonl (edges), and SHARED_NODE_REGISTRY
   * across hard-linked sessions (claude/grok/kimi).
   */
  async load() {
    // Initialize engine modules on first load
    await loadEngineModules();

    this.engine = new SemanticMemoryEngine(this.cfg);
    this.store = new SemanticContextStore(undefined, this.cfg);

    console.log(`[Wave2] Loading hydrated context from ${CONTEXT_NODES_DIR}...`);

    // 1. Parse state.json (node definitions + metadata)
    const stateRaw = readFileSync(STATE_FILE, 'utf8');
    const state = JSON.parse(stateRaw);
    this.nodes = state.nodes;
    console.log(`  ✓ Loaded ${Object.keys(this.nodes).length} context nodes`);

    // 2. Parse graph.jsonl (edge definitions)
    const graphRaw = readFileSync(GRAPH_FILE, 'utf8');
    const edges = graphRaw
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    this.edges = edges;
    console.log(`  ✓ Loaded ${edges.length} context edges`);

    // 3. Load registry (multi-LLM sync metadata)
    const registryRaw = readFileSync(REGISTRY_FILE, 'utf8');
    this.registry = JSON.parse(registryRaw);
    console.log(`  ✓ Registry synced across ${this.registry.sessions.length} LLM(s)`);

    // 4. Hydrate engine with nodes (idempotent: upsertNode dedupes)
    for (const [nodeId, nodeData] of Object.entries(this.nodes)) {
      const kind = nodeData._type || 'generic';
      const tags = [
        ...(nodeData._label ? [nodeData._label] : []),
        kind,
        // Extract domain tags from node structure
        ...(nodeId.startsWith('system.') ? ['system'] : []),
        ...(nodeId.startsWith('projects.') ? ['project'] : []),
        ...(nodeId.startsWith('agents.') ? ['agent'] : []),
        ...(nodeId.startsWith('hardAllow.') ? ['security', 'nuclear'] : []),
        ...(nodeId.startsWith('skills.') ? ['skill'] : []),
        ...(nodeId.startsWith('context.') ? ['context'] : []),
      ];

      this.engine.upsertNode(nodeId, { kind, tags });
    }
    console.log(`  ✓ Engine hydrated with ${this.engine.nodes.size} nodes`);

    // 5. Add edges to engine
    let edgeCount = 0;
    for (const edge of edges) {
      // Infer edge weight based on relationship type semantics
      let weight = this.cfg.edgeWeights[edge.type] ?? 0.5;
      // Boost system structure edges slightly
      if (edge.from.startsWith('system.') || edge.to.startsWith('system.')) {
        weight = Math.min(1.0, weight * 1.15);
      }
      // Boost prerequisite edges
      if (edge.type === 'prerequisite') {
        weight = this.cfg.edgeWeights.hierarchical;
      }

      this.engine.addEdge(edge.from, edge.to, edge.type, weight);
      edgeCount++;
    }
    console.log(`  ✓ Added ${edgeCount} edges to engine`);

    this.loadedAt = new Date();
    return this;
  }

  /**
   * Activate a seed node and spread activation through the graph.
   * Returns a map of nodeId -> resulting activation.
   *
   * @param {string|string[]} seeds - node id(s) to activate
   * @param {Object} opts
   * @param {string[]} [opts.context] - multi-LLM context tags (claude/grok/kimi)
   * @param {boolean} [opts.commit] - persist activation state
   * @returns {Map<string, number>} nodeId -> activation
   */
  activate(seeds, opts = {}) {
    if (!this.engine) {
      throw new Error('Engine not loaded. Call await wire.load() first.');
    }

    const seedIds = Array.isArray(seeds) ? seeds : [seeds];
    const context = opts.context || [];

    console.log(`\n[Activation] Seeding: ${seedIds.join(', ')}`);
    if (context.length > 0) {
      console.log(`[Activation] Context gates: ${context.join(', ')}`);
    }

    const activation = this.engine.activate(seedIds, { context, now: Date.now() });

    // Log top 10 activated nodes
    const sorted = [...activation.entries()]
      .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
      .slice(0, 10);

    console.log(`[Activation] Top results:`);
    for (const [id, act] of sorted) {
      const node = this.engine.nodes.get(id);
      const label = this.nodes[id]?._label || node?.kind || 'unknown';
      const bar = '█'.repeat(Math.floor(Math.abs(act) * 40));
      console.log(`  ${bar} ${id.padEnd(30)} (${act.toFixed(3)}) "${label}"`);
    }

    return activation;
  }

  /**
   * Associative recall: given cue(s), find semantically related nodes.
   * Uses spreading activation internally but does not persist state changes.
   *
   * @param {string|string[]} cues
   * @param {Object} [opts]
   * @param {number} [opts.k] - top-k results
   * @param {string[]} [opts.context] - multi-LLM context
   * @returns {Array<{id, score, activation, kind, tags}>}
   */
  recall(cues, opts = {}) {
    if (!this.engine) {
      throw new Error('Engine not loaded. Call await wire.load() first.');
    }

    const cueIds = Array.isArray(cues) ? cues : [cues];
    const k = opts.k || 10;
    const context = opts.context || [];

    console.log(`\n[Recall] Cues: ${cueIds.join(', ')}`);
    console.log(`[Recall] Top-${k} associative results:`);

    const results = this.engine.associativeRecall(cueIds, {
      k,
      context,
      excludeCues: false,
      commit: false,
    });

    for (const r of results) {
      const label = this.nodes[r.id]?._label || r.kind || 'unknown';
      const bar = '█'.repeat(Math.floor(r.score * 40));
      console.log(`  ${bar} ${r.id.padEnd(30)} (score: ${r.score.toFixed(3)}) "${label}"`);
    }

    return results;
  }

  /**
   * Find weighted paths between two nodes (for interpretability).
   *
   * @param {string} from
   * @param {string} to
   * @param {Object} [opts]
   * @returns {Array<{path, strength}>}
   */
  findPaths(from, to, opts = {}) {
    if (!this.engine) {
      throw new Error('Engine not loaded. Call await wire.load() first.');
    }

    console.log(`\n[PathFind] from: ${from} → to: ${to}`);
    const paths = this.engine.findPaths(from, to, { maxPaths: opts.maxPaths || 3 });

    if (paths.length === 0) {
      console.log('  (no paths found)');
      return [];
    }

    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      console.log(`  Path ${i + 1} (strength ${p.strength.toFixed(3)}):`);
      let current = from;
      for (const e of p.path) {
        const next = e.to === current ? e.from : e.to;
        console.log(`    ${current} -[${e.type}]→ ${next}`);
        current = next;
      }
    }

    return paths;
  }

  /**
   * Consolidate learned structure via Hebbian learning and prune weak edges.
   * Call this periodically (e.g., end of session) to bake in usage patterns.
   */
  async consolidate() {
    if (!this.engine) {
      throw new Error('Engine not loaded. Call await wire.load() first.');
    }

    console.log(`\n[Consolidation] Running Hebbian pass...`);
    const stats = this.engine.consolidate();
    console.log(`  ✓ Reinforced: ${stats.reinforced}, Created: ${stats.created}, Pruned: ${stats.pruned}`);
    await this.engine.save();
    return stats;
  }

  /**
   * Export engine statistics for monitoring/telemetry.
   */
  stats() {
    if (!this.engine) {
      throw new Error('Engine not loaded. Call await wire.load() first.');
    }

    return {
      timestamp: this.loadedAt,
      config: {
        writerId: this.cfg.writerId,
        spreadDecay: this.cfg.spreadDecay,
        maxHops: this.cfg.maxHops,
      },
      graph: this.engine.stats(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI Interactive Mode (for manual testing and development)
// ─────────────────────────────────────────────────────────────────────────────

async function runInteractiveCLI() {
  const wire = new WireSemanticMemory();
  await wire.load();

  console.log(`\n${'='.repeat(80)}`);
  console.log('Wave 2 Semantic Memory CLI — Context Node Activation Testing');
  console.log(`${'='.repeat(80)}`);
  console.log('Commands:');
  console.log('  activate <node> [context...]  Activate a node with optional context');
  console.log('  recall <node> [context...]    Associative recall from a seed');
  console.log('  paths <from> <to>             Find paths between nodes');
  console.log('  consolidate                   Run Hebbian consolidation pass');
  console.log('  stats                         Show engine statistics');
  console.log('  list [pattern]                List nodes matching pattern');
  console.log('  help                          Show this message');
  console.log('  exit                          Exit CLI');
  console.log('');

  // If running with non-interactive args, process them directly
  if (process.argv.length > 2) {
    return processCLIArgs(wire, process.argv.slice(2));
  }

  // Interactive REPL
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  function prompt() {
    rl.question('wave2> ', async (input) => {
      if (!input.trim()) {
        prompt();
        return;
      }

      try {
        await processCLICommand(wire, input);
      } catch (err) {
        console.error(`Error: ${err.message}`);
      }

      prompt();
    });
  }

  prompt();
}

/**
 * Process CLI arguments from command line (non-interactive).
 */
async function processCLIArgs(wire, args) {
  const [cmd, ...rest] = args;

  if (cmd === 'activate' && rest.length > 0) {
    wire.activate(rest[0], { context: rest.slice(1) });
  } else if (cmd === 'recall' && rest.length > 0) {
    wire.recall(rest[0], { context: rest.slice(1) });
  } else if (cmd === 'paths' && rest.length >= 2) {
    wire.findPaths(rest[0], rest[1]);
  } else if (cmd === 'consolidate') {
    await wire.consolidate();
  } else if (cmd === 'stats') {
    console.log(JSON.stringify(wire.stats(), null, 2));
  } else if (cmd === 'list') {
    listNodes(wire, rest[0]);
  } else {
    console.log('Usage: wire-semantic-memory.mjs <activate|recall|paths|consolidate|stats|list> [args...]');
  }
}

/**
 * Process a single CLI command (REPL mode).
 */
async function processCLICommand(wire, input) {
  const tokens = input.trim().split(/\s+/);
  const [cmd, ...args] = tokens;

  switch (cmd) {
    case 'activate':
      if (args.length === 0) {
        console.log('Usage: activate <node> [context...]');
      } else {
        wire.activate(args[0], { context: args.slice(1) });
      }
      break;

    case 'recall':
      if (args.length === 0) {
        console.log('Usage: recall <node> [context...]');
      } else {
        wire.recall(args[0], { context: args.slice(1) });
      }
      break;

    case 'paths':
      if (args.length < 2) {
        console.log('Usage: paths <from> <to>');
      } else {
        wire.findPaths(args[0], args[1]);
      }
      break;

    case 'consolidate':
      await wire.consolidate();
      break;

    case 'stats':
      console.log(JSON.stringify(wire.stats(), null, 2));
      break;

    case 'list':
      listNodes(wire, args[0]);
      break;

    case 'help':
    case '?':
      console.log(`Commands:
  activate <node> [context...]  Activate a node
  recall <node> [context...]    Associative recall
  paths <from> <to>             Find connection paths
  consolidate                   Hebbian consolidation
  stats                         Show statistics
  list [pattern]                List nodes
  help, ?                       This message
  exit                          Quit`);
      break;

    case 'exit':
    case 'quit':
      process.exit(0);

    default:
      console.log(`Unknown command: ${cmd}. Type 'help' for usage.`);
  }
}

/**
 * List all nodes or nodes matching a pattern.
 */
function listNodes(wire, pattern) {
  const nodes = [...wire.engine.nodes.keys()];
  const filtered = pattern
    ? nodes.filter(id => id.toLowerCase().includes(pattern.toLowerCase()))
    : nodes;

  console.log(`\n[Nodes] (${filtered.length}/${nodes.length} total):`);
  for (const id of filtered.slice(0, 50)) {
    const node = wire.engine.nodes.get(id);
    const label = wire.nodes[id]?._label || node.kind || '';
    console.log(`  ${id.padEnd(40)} (${node.tags?.join(',') || ''})`);
  }
  if (filtered.length > 50) {
    console.log(`  ... and ${filtered.length - 50} more (use pattern to narrow)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  try {
    if (import.meta.url === `file://${process.argv[1]}`) {
      // Running as CLI script
      await runInteractiveCLI();
    }
  } catch (err) {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
