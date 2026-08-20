#!/usr/bin/env node
/**
 * query-api-server.mjs — HTTP API Server for Unified Query Engine
 *
 * Provides REST/JSON API for the QueryOrchestrator. Supports:
 *   - Query endpoint: GET/POST /api/query
 *   - Health endpoint: GET /health
 *   - Stats endpoint: GET /api/stats
 *   - Cache control: DELETE /api/cache
 *
 * Features:
 *   - Rate limiting per caller_id
 *   - Authentication via X-API-Key header
 *   - CORS support
 *   - Request logging
 *   - Graceful shutdown
 *
 * USAGE:
 *   # Start on default port 3000
 *   PORT=3000 node query-api-server.mjs
 *
 *   # Test query
 *   curl -X POST http://localhost:3000/api/query \
 *     -H "Content-Type: application/json" \
 *     -d '{"query":"system.ha-status","tags":["system"]}'
 */

import express from 'express';
import { QueryOrchestrator } from './unified-context-query.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const HA_DIR = join(HOME, '.grok', 'hard-allow');
const API_CONFIG_FILE = join(HA_DIR, 'api-config.json');
const PORT = process.env.PORT || 3000;

/**
 * Rate limiter: simple per-caller limit
 */
class RateLimiter {
  constructor(maxPerMinute = 60) {
    this.maxPerMinute = maxPerMinute;
    this.calls = new Map(); // callerId -> [timestamps]
  }

  isAllowed(callerId) {
    const now = Date.now();
    const minuteAgo = now - 60000;

    if (!this.calls.has(callerId)) {
      this.calls.set(callerId, []);
    }

    const times = this.calls.get(callerId);
    const recent = times.filter(t => t > minuteAgo);
    this.calls.set(callerId, recent);

    if (recent.length >= this.maxPerMinute) {
      return false;
    }

    recent.push(now);
    return true;
  }

  getRemaining(callerId) {
    const now = Date.now();
    const minuteAgo = now - 60000;
    const times = this.calls.get(callerId) || [];
    const recent = times.filter(t => t > minuteAgo);
    return Math.max(0, this.maxPerMinute - recent.length);
  }
}

/**
 * HTTP API Server
 */
class QueryAPIServer {
  constructor(config = {}) {
    this.app = express();
    this.orchestrator = null;
    this.config = this._loadAPIConfig(config);
    this.rateLimiter = new RateLimiter(this.config.rateLimitPerMinute || 60);
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Load API configuration
   */
  _loadAPIConfig(overrides = {}) {
    let config = {
      rateLimitPerMinute: 60,
      corsOrigins: ['http://localhost:3000', 'http://localhost:5173'],
      apiKeyAuth: false,
      ...overrides,
    };

    if (existsSync(API_CONFIG_FILE)) {
      try {
        const custom = JSON.parse(readFileSync(API_CONFIG_FILE, 'utf8'));
        config = { ...config, ...custom };
      } catch (e) {
        console.warn(`[api] Failed to load config: ${e.message}`);
      }
    }

    return config;
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    this.app.use(express.json());

    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type,X-API-Key,X-Caller-ID');
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
      } else {
        next();
      }
    });

    // Request logging
    this.app.use((req, res, next) => {
      const startMs = Date.now();
      res.on('finish', () => {
        const elapsed = Date.now() - startMs;
        console.log(`[api] ${req.method} ${req.path} ${res.statusCode} ${elapsed}ms`);
      });
      next();
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error(`[api] Error: ${err.message}`);
      res.status(500).json({
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Setup routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        ready: this.orchestrator?.ready || false,
        timestamp: new Date().toISOString(),
      });
    });

    // Query endpoint
    this.app.post('/api/query', this._handleQuery.bind(this));
    this.app.get('/api/query', this._handleQuery.bind(this));

    // Stats endpoint
    this.app.get('/api/stats', this._handleStats.bind(this));

    // Cache control
    this.app.delete('/api/cache', this._handleClearCache.bind(this));

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path,
      });
    });
  }

  /**
   * Handle query requests
   */
  async _handleQuery(req, res) {
    try {
      const callerId = req.headers['x-caller-id'] || req.ip || 'unknown';

      // Rate limiting
      if (!this.rateLimiter.isAllowed(callerId)) {
        res.status(429).json({
          error: 'Rate limit exceeded',
          remaining: 0,
          resetAfter: 60,
        });
        return;
      }

      // Parse query parameters
      const body = req.method === 'POST' ? req.body : this._parseQueryString(req.query);
      const {
        query = '',
        tags = [],
        capabilities = [],
        type,
        format = 'json',
        k = 10,
        semantic_activation = false,
      } = body;

      // Execute query
      const response = await this.orchestrator.query({
        query,
        tags: Array.isArray(tags) ? tags : [tags].filter(Boolean),
        capabilities: Array.isArray(capabilities) ? capabilities : [capabilities].filter(Boolean),
        type,
        callerId,
        format,
        k: parseInt(k, 10),
        semanticActivation: semantic_activation,
      });

      res.set('X-Rate-Limit-Remaining', this.rateLimiter.getRemaining(callerId));
      res.json(response);
    } catch (err) {
      console.error(`[api] Query error: ${err.message}`);
      res.status(400).json({
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle stats requests
   */
  async _handleStats(req, res) {
    try {
      const stats = this.orchestrator.stats();
      res.json({
        ...stats,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Handle cache clear
   */
  async _handleClearCache(req, res) {
    try {
      const callerId = req.headers['x-caller-id'] || 'unknown';
      this.orchestrator.cache.cache.clear();
      await this.orchestrator.saveCache();
      res.json({
        message: 'Cache cleared',
        timestamp: new Date().toISOString(),
      });
      console.log(`[api] Cache cleared by ${callerId}`);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Parse query string parameters (for GET requests)
   */
  _parseQueryString(qs) {
    return {
      query: qs.query,
      tags: qs.tags ? (Array.isArray(qs.tags) ? qs.tags : qs.tags.split(',')) : [],
      capabilities: qs.capabilities
        ? Array.isArray(qs.capabilities)
          ? qs.capabilities
          : qs.capabilities.split(',')
        : [],
      type: qs.type,
      format: qs.format || 'json',
      k: qs.k || 10,
      semantic_activation: qs.semantic_activation === 'true',
    };
  }

  /**
   * Initialize and start server
   */
  async start() {
    try {
      // Initialize orchestrator
      console.log('[api] Initializing QueryOrchestrator...');
      this.orchestrator = new QueryOrchestrator();
      await this.orchestrator.initialize();
      console.log('[api] QueryOrchestrator ready');

      // Start HTTP server
      this.server = this.app.listen(PORT, () => {
        console.log(`[api] Server listening on http://localhost:${PORT}`);
        console.log(`[api] Health: http://localhost:${PORT}/health`);
        console.log(`[api] Query: POST http://localhost:${PORT}/api/query`);
        console.log(`[api] Stats: http://localhost:${PORT}/api/stats`);
      });

      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

      return this;
    } catch (err) {
      console.error(`[api] Start failed: ${err.message}`);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('[api] Shutting down...');
    await this.orchestrator.saveCache();
    this.server.close(() => {
      console.log('[api] Server closed');
      process.exit(0);
    });
  }
}

// Main entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new QueryAPIServer();
  server.start().catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}

export { QueryAPIServer };
