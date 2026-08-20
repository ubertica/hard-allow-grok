#!/usr/bin/env node
/**
 * ingest-claude-scratchpad.mjs
 *
 * Reads Claude's shared scratchpad directories and converts every discovered
 * intelligence artifact into normalized context nodes + edges.
 *
 * Output: ~/.grok/hard-allow/semantic-maps/claude-scratchpad-ingestion.json
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, basename, relative, dirname, join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const HA = join(HOME, '.grok', 'hard-allow');
const CONFIG_FILE = join(HA, 'claude-scratchpad-paths.json');
const OUTPUT_DIR = join(HA, 'semantic-maps');
const OUTPUT_FILE = join(OUTPUT_DIR, 'claude-scratchpad-ingestion.json');

const SENSITIVE_KEYS = ['token', 'secret', 'key', 'apikey', 'oauth', 'password', 'sshkey', 'ssh_key', 'private_key'];
const SECRET_VALUE_RE = /((?:token|secret|key|apikey|oauth|password|sshkey)\s*[:=]\s*)["']?[a-zA-Z0-9_\-]{9,}["']?/gi;

const args = process.argv.slice(2);
const silent = args.includes('--silent');

function log(msg) {
  if (!silent) console.error(`[scratchpad-ingest] ${msg}`);
}

function isSensitiveKey(key) {
  const k = String(key).toLowerCase();
  return SENSITIVE_KEYS.some((s) => k.includes(s));
}

function redactString(str) {
  if (typeof str !== 'string') return str;
  // Redact known token shapes anywhere in text.
  str = str.replace(/\bha_[a-f0-9]{20,}\b/gi, '[REDACTED]');
  str = str.replace(/\bsk-[a-z0-9]{20,}\b/gi, '[REDACTED]');
  // Redact values that follow a sensitive keyword and separator on the same line.
  const sensitiveWords = ['token', 'secret', 'key', 'apikey', 'oauth', 'password', 'sshkey'];
  const separatorRe = `[\\s*:=\\x60*)]{1,30}`;
  const valueRe = new RegExp(
    `(?<=\\b(?:${sensitiveWords.join('|')})\\b${separatorRe})[a-z0-9_\\-]{9,}`,
    'gi'
  );
  str = str.replace(valueRe, '[REDACTED]');
  return str;
}

function deepRedact(obj) {
  if (typeof obj === 'string') return redactString(obj);
  if (Array.isArray(obj)) return obj.map(deepRedact);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (isSensitiveKey(k) && typeof v === 'string' && v.length > 8) {
        out[k] = v.slice(0, 6) + '***';
      } else {
        out[k] = deepRedact(v);
      }
    }
    return out;
  }
  return obj;
}

function sanitizeIdPart(str) {
  return String(str)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

function fileNodeId(scratchpadDir, filePath) {
  const sessionId = sanitizeIdPart(basename(dirname(scratchpadDir)));
  const rel = relative(scratchpadDir, filePath);
  const safeRel = sanitizeIdPart(rel);
  return `scratchpad.${sessionId}.${safeRel}`;
}

function titleFromMarkdown(text) {
  const m = text.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : '';
}

function summaryFromText(text, max = 500) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  try {
    const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      out.push(join(entry.parentPath ?? entry.path, entry.name));
    }
  } catch (e) {
    log(`warning: could not read ${dir}: ${e.message}`);
  }
  return out;
}

function normalizeNode(node, fallbackId = '') {
  if (!node || typeof node !== 'object') return null;
  const id = node.id || fallbackId;
  if (!id) return null;
  const normalized = { ...deepRedact(node), id };
  if (!normalized._label) normalized._label = normalized.name || normalized.title || id;
  if (!normalized._type) normalized._type = normalized.type || 'node';
  return normalized;
}

function extractFromJson(filePath) {
  const text = readFileSync(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    log(`warning: failed to parse JSON ${filePath}: ${e.message}`);
    return { nodes: [], edges: [] };
  }

  const nodes = [];
  let edges = [];

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const n = normalizeNode(item);
      if (n) nodes.push(n);
    }
  } else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.nodes)) {
      for (const n of parsed.nodes) {
        const normalized = normalizeNode(n);
        if (normalized) nodes.push(normalized);
      }
      if (Array.isArray(parsed.edges)) edges = parsed.edges;
    } else if (parsed.nodes && typeof parsed.nodes === 'object' && !Array.isArray(parsed.nodes)) {
      for (const [id, data] of Object.entries(parsed.nodes)) {
        const normalized = normalizeNode(data, id);
        if (normalized) nodes.push(normalized);
      }
    } else {
      // Treat each top-level object value that looks like a node as a node.
      for (const [key, value] of Object.entries(parsed)) {
        if (key === 'metadata' || key === 'ecosystem') continue;
        const normalized = normalizeNode(value, key);
        if (normalized) nodes.push(normalized);
      }
    }
  }

  return { nodes, edges };
}

function extractFromJsonl(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const nodes = [];
  const edges = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      continue;
    }
    if (parsed && typeof parsed === 'object') {
      if ('from' in parsed && 'to' in parsed) {
        edges.push(parsed);
      } else if ('id' in parsed || '_label' in parsed) {
        const n = normalizeNode(parsed, parsed.id);
        if (n) nodes.push(n);
      }
    }
  }
  return { nodes, edges };
}

function makeDocumentNode(scratchpadDir, filePath) {
  const rawText = readFileSync(filePath, 'utf8');
  const text = redactString(rawText);
  const id = fileNodeId(scratchpadDir, filePath);
  const name = basename(filePath);
  const title = titleFromMarkdown(text) || name;
  const stats = statSync(filePath);
  return {
    id,
    _label: title,
    _type: 'document',
    _timestamp: stats.mtime.toISOString(),
    path: filePath,
    size: stats.size,
    title,
    summary: summaryFromText(text, 800),
    content: text,
    extension: extname(filePath),
    source: 'claude-scratchpad',
  };
}

function makeScriptNode(scratchpadDir, filePath) {
  const text = redactString(readFileSync(filePath, 'utf8'));
  const id = fileNodeId(scratchpadDir, filePath);
  const name = basename(filePath);
  const ext = extname(filePath).toLowerCase();
  const type = ext === '.yml' || ext === '.yaml' || ext === '.json' ? 'config' : 'script';
  const stats = statSync(filePath);
  return {
    id,
    _label: name,
    _type: type,
    _timestamp: stats.mtime.toISOString(),
    path: filePath,
    size: stats.size,
    language: ext.replace(/^\./, ''),
    description: summaryFromText(text, 200),
    extension: ext,
    source: 'claude-scratchpad',
  };
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

function main() {
  log('loading configuration');
  let paths = [];
  if (existsSync(CONFIG_FILE)) {
    try {
      paths = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
      if (!Array.isArray(paths)) paths = [paths];
    } catch (e) {
      log(`warning: could not parse config, using defaults: ${e.message}`);
    }
  }
  paths = paths.filter((p) => typeof p === 'string');

  if (paths.length === 0) {
    log('error: no scratchpad paths configured');
    process.exit(1);
  }

  const nodesById = new Map();
  const edges = [];
  const edgeKeys = new Set();
  const sources = [];

  function addNode(n) {
    if (!n || !n.id) return;
    const existing = nodesById.get(n.id);
    if (existing) {
      nodesById.set(n.id, mergeNodeData(existing, n));
    } else {
      nodesById.set(n.id, n);
    }
  }

  function addEdge(e) {
    if (!e || !e.from || !e.to || !e.type) return;
    if (e.from === e.to) return;
    const key = edgeKey(e);
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from: e.from, to: e.to, type: e.type, label: e.label || '' });
  }

  for (const scratchpadDir of paths) {
    if (!existsSync(scratchpadDir)) {
      log(`warning: scratchpad path does not exist, skipping: ${scratchpadDir}`);
      sources.push({ path: scratchpadDir, fileCount: 0, nodeCount: 0, edgeCount: 0, skipped: true });
      continue;
    }

    const files = listFiles(scratchpadDir);
    let sourceNodes = 0;
    let sourceEdges = 0;

    for (const filePath of files) {
      const ext = extname(filePath).toLowerCase();
      try {
        if (ext === '.json') {
          const { nodes, edges: es } = extractFromJson(filePath);
          for (const n of nodes) addNode(n);
          for (const e of es) addEdge(e);
          sourceNodes += nodes.length;
          sourceEdges += es.length;
        } else if (ext === '.jsonl') {
          const { nodes, edges: es } = extractFromJsonl(filePath);
          for (const n of nodes) addNode(n);
          for (const e of es) addEdge(e);
          sourceNodes += nodes.length;
          sourceEdges += es.length;
        } else if (ext === '.md' || ext === '.txt') {
          const n = makeDocumentNode(scratchpadDir, filePath);
          addNode(n);
          sourceNodes += 1;
        } else if (['.mjs', '.sh', '.yml', '.yaml', '.py'].includes(ext)) {
          const n = makeScriptNode(scratchpadDir, filePath);
          addNode(n);
          sourceNodes += 1;
        }
      } catch (e) {
        log(`warning: failed to ingest ${filePath}: ${e.message}`);
      }
    }

    sources.push({ path: scratchpadDir, fileCount: files.length, nodeCount: sourceNodes, edgeCount: sourceEdges });
    log(`scanned ${files.length} files from ${scratchpadDir} (${sourceNodes} nodes, ${sourceEdges} edges)`);
  }

  // Link documents and scripts to known nodes by content/filename.
  const knownIds = [...nodesById.keys()];
  for (const node of nodesById.values()) {
    if (node._type !== 'document' && node._type !== 'script' && node._type !== 'config') continue;
    const haystack = `${node.path || ''} ${node.title || ''} ${node.summary || ''} ${node.description || ''}`.toLowerCase();
    for (const targetId of knownIds) {
      if (targetId === node.id) continue;
      if (haystack.includes(targetId.toLowerCase())) {
        addEdge({ from: node.id, to: targetId, type: 'references', label: `${node._label || node.id} references ${targetId}` });
      }
    }
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const output = {
    timestamp: new Date().toISOString(),
    nodes: [...nodesById.values()],
    edges,
    sources,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  log(`wrote ${output.nodes.length} nodes and ${output.edges.length} edges to ${OUTPUT_FILE}`);
}

main();
