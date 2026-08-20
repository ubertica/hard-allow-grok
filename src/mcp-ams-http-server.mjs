#!/usr/bin/env node
// HTTP wrapper for AMS Context-Nodes MCP Tool
// Run on AMS: node mcp-ams-http-server.mjs &
// Usage: curl http://51.15.18.106:9999/query?token=...&tenant=...&node=...

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import url from 'url';

const HOME = process.env.HOME || '/root';
const CONTEXT_NODES_PATH = path.join(HOME, '.grok/context-nodes/state.json');
const PORT = 9999;
const LOG_FILE = '/var/log/ams-http-server.log';

// Logging
function log(msg) {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${msg}`;
  console.error(logMsg);
  try {
    fs.appendFileSync(LOG_FILE, logMsg + '\n');
  } catch {}
}

// Load context-nodes
function loadContextNodes() {
  try {
    if (!fs.existsSync(CONTEXT_NODES_PATH)) {
      throw new Error(`Not found: ${CONTEXT_NODES_PATH}`);
    }
    return JSON.parse(fs.readFileSync(CONTEXT_NODES_PATH, 'utf-8'));
  } catch (err) {
    log(`[ERROR] Failed to load context-nodes: ${err.message}`);
    return null;
  }
}

// Invoke MCP tool
function invokeMCPTool(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn('node', [
      path.join(HOME, '.grok/hard-allow/mcp-ams-context-query.mjs'),
      cmd,
      ...args
    ]);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => { stdout += data.toString(); });
    child.stderr.on('data', data => { stderr += data.toString(); });

    child.on('close', code => {
      try {
        const result = JSON.parse(stdout);
        resolve({ success: code === 0, result, stderr });
      } catch (e) {
        resolve({ success: false, error: 'Invalid JSON', stderr: stdout + stderr });
      }
    });

    // Timeout after 5s
    setTimeout(() => {
      child.kill();
      resolve({ success: false, error: 'Timeout' });
    }, 5000);
  });
}

// HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  log(`[${req.method}] ${pathname} from ${req.socket.remoteAddress}`);

  try {
    if (pathname === '/query') {
      const { token, tenant, node } = query;

      if (!token || !tenant || !node) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing params: token, tenant, node' }));
        return;
      }

      const result = await invokeMCPTool('query', [token, tenant, node]);

      res.writeHead(result.success ? 200 : 403);
      res.end(JSON.stringify(result.result || { error: result.error }));

    } else if (pathname === '/health') {
      const result = await invokeMCPTool('health', []);

      res.writeHead(200);
      res.end(JSON.stringify(result.result || { status: 'error' }));

    } else if (pathname === '/validate-token') {
      const { token } = query;

      if (!token) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing param: token' }));
        return;
      }

      const result = await invokeMCPTool('validate-token', [token]);

      res.writeHead(result.success ? 200 : 403);
      res.end(JSON.stringify(result.result || { error: result.error }));

    } else if (pathname === '/list-tenants') {
      const result = await invokeMCPTool('list-tenants', []);

      res.writeHead(200);
      res.end(JSON.stringify(result.result || { error: result.error }));

    } else {
      res.writeHead(404);
      res.end(JSON.stringify({
        error: 'Not found',
        endpoints: [
          '/query?token=X&tenant=Y&node=Z',
          '/health',
          '/validate-token?token=X',
          '/list-tenants'
        ]
      }));
    }
  } catch (err) {
    log(`[ERROR] ${err.message}`);
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  log(`🚀 AMS Context-Nodes HTTP Server started on port ${PORT}`);
  log(`   Endpoints: /query /health /validate-token /list-tenants`);
});

server.on('error', err => {
  log(`[FATAL] ${err.message}`);
  process.exit(1);
});
