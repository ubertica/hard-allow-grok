#!/usr/bin/env node
/**
 * mcp-query-server.mjs — MCP Tool Server for Unified Query Engine
 *
 * Exposes the QueryOrchestrator as an MCP tool that can be registered with:
 *   - Claude (claude/.mcp/)
 *   - Grok (grok/.mcp/)
 *   - Kimi (kimi/.mcp/)
 *   - Fable (fable/.mcp/)
 *
 * This server:
 * 1. Initializes QueryOrchestrator on startup
 * 2. Provides `context_query` MCP tool with full parameter support
 * 3. Handles errors and streaming responses
 * 4. Maintains persistent connection for daemon mode
 *
 * USAGE:
 *   # Start daemon (runs indefinitely)
 *   node mcp-query-server.mjs --daemon
 *
 *   # Register with all LLM MCPs
 *   node mcp-query-server.mjs --register
 *
 *   # Test query
 *   node mcp-query-server.mjs --query "..." --tags "..."
 */

import { QueryOrchestrator } from './unified-context-query.mjs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';

const HOME = homedir();
const HA_DIR = join(HOME, '.grok', 'hard-allow');
const LOG_FILE = join(HA_DIR, 'mcp-query.log');

/**
 * Logging utility
 */
class Logger {
  constructor(filePath) {
    this.filePath = filePath;
  }

  log(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}`;
    console.error(line); // stderr for MCP protocol
    try {
      appendFileSync(this.filePath, line + '\n');
    } catch (e) {
      // Silently fail if can't write to log
    }
  }

  error(msg, err) {
    this.log(`ERROR: ${msg}: ${err?.message || err}`);
  }
}

const logger = new Logger(LOG_FILE);

/**
 * MCP Query Server
 *
 * Simple tool server using stdio transport.
 * When running as daemon, accepts JSON-RPC 2.0 calls over stdin/stdout.
 */
class MCPQueryServer {
  constructor() {
    this.orchestrator = null;
  }

  /**
   * Handle JSON-RPC 2.0 tool calls
   */
  handleRequest(request) {
    const { method, params, id } = request;

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'context_query',
              description:
                'Search and retrieve context nodes using unified query engine. Supports full-text search, tag filtering, capability filtering, and semantic activation.',
              inputSchema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Free-text search query',
                  },
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tag filters (OR logic)',
                  },
                  capabilities: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Capability filters (OR logic)',
                  },
                  type: {
                    type: 'string',
                    description: 'Node type filter (single type)',
                  },
                  caller_id: {
                    type: 'string',
                    description: 'Caller identifier for permission checks',
                  },
                  format: {
                    type: 'string',
                    enum: ['json', 'jsonl', 'csv', 'markdown'],
                    description: 'Output format',
                  },
                  k: {
                    type: 'number',
                    description: 'Top-k results to return (default: 10)',
                  },
                  semantic_activation: {
                    type: 'boolean',
                    description: 'Enable semantic spreading activation',
                  },
                },
                required: [],
              },
            },
          ],
        },
      };
    }

    if (method === 'tools/call' && params.name === 'context_query') {
      return this.handleContextQuery(params.arguments, id);
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found' },
    };
  }

  /**
   * Handle context_query tool requests
   */
  async handleContextQuery(args, id) {
    try {
      logger.log(`query: text="${args.query}" tags=${JSON.stringify(args.tags)} caller=${args.caller_id || 'unknown'}`);

      const response = await this.orchestrator.query({
        query: args.query || '',
        tags: args.tags || [],
        capabilities: args.capabilities || [],
        type: args.type,
        callerId: args.caller_id || 'mcp',
        format: args.format || 'json',
        k: args.k || 10,
        semanticActivation: args.semantic_activation || false,
      });

      return {
        jsonrpc: '2.0',
        id,
        result: response,
      };
    } catch (err) {
      logger.error('query handler failed', err);
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Query failed: ${err.message}`,
        },
      };
    }
  }

  /**
   * Read JSON-RPC requests from stdin and send responses to stdout
   */
  setupIOHandlers() {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', async (line) => {
      try {
        const request = JSON.parse(line);
        const response = await this.handleRequest(request);
        console.log(JSON.stringify(response));
      } catch (err) {
        logger.error('IO handler error', err);
        console.log(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error' },
          })
        );
      }
    });

    process.on('uncaughtException', (err) => {
      logger.error('uncaught exception', err);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('unhandled rejection', reason);
    });
  }

  /**
   * Initialize and run
   */
  async run(args = []) {
    try {
      // Initialize orchestrator
      logger.log('Initializing QueryOrchestrator...');
      this.orchestrator = new QueryOrchestrator();
      await this.orchestrator.initialize();
      logger.log('QueryOrchestrator ready');

      // Start MCP server
      if (args.includes('--daemon')) {
        logger.log('Starting MCP server in daemon mode');
        this.setupIOHandlers();
        logger.log('MCP server listening on stdin/stdout');
        // Keep running indefinitely
        await new Promise(() => {});
      } else if (args.includes('--query')) {
        // Test query mode
        const text = extractArg(args, '--query');
        const tags = extractArg(args, '--tags')?.split(',') || [];
        const result = await this.orchestrator.query({
          query: text,
          tags,
          callerId: 'cli',
          format: 'json',
        });
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (err) {
      logger.error('server initialization failed', err);
      process.exit(1);
    }
  }
}

function extractArg(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}


// Main entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const server = new MCPQueryServer();
  server.run(args).catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}

export { MCPQueryServer };
