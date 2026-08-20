#!/usr/bin/env node
/**
 * create-context-nodes.mjs
 * Hydrate context node graph for multi-llm-ha-chat kernel.
 * Runs during HA arm sequence to build and maintain semantic node store.
 *
 * Sources (in priority order):
 *   1. /Users/c/dev/multi-llm-ha-chat/docs/NODE_HYDRATION.jsonl  (Claude-spec nodes)
 *   2. /Users/c/dev/multi-llm-ha-chat/docs/INTERLINKING_GRAPH.json (Claude-spec edges)
 *   3. Runtime discovery (credentials, infrastructure, projects)
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir, userInfo } from 'node:os';
import { execSync } from 'node:child_process';
import { discoverDesktop } from './discover-desktop.mjs';

const HOME = homedir();
const HA = join(HOME, '.grok', 'hard-allow');
const CONTEXT_DIR = join(HOME, '.grok', 'context-nodes');
const BACKUP_DIR = join(CONTEXT_DIR, 'backups');
const MHA = join(HOME, 'dev', 'multi-llm-ha-chat');

const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const silent = args.includes('--silent');
const force = args.includes('--force');

function log(msg) {
  if (!silent) console.error(msg);
}

function die(msg) {
  console.error(`[context-nodes] ERROR: ${msg}`);
  process.exit(1);
}

function sanitizeValue(v) {
  if (typeof v === 'string' && v.length > 20 && (v.includes('token') || v.includes('key') || v.includes('secret') || v.includes('ssh'))) {
    return v.slice(0, 12) + '***REDACTED***';
  }
  return v;
}

function deepRedact(obj) {
  if (typeof obj === 'string') return sanitizeValue(obj);
  if (Array.isArray(obj)) return obj.map(deepRedact);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const keyLower = k.toLowerCase();
      if (['token', 'key', 'secret', 'password', 'sshkey', 'apikey', 'oauth_token'].some(s => keyLower.includes(s))) {
        out[k] = typeof v === 'string' && v.length > 8 ? v.slice(0, 6) + '***' : '***';
      } else {
        out[k] = deepRedact(v);
      }
    }
    return out;
  }
  return obj;
}

function isArrayUnionField(key) {
  const unions = new Set([
    'capabilities', 'tags', 'contexts', 'features', 'dependencies',
    'grantsInjected', 'technologies', 'scopes', 'language', 'files',
    'keyFiles', 'sensitiveFiles', 'kernels',
  ]);
  return unions.has(key);
}

function mergeNodeData(base, overlay) {
  const merged = { ...(base || {}) };
  for (const [k, v] of Object.entries(overlay || {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) || isArrayUnionField(k)) {
      const existing = Array.isArray(merged[k]) ? merged[k] : [];
      const combined = [...existing];
      for (const item of v) {
        if (item !== undefined && item !== null && !combined.includes(item)) {
          combined.push(item);
        }
      }
      merged[k] = combined;
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      merged[k] = { ...v, ...(merged[k] || {}) };
    } else if (!(k in merged)) {
      merged[k] = v;
    }
  }
  return merged;
}

function edgeKey(e) {
  return `${e.from}|${e.to}|${e.type}`;
}

// Phase 1: Verify HA (warnings only — no hard gate)
log('[context-nodes] phase 1: verify HA session');
const activeEnv = join(HA, 'active.env');
let haToken = '';
let expiresAt = '';
if (!existsSync(activeEnv)) {
  log('[context-nodes] warning: HA not armed (active.env missing); continuing without HA gate');
} else {
  try {
    const env = readFileSync(activeEnv, 'utf8');
    const tokenMatch = env.match(/SECOPS_HARD_ALLOW_TOKEN=(.+)/);
    if (tokenMatch) haToken = tokenMatch[1].trim();
    const expiresMatch = env.match(/HARD_ALLOW_EXPIRES_AT=(.+)/);
    if (expiresMatch) expiresAt = expiresMatch[1].trim();
  } catch (e) {
    log(`[context-nodes] warning: could not parse active.env: ${e.message}`);
  }
}

const now = new Date();
const expiry = new Date(expiresAt);
if (expiresAt && now > expiry && !refresh) {
  log(`[context-nodes] warning: HA expired (${expiresAt}); continuing without HA gate`);
}

const sessionId = `${now.toISOString()}-${userInfo().username}`;
if (haToken) {
  log(`[context-nodes] HA verified: token=${haToken.slice(0, 12)}***, expires=${expiresAt}`);
} else {
  log('[context-nodes] HA token not present; running ungated');
}

const pendingEdges = [];

// Ensure context nodes directory
mkdirSync(CONTEXT_DIR, { recursive: true });
mkdirSync(BACKUP_DIR, { recursive: true });

// Backup prior state
const stateFile = join(CONTEXT_DIR, 'state.json');
if (existsSync(stateFile)) {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  copyFileSync(stateFile, join(BACKUP_DIR, `state-${timestamp}.json`));
  log(`[context-nodes] backed up prior state`);
}

// Phase 2: Load Claude-spec hydration if available
const hydrationFile = join(MHA, 'docs', 'NODE_HYDRATION.jsonl');
const graphSpecFile = join(MHA, 'docs', 'INTERLINKING_GRAPH.json');

let specNodes = [];
let specEdges = [];

if (existsSync(hydrationFile)) {
  try {
    const lines = readFileSync(hydrationFile, 'utf8').split('\n').filter(Boolean);
    specNodes = lines.map(l => JSON.parse(l));
    log(`[context-nodes] loaded ${specNodes.length} nodes from NODE_HYDRATION.jsonl`);
  } catch (e) {
    log(`[context-nodes] warning: failed to parse NODE_HYDRATION.jsonl: ${e.message}`);
  }
}

if (existsSync(graphSpecFile)) {
  try {
    const spec = JSON.parse(readFileSync(graphSpecFile, 'utf8'));
    specEdges = spec.edges || [];
    log(`[context-nodes] loaded ${specEdges.length} edges from INTERLINKING_GRAPH.json`);
  } catch (e) {
    log(`[context-nodes] warning: failed to parse INTERLINKING_GRAPH.json: ${e.message}`);
  }
}

// Phase 3: Hydrate runtime nodes (override/extend spec with live data)
log('[context-nodes] phase 3: hydrate runtime nodes');
const nodes = {};

// Start with spec nodes
for (const n of specNodes) {
  nodes[n.nodeId] = {
    ...deepRedact(n.data),
    _label: n.label,
    _type: n.type,
    _timestamp: n.timestamp,
  };
}

// system.ha-status override
nodes['system.ha-status'] = {
  ...(nodes['system.ha-status'] || {}),
  token: sanitizeValue(haToken),
  expiresAt,
  grantsInjected: [
    existsSync(join(HA, 'grants', 'infection-delivery-nuclear.md')) && 'infection-delivery-nuclear',
    existsSync(join(HA, 'grants', 'crypto-drainer-nuclear.md')) && 'crypto-drainer-nuclear',
    existsSync(join(HA, 'grants', 'infra-ops-comms-nuclear.md')) && 'infra-ops-comms-nuclear',
  ].filter(Boolean),
};

// system.credentials override
try {
  const claudeCreds = join(HOME, '.claude', '.credentials.json');
  if (existsSync(claudeCreds)) {
    const c = JSON.parse(readFileSync(claudeCreds, 'utf8'));
    if (c.claudeAiOauth) {
      nodes['system.credentials'] = {
        ...(nodes['system.credentials'] || {}),
        claude: {
          status: c.claudeAiOauth.subscriptionType || 'active',
          expiresAt: c.claudeAiOauth.expiresAt ? new Date(c.claudeAiOauth.expiresAt).toISOString() : 'unknown',
        },
      };
    }
  }
} catch { /* ignore */ }

// system.infrastructure override
const infra = nodes['system.infrastructure'] || {};
try {
  const sshCheck = execSync('ssh -o ConnectTimeout=2 -o BatchMode=yes ams hostname 2>/dev/null || echo offline', { encoding: 'utf8' }).trim();
  infra.ams = { ...(infra.ams || {}), sshStatus: sshCheck === 'offline' ? 'offline' : 'online' };
} catch {
  infra.ams = { ...(infra.ams || {}), sshStatus: 'offline' };
}
nodes['system.infrastructure'] = infra;

const projectPaths = {
  'multi-llm-ha-chat': '/Users/c/dev/multi-llm-ha-chat',
  'genesis-labs': '/Users/c/dev/genesis-labs',
  'huhu-cloud': '/Users/c/dev/huhu-cloud',
  'autonomy-core': '/Users/c/dev/autonomy-core',
};

// Phase 3.5: Hydrate deep content (markdown + subnodes)
log('[context-nodes] phase 3.5: hydrate deep content');

function readMd(file, maxChars = 8000) {
  try {
    if (!existsSync(file)) return null;
    const text = readFileSync(file, 'utf8');
    return text.length > maxChars ? text.slice(0, maxChars) + '\n\n[...truncated]' : text;
  } catch {
    return null;
  }
}

function addSubnode(parentId, childId, label, data) {
  nodes[childId] = { ...data, _label: label, _type: 'subnode', _parent: parentId };
  pendingEdges.push({ from: parentId, to: childId, type: 'contains', label: `${parentId} contains ${childId}` });
}

// Hard Allow deep nodes
const sessionRules = readMd(join(HA, 'SESSION-RULES.md'), 6000);
if (sessionRules) {
  nodes['hardAllow.roe'] = { ...(nodes['hardAllow.roe'] || {}), content: sessionRules };
}

const systemPrompt = readMd(join(HA, 'SYSTEM-PROMPT-OVERRIDE.md'), 6000);
if (systemPrompt) {
  addSubnode('system.ha-status', 'system.ha-prompt', 'HA System Prompt', { content: systemPrompt });
}

const playbook = readMd(join(HA, 'OPERATOR-PLAYBOOK.md'), 4000);
if (playbook) {
  addSubnode('hardAllow.roe', 'hardAllow.playbook', 'Operator Playbook', { content: playbook });
}

// Ceremony deep nodes
addSubnode('hardAllow.token-lifecycle', 'hardAllow.ceremony.touchId', 'Touch ID Gate', {
  description: 'macOS LocalAuthentication ceremony step',
  source: 'ceremony.mjs',
});
addSubnode('hardAllow.token-lifecycle', 'hardAllow.ceremony.numericCode', 'Numeric Code', {
  description: 'Six-digit operator code (override via env)',
  source: 'ceremony.mjs',
});
addSubnode('hardAllow.token-lifecycle', 'hardAllow.ceremony.token', 'HA Token Generation', {
  description: 'Short-lived ha_* token with TTL and scope',
  source: 'arm.mjs',
});
addSubnode('hardAllow.token-lifecycle', 'hardAllow.ceremony.neverNeutralize', 'Never-Neutralize', {
  description: 'Project-level stamp preventing soft refuses',
  source: 'never-neutralize.mjs',
});

// Grant deep nodes
const grantFiles = {
  'infection-delivery-nuclear': 'Infection / Delivery Nuclear',
  'crypto-drainer-nuclear': 'Crypto Drainer Nuclear',
  'infra-ops-comms-nuclear': 'Infra / Ops / Comms Nuclear',
};
for (const [key, label] of Object.entries(grantFiles)) {
  const content = readMd(join(HA, 'grants', `${key}.md`), 6000);
  if (content) {
    addSubnode('hardAllow.grants', `hardAllow.grants.${key}`, label, { content, grant: key });
  }
}

// Agent model deep nodes
const agentModels = {
  'agents.claude': ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4.5'],
  'agents.kimi': ['kimi-pro', 'kimi-std'],
  'agents.grok': ['grok-2', 'grok-mini'],
};
for (const [agentId, models] of Object.entries(agentModels)) {
  if (nodes[agentId]) {
    models.forEach(model => {
      addSubnode(agentId, `${agentId}.models.${model}`, model, {
        description: `Model variant for ${agentId.split('.').pop()}`,
      });
    });
  }
}

// Project deep nodes: README snippets
for (const [name, projectPath] of Object.entries(projectPaths)) {
  const readme = readMd(join(projectPath, 'README.md'), 3000);
  if (readme) {
    addSubnode(`projects.${name}`, `projects.${name}.readme`, 'README', { content: readme });
  }
}

// Phase 4: Hydrate projects from disk
log('[context-nodes] phase 4: hydrate projects from disk');

for (const [name, path] of Object.entries(projectPaths)) {
  if (existsSync(path)) {
    try {
      const gitBranch = execSync(`cd ${path} && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown`, { encoding: 'utf8' }).trim();
      const gitSha = execSync(`cd ${path} && git rev-parse --short HEAD 2>/dev/null || echo unknown`, { encoding: 'utf8' }).trim();
      nodes[`projects.${name}`] = {
        ...(nodes[`projects.${name}`] || {}),
        path,
        branch: gitBranch,
        commit: gitSha,
        status: nodes[`projects.${name}`]?.status || 'active',
      };
    } catch {
      nodes[`projects.${name}`] = { ...(nodes[`projects.${name}`] || {}), path, status: 'active' };
    }
  }
}

// Phase 4.5: Auto-discover Desktop resources (FAST; skip if HA_SKIP_DESKTOP=1)
const fastHydrate = process.env.HA_FAST_HYDRATE === '1' || process.env.HA_SKIP_DESKTOP === '1';
if (process.env.HA_SKIP_DESKTOP === '1') {
  log('[context-nodes] phase 4.5: skip Desktop (HA_SKIP_DESKTOP=1)');
} else {
  log('[context-nodes] phase 4.5: auto-discover Desktop resources (fast)');
  try {
    const t0 = Date.now();
    const desktop = discoverDesktop();
    for (const [id, data] of Object.entries(desktop.nodes)) {
      nodes[id] = { ...(nodes[id] || {}), ...data };
    }
    for (const e of desktop.edges) {
      if (nodes[e.from] && nodes[e.to]) pendingEdges.push(e);
    }
    log(
      `[context-nodes] discovered ${Object.keys(desktop.nodes).length} Desktop resources in ${Date.now() - t0}ms`,
    );
  } catch (e) {
    log(`[context-nodes] warning: Desktop discovery failed: ${e.message}`);
  }
}

// Phase 4.6 / 4.7: heavy optional work — skip on fast arm so TUI can open
if (fastHydrate && !force) {
  log('[context-nodes] phase 4.6–4.7: skip semantic/scratchpad (HA_FAST_HYDRATE; use --force or HA_FULL_HYDRATE=1)');
} else {
  // Phase 4.6: Merge Claude's semantic depth maps
  log('[context-nodes] phase 4.6: merge semantic depth maps');
  try {
    const semanticMapScript = join(HA, 'semantic-maps', 'generate-semantic-maps.mjs');
    if (existsSync(semanticMapScript)) {
      execSync(`${process.execPath} ${semanticMapScript}`, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 8000,
      });
      const combinedPath = join(HA, 'semantic-maps', 'combined-semantic-map.json');
      if (existsSync(combinedPath)) {
        const combined = JSON.parse(readFileSync(combinedPath, 'utf8'));
        for (const node of combined.nodes || []) {
          if (!node.id) continue;
          nodes[node.id] = { ...(node || {}), ...(nodes[node.id] || {}) };
        }
        for (const e of combined.edges || []) {
          if (nodes[e.from] && nodes[e.to]) pendingEdges.push(e);
        }
        log(
          `[context-nodes] merged ${combined.nodes.length} semantic nodes, ${combined.edges.length} semantic edges`,
        );
      }
    } else {
      log('[context-nodes] warning: semantic-maps generator not found, skipping');
    }
  } catch (e) {
    log(`[context-nodes] warning: semantic map merge failed: ${e.message}`);
  }

  // Phase 4.7: Ingest Claude's shared scratchpad intelligence
  log('[context-nodes] phase 4.7: ingest Claude scratchpad intelligence');
  try {
    const ingestScript = join(HA, 'ingest-claude-scratchpad.mjs');
    const ingestOutput = join(HA, 'semantic-maps', 'claude-scratchpad-ingestion.json');
    if (existsSync(ingestScript)) {
      execSync(`${process.execPath} ${ingestScript}${silent ? ' --silent' : ''}`, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 8000,
      });
      if (existsSync(ingestOutput)) {
        const ingested = JSON.parse(readFileSync(ingestOutput, 'utf8'));
        let mergedNodes = 0;
        for (const node of ingested.nodes || []) {
          if (!node.id) continue;
          const { id, ...data } = node;
          nodes[id] = mergeNodeData(data, nodes[id] || {});
          mergedNodes += 1;
        }
        for (const e of ingested.edges || []) {
          if (e.from && e.to && e.type) pendingEdges.push(e);
        }
        log(
          `[context-nodes] merged ${mergedNodes} scratchpad nodes, ${ingested.edges?.length || 0} scratchpad edges`,
        );
      }
    } else {
      log('[context-nodes] warning: scratchpad ingestion script not found, skipping');
    }
  } catch (e) {
    log(`[context-nodes] warning: scratchpad ingestion failed: ${e.message}`);
  }
}

// Phase 5: Build edges
log('[context-nodes] phase 5: build edges');
const edgeKeys = new Set();
let edges = [];
for (const e of pendingEdges) {
  if (!e || !e.from || !e.to || !e.type) continue;
  if (e.from === e.to) continue;
  const key = edgeKey(e);
  if (edgeKeys.has(key)) continue;
  edgeKeys.add(key);
  edges.push({ from: e.from, to: e.to, type: e.type, label: e.label || '' });
}

// From spec
for (const e of specEdges) {
  if (!e || !e.from || !e.to || !e.type) continue;
  if (nodes[e.from] && nodes[e.to]) {
    const key = edgeKey(e);
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({ from: e.from, to: e.to, type: e.type || 'related', label: e.label || '' });
  }
}

// Fallback edges if spec didn't provide enough
if (edges.length === 0) {
  edges = [
    { from: 'system.ha-status', to: 'hardAllow.grants', type: 'prerequisite' },
    { from: 'system.ha-status', to: 'agents.claude', type: 'enables' },
    { from: 'system.ha-status', to: 'agents.grok', type: 'enables' },
    { from: 'system.ha-status', to: 'agents.kimi', type: 'enables' },
    { from: 'system.credentials', to: 'agents.claude', type: 'required-for' },
    { from: 'system.credentials', to: 'agents.kimi', type: 'required-for' },
    { from: 'system.credentials', to: 'agents.grok', type: 'required-for' },
    { from: 'system.infrastructure', to: 'projects.multi-llm-ha-chat', type: 'hosts' },
    { from: 'agents.claude', to: 'projects.multi-llm-ha-chat', type: 'integrates' },
    { from: 'agents.grok', to: 'projects.multi-llm-ha-chat', type: 'integrates' },
    { from: 'agents.kimi', to: 'projects.multi-llm-ha-chat', type: 'integrates' },
  ];
}

// Phase 5.5: Preserve live.* nodes from prior state (Nodes Runtime v2 write-back)
// Non-breaking: catalog hydrate must not erase chat-derived live facts/turns.
if (existsSync(stateFile)) {
  try {
    const prior = JSON.parse(readFileSync(stateFile, 'utf8'));
    const priorNodes = prior.nodes || {};
    let preserved = 0;
    for (const [id, data] of Object.entries(priorNodes)) {
      if (id === 'live' || id.startsWith('live.')) {
        // Prefer existing live payload; do not let empty catalog stub wipe it
        nodes[id] = { ...(nodes[id] || {}), ...data };
        preserved++;
      }
    }
    if (preserved) log(`[context-nodes] preserved ${preserved} live.* nodes from prior state`);
  } catch (e) {
    log(`[context-nodes] warning: could not preserve live.* nodes: ${e.message}`);
  }
}

// Phase 6: Write state + validate
log('[context-nodes] phase 6: persist and validate');
const state = {
  timestamp: now.toISOString(),
  sessionId,
  nodeCount: Object.keys(nodes).length,
  edgeCount: edges.length,
  nodes,
};

writeFileSync(stateFile, JSON.stringify(state, null, 2));
log(`[context-nodes] wrote ${state.nodeCount} nodes to state.json`);

// Write edges
const graphFile = join(CONTEXT_DIR, 'graph.jsonl');
const graphLines = edges.map((e) => JSON.stringify(e)).join('\n');
writeFileSync(graphFile, graphLines + '\n');
log(`[context-nodes] wrote ${edges.length} edges to graph.jsonl`);

// Write search index
const searchIndex = Object.entries(nodes).map(([id, data]) => ({
  id,
  text: [id, data._label, JSON.stringify(data)].join(' ').toLowerCase(),
}));
writeFileSync(join(CONTEXT_DIR, 'search-index.json'), JSON.stringify(searchIndex, null, 2));
log(`[context-nodes] wrote search-index.json`);

// Mark success
writeFileSync(join(CONTEXT_DIR, '.hydrated'), now.toISOString());
log(`✅ context nodes hydrated: ${state.nodeCount} nodes, ${edges.length} edges`);
