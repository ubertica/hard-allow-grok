#!/usr/bin/env node
/**
 * Local dev server for HA Context Visualizer.
 * Serves static files + proxies ~/.grok/context-nodes/{state.json,graph.jsonl}
 * + runs create-context-nodes.mjs on demand.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

const PORT = process.env.PORT || 8000;
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CONTEXT_DIR = path.join(homedir(), '.grok', 'context-nodes');
const CREATE_NODES_SCRIPT = path.join(homedir(), '.grok', 'hard-allow', 'create-context-nodes.mjs');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.jsonl': 'application/jsonlines',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, status, data, type = 'application/json') {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(data);
}

function streamFile(res, file, type) {
  if (!fs.existsSync(file)) return send(res, 404, JSON.stringify({ error: 'not found' }));
  res.writeHead(200, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  fs.createReadStream(file).pipe(res);
}

function runHydrate() {
  return new Promise((resolve) => {
    if (!fs.existsSync(CREATE_NODES_SCRIPT)) {
      resolve({ ok: false, error: 'create-context-nodes.mjs not found' });
      return;
    }
    const child = spawn(process.execPath, [CREATE_NODES_SCRIPT, '--force', '--silent'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      resolve({ ok: code === 0, code, out, err });
    });
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

async function getClaudeToken() {
  try {
    const credsPath = path.join(homedir(), '.claude', '.credentials.json');
    if (!fs.existsSync(credsPath)) return null;
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return creds.claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

async function interpretWithClaude(query, context) {
  const token = await getClaudeToken();
  if (!token) return { error: 'Claude token not available' };

  const prompt = `You are an expert interpreter for a HARD ALLOW context node graph. Answer the user's question using ONLY the provided context nodes. Be concise.\n\nContext nodes:\n${context}\n\nUser question: ${query}\n\nAnswer:`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': token,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: `Claude API error ${res.status}: ${text}` };
  }

  const data = await res.json();
  return { answer: data.content?.[0]?.text || 'No response' };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Proxy context nodes
  if (pathname === '/proxy/state.json') {
    const file = path.join(CONTEXT_DIR, 'state.json');
    if (!fs.existsSync(file)) return send(res, 404, JSON.stringify({ error: 'state.json not found. Run create-context-nodes.mjs first.' }));
    return streamFile(res, file, 'application/json');
  }

  if (pathname === '/proxy/graph.jsonl') {
    const file = path.join(CONTEXT_DIR, 'graph.jsonl');
    if (!fs.existsSync(file)) return send(res, 404, JSON.stringify({ error: 'graph.jsonl not found.' }));
    return streamFile(res, file, 'application/jsonlines');
  }

  if (pathname === '/proxy/hydrate' && req.method === 'POST') {
    const result = await runHydrate();
    return send(res, result.ok ? 200 : 500, JSON.stringify(result));
  }

  if (pathname === '/proxy/search-index.json') {
    const file = path.join(CONTEXT_DIR, 'search-index.json');
    if (!fs.existsSync(file)) return send(res, 404, JSON.stringify({ error: 'search-index.json not found.' }));
    return streamFile(res, file, 'application/json');
  }

  if (pathname === '/api/interpret' && req.method === 'POST') {
    const body = await readBody(req);
    const { query, context } = body;
    if (!query) return send(res, 400, JSON.stringify({ error: 'query required' }));
    const result = await interpretWithClaude(query, context || '');
    return send(res, result.error ? 500 : 200, JSON.stringify(result));
  }

  // Context node pull endpoints (for multi-LLM access)
  if (pathname === '/context/all' && req.method === 'GET') {
    const file = path.join(CONTEXT_DIR, 'state.json');
    if (!fs.existsSync(file)) return send(res, 404, JSON.stringify({ error: 'state.json not found' }));
    const stateData = JSON.parse(fs.readFileSync(file, 'utf8'));
    const graphFile = path.join(CONTEXT_DIR, 'graph.jsonl');
    const edges = fs.existsSync(graphFile)
      ? fs.readFileSync(graphFile, 'utf8').split('\n').filter(l => l).map(l => JSON.parse(l))
      : [];
    return send(res, 200, JSON.stringify({ ...stateData, edges }, null, 2));
  }

  if (pathname === '/context/query' && req.method === 'POST') {
    const body = await readBody(req);
    const { query, format = 'json', includeSubnodes = true, forAgent = 'claude' } = body;

    try {
      const stateFile = path.join(CONTEXT_DIR, 'state.json');
      if (!fs.existsSync(stateFile)) {
        return send(res, 404, JSON.stringify({ error: 'context not initialized' }));
      }

      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      let nodes = state.nodes || {};

      // Filter by query if provided
      if (query) {
        const filtered = {};
        const lowerQuery = query.toLowerCase();
        for (const [id, node] of Object.entries(nodes)) {
          if (
            id.toLowerCase().includes(lowerQuery) ||
            node._label?.toLowerCase().includes(lowerQuery) ||
            JSON.stringify(node).toLowerCase().includes(lowerQuery)
          ) {
            filtered[id] = node;
          }
        }
        nodes = filtered;
      }

      // Remove subnodes if not requested
      if (!includeSubnodes) {
        const filtered = {};
        for (const [id, node] of Object.entries(nodes)) {
          if (node._type !== 'subnode') {
            filtered[id] = node;
          }
        }
        nodes = filtered;
      }

      // Redact secrets
      const redactObj = (obj) => {
        const secretPatterns = ['token', 'secret', 'password', 'key', 'apikey', 'oauth'];
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'string' && secretPatterns.some(p => k.toLowerCase().includes(p))) {
            obj[k] = '***REDACTED***';
          } else if (typeof v === 'object' && v !== null) {
            redactObj(v);
          }
        }
      };

      for (const node of Object.values(nodes)) {
        redactObj(node);
      }

      // Format output
      let output;
      switch (format) {
        case 'jsonl':
          output = Object.entries(nodes)
            .map(([id, node]) => JSON.stringify({ id, ...node }))
            .join('\n');
          break;
        case 'markdown':
          output = '# HARD ALLOW Context Nodes\n\n';
          for (const [id, node] of Object.entries(nodes)) {
            output += `## ${node._label || id}\n`;
            output += `**ID:** \`${id}\`\n\n`;
            output += '```json\n' + JSON.stringify(node, null, 2) + '\n```\n\n';
          }
          break;
        case 'prompt':
          output = `# HARD ALLOW Context (${forAgent})\n\nYou have access to ${Object.keys(nodes).length} context nodes.\n\n`;
          for (const [id, node] of Object.entries(nodes)) {
            output += `- **${node._label || id}**\n`;
          }
          break;
        default:
          output = JSON.stringify({ nodes, nodeCount: Object.keys(nodes).length }, null, 2);
      }

      return send(res, 200, output, format === 'markdown' ? 'text/markdown' : 'application/json');
    } catch (err) {
      return send(res, 500, JSON.stringify({ error: err.message }));
    }
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(ROOT, filePath);

  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(res, 404, 'Not found', 'text/plain');

  const ext = path.extname(filePath).toLowerCase();
  streamFile(res, filePath, MIME[ext] || 'application/octet-stream');
});

server.listen(PORT, () => {
  console.log(`[HA Visualizer] server running at http://localhost:${PORT}`);
  console.log(`[HA Visualizer] context nodes path: ${CONTEXT_DIR}`);
});
