#!/usr/bin/env node
/**
 * Query Engine Integration: HA Permission Filter Integration Points
 *
 * Integrates HAPermissionFilter into:
 * 1. MCP Tool Wrapper (validates HA before serving queries)
 * 2. HTTP API Middleware (validates API key + HA token)
 * 3. QueryEngine Result Filter (applies permission matrix)
 */

import HAPermissionFilter from './ha-permission-filter.mjs';

/**
 * MCP Tool: query (with HA validation)
 * Usage: mcp tool `query` with context_gate verification
 */
class MCPQueryTool {
  constructor(queryEngine) {
    this.queryEngine = queryEngine;
    this.filter = new HAPermissionFilter();
  }

  /**
   * Execute query with HA permission check
   * params: { queryId, nodeFilter?, tags?, requiresHA? }
   */
  async execute(params = {}) {
    // Validate HA token first
    const { valid: tokenValid, isArmed } = this.filter.validateHAToken();
    const { caller } = this.filter.determineCaller();

    // Track request
    const startMs = Date.now();

    // Get raw query results
    let results = null;
    try {
      results = await this.queryEngine.query(params);
    } catch (err) {
      return {
        error: 'query_failed',
        message: err.message,
        statusCode: 500,
      };
    }

    // Filter by permission
    const filtered = await this.filter.filterQueryResults(results, {
      model: params.model,
    });

    // Build response
    const elapsedMs = Date.now() - startMs;

    return {
      success: true,
      queryId: params.queryId,
      nodeCount: Array.isArray(filtered)
        ? filtered.length
        : filtered.nodes?.length || 0,
      caller,
      hasHA: tokenValid && isArmed,
      executionTimeMs: elapsedMs,
      results: filtered,
      ...(filtered.metadata || {}),
    };
  }
}

/**
 * HTTP API Middleware for query endpoints
 * Validates API key + HA token + applies filters
 */
class QueryAPIMiddleware {
  constructor(apiKeys = {}) {
    this.apiKeys = apiKeys; // { 'key1': 'claude', 'key2': 'grok' }
    this.filter = new HAPermissionFilter();
  }

  /**
   * Middleware: validate request and apply permission filter
   */
  async validateRequest(req) {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization'];

    // Validate API key
    if (!apiKey || !this.apiKeys[apiKey]) {
      return {
        authorized: false,
        statusCode: 401,
        error: 'invalid_api_key',
      };
    }

    // Get caller from API key
    const caller = this.apiKeys[apiKey];

    // Validate HA token if required
    const { valid: tokenValid, isArmed } = this.filter.validateHAToken();
    const allowedTags = this.filter.getAllowedTags(caller, tokenValid && isArmed);

    // Check expiry warning
    const { expiring, timeRemaining } = this.filter.checkHAExpiry();

    return {
      authorized: true,
      statusCode: 200,
      caller,
      hasHA: tokenValid && isArmed,
      allowedTags,
      warnings: expiring
        ? [
            {
              type: 'token_expiring',
              message: `HA token expiring in ${Math.floor(timeRemaining / 1000)}s`,
              timeRemaining,
            },
          ]
        : [],
    };
  }

  /**
   * Wrap query execution with request validation
   */
  async executeQuery(req, queryFn) {
    // Validate request
    const validation = await this.validateRequest(req);

    if (!validation.authorized) {
      return {
        error: validation.error,
        statusCode: validation.statusCode,
      };
    }

    // Execute query
    const results = await queryFn();

    // Filter results
    const filtered = await this.filter.filterQueryResults(results, {
      model: validation.caller,
    });

    return {
      success: true,
      caller: validation.caller,
      hasHA: validation.hasHA,
      warnings: validation.warnings,
      results: filtered,
    };
  }
}

/**
 * QueryEngine Wrapper: auto-filters all results
 */
class PermissionAwareQueryEngine {
  constructor(baseQueryEngine) {
    this.baseEngine = baseQueryEngine;
    this.filter = new HAPermissionFilter();
  }

  /**
   * Query with automatic permission filtering
   */
  async query(params = {}) {
    // Execute base query
    const rawResults = await this.baseEngine.query(params);

    // Auto-filter based on caller
    const { caller } = this.filter.determineCaller(params);
    const { valid: tokenValid, isArmed } = this.filter.validateHAToken();

    const filtered = await this.filter.filterQueryResults(rawResults, {
      model: caller,
    });

    // Attach metadata
    return {
      ...filtered,
      _meta: {
        filtered: true,
        caller,
        haArmed: tokenValid && isArmed,
        ...(filtered.metadata || {}),
      },
    };
  }

  /**
   * Query with explicit context gates
   */
  async queryWithGates(params = {}, requiredGates = []) {
    const { caller } = this.filter.determineCaller(params);
    const { valid: tokenValid, isArmed } = this.filter.validateHAToken();
    const allowedTags = this.filter.getAllowedTags(caller, tokenValid && isArmed);

    // Check if caller has required gates
    const hasMissingGates = requiredGates.some((gate) => !allowedTags.includes(gate));

    if (hasMissingGates) {
      return {
        error: 'insufficient_permissions',
        required: requiredGates,
        allowed: allowedTags,
        statusCode: 403,
      };
    }

    // Execute filtered query
    return this.query(params);
  }
}

/**
 * Express.js Middleware Factory
 * Usage: app.use(createQueryAuthMiddleware(apiKeys))
 */
export function createQueryAuthMiddleware(apiKeys = {}) {
  const middleware = new QueryAPIMiddleware(apiKeys);

  return async (req, res, next) => {
    const validation = await middleware.validateRequest(req);

    // Attach to request
    req.haContext = {
      caller: validation.caller,
      hasHA: validation.hasHA,
      allowedTags: validation.allowedTags,
      warnings: validation.warnings,
    };

    // Check authorization
    if (!validation.authorized) {
      return res.status(validation.statusCode).json({
        error: validation.error,
      });
    }

    // Attach filter to request
    req.permissionFilter = middleware.filter;

    next();
  };
}

/**
 * Query Route Handler Factory
 * Usage: app.get('/api/query/:id', createQueryHandler(queryEngine, apiKeys))
 */
export function createQueryHandler(queryEngine, apiKeys = {}) {
  const middleware = new QueryAPIMiddleware(apiKeys);
  const engine = new PermissionAwareQueryEngine(queryEngine);

  return async (req, res) => {
    try {
      const result = await middleware.executeQuery(req, () =>
        engine.query({ queryId: req.params.id, ...req.query })
      );

      if (result.error) {
        return res.status(result.statusCode || 403).json(result);
      }

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'query_failed', message: err.message });
    }
  };
}

/**
 * WebSocket Handler for Streaming Queries
 */
export class QueryStreamHandler {
  constructor(queryEngine, apiKeys = {}) {
    this.queryEngine = queryEngine;
    this.middleware = new QueryAPIMiddleware(apiKeys);
    this.filter = new HAPermissionFilter();
  }

  /**
   * Handle WebSocket query stream
   */
  async handleStream(ws, req) {
    // Validate connection
    const validation = await this.middleware.validateRequest(req);

    if (!validation.authorized) {
      ws.close(
        1008,
        JSON.stringify({
          error: validation.error,
        })
      );
      return;
    }

    // Send auth response
    ws.send(
      JSON.stringify({
        type: 'auth',
        caller: validation.caller,
        hasHA: validation.hasHA,
      })
    );

    // Listen for query requests
    ws.on('message', async (msg) => {
      try {
        const params = JSON.parse(msg);

        // Check gates if specified
        if (params.requiredGates && Array.isArray(params.requiredGates)) {
          const allowedTags = this.filter.getAllowedTags(
            validation.caller,
            validation.hasHA
          );
          const missingGates = params.requiredGates.filter(
            (g) => !allowedTags.includes(g)
          );

          if (missingGates.length > 0) {
            ws.send(
              JSON.stringify({
                type: 'error',
                error: 'insufficient_permissions',
                missing: missingGates,
              })
            );
            return;
          }
        }

        // Execute query
        const results = await this.queryEngine.query(params);
        const filtered = await this.filter.filterQueryResults(results, {
          model: validation.caller,
        });

        // Stream results
        ws.send(
          JSON.stringify({
            type: 'results',
            queryId: params.queryId,
            ...filtered,
          })
        );
      } catch (err) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: err.message,
          })
        );
      }
    });
  }
}

export {
  MCPQueryTool,
  QueryAPIMiddleware,
  PermissionAwareQueryEngine,
};
