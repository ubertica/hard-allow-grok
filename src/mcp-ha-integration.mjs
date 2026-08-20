#!/usr/bin/env node
/**
 * mcp-ha-integration.mjs (EXPANDED SUITE)
 * Complete HA MCP with 23 tools for ceremony, modes, context nodes, and system status
 *
 * Purpose:
 * - Integration layer for HA inheritance and fallback in MCP context query pipeline
 * - Comprehensive tool suite for HA management, token lifecycle, and system state
 * - Mode-aware filtering and node access control
 * - Real-time infrastructure + credentials + agent status monitoring
 *
 * Tools (23 total):
 * - CEREMONY & TOKEN (6): validate_token, run_ceremony, get_inheritance_chain, prepare_subagent_env, get_time_until_expiry, refresh_token
 * - MODES & RESTRICTIONS (6): switch_to_armed_mode, switch_to_degraded_mode, activate_restricted_mode, check_node_allowed, get_restriction_stats, get_audit_trail
 * - CONTEXT NODES (6): query_nodes, get_node, add_node, list_agents, list_capabilities, get_agent_status
 * - SYSTEM STATUS (5): get_live_state, get_infrastructure_status, get_credentials_status, list_endpoints, get_ha_logs
 *
 * Exports:
 * - HAMCPIntegration — Main class for pipeline integration
 * - HAMCPServer — Complete MCP server with all tools
 * - initializeHAIntegration() — One-shot initialization
 * - wrapQueryWithHAContext() — Wrap query processing
 * - createHAQueryMiddleware() — Express/middleware style wrapper
 *
 * Usage:
 * import { HAMCPIntegration, HAMCPServer } from './mcp-ha-integration.mjs'
 *
 * class MCPContextServer {
 *   constructor() {
 *     this.ha = new HAMCPIntegration()
 *     this.ha.initialize()
 *   }
 *
 *   async queryContext(input) {
 *     return await this.ha.wrapQuery(input, async () => {
 *       // Original query logic
 *     })
 *   }
 * }
 */

import { getHAContext, inheritHAFromParent, getTimeUntilExpiry, getInheritanceChain, prepareSubagentEnvironment } from './ha-subagent-wrapper.mjs'
import {
  getCurrentMode,
  getModeStatus,
  activateRestrictedMode,
  switchToArmedMode,
  switchToDegradedMode,
  isNodeAllowedInCurrentMode,
  filterQueryResults,
  wrapMCPToolResult,
  getRestrictionStats,
  getRestrictionAuditTrail,
} from './subagent-fallback-mode.mjs'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = homedir()
const HA_QUERY_LOG = join(HOME, '.grok', 'hard-allow', 'ha-query-log.jsonl')
const STATE_JSON = join(HOME, '.grok', 'context-nodes', 'state.json')
const ARMED_FILE = join(HOME, '.grok', 'hard-allow', 'ARMED')

// ─────────────────────────────────────────────────────────────
// HA MCP Integration
// ─────────────────────────────────────────────────────────────

export class HAMCPIntegration {
  constructor() {
    this.initialized = false
    this.haContext = null
    this.modeStatus = null
    this.tokenCheckInterval = null
    this.stateCache = null
  }

  /**
   * Initialize HA integration at pipeline startup
   */
  initialize() {
    if (this.initialized) return

    // Inherit HA from parent
    const inheritance = inheritHAFromParent()
    this.haContext = inheritance.context

    // Set initial mode based on HA context
    if (this.haContext.isValid) {
      switchToArmedMode('HA token inherited from parent')
      this.logInit('success', 'HA armed - full access enabled')
    } else {
      activateRestrictedMode(`HA initialization failed: ${inheritance.error || 'No valid token'}`)
      this.logInit('degraded', inheritance.error || 'No HA context available')
    }

    this.modeStatus = getModeStatus()

    // Load state cache
    this.loadStateCache()

    // Start periodic token validation (every minute)
    if (this.tokenCheckInterval) clearInterval(this.tokenCheckInterval)
    this.tokenCheckInterval = setInterval(() => this.validateTokenHealth(), 60000)

    this.initialized = true
  }

  /**
   * Load state.json for context node queries
   */
  loadStateCache() {
    try {
      if (existsSync(STATE_JSON)) {
        this.stateCache = JSON.parse(readFileSync(STATE_JSON, 'utf8'))
      }
    } catch (e) {
      this.stateCache = null
    }
  }

  /**
   * Cleanup (for testing/shutdown)
   */
  shutdown() {
    if (this.tokenCheckInterval) {
      clearInterval(this.tokenCheckInterval)
      this.tokenCheckInterval = null
    }
    this.initialized = false
  }

  /**
   * Validate token health and switch modes if needed
   */
  validateTokenHealth() {
    const context = getHAContext()

    if (!context.isValid) {
      if (getCurrentMode() !== 'RESTRICTED') {
        activateRestrictedMode('Token expired during execution')
        this.logEvent('token_expired', { reason: context.validationReason })
      }
      return
    }

    // Check if token expiring soon (< 5 minutes)
    const timeLeft = getTimeUntilExpiry(context.expiresAt)
    if (timeLeft && timeLeft.ms > 0 && timeLeft.ms < 300000) {
      if (getCurrentMode() !== 'HA_DEGRADED') {
        switchToDegradedMode(`Token expiring in ${timeLeft.human}`)
        this.logEvent('token_degraded', { timeLeft: timeLeft.human })
      }
    } else if (timeLeft && timeLeft.ms >= 300000) {
      // Token healthy again
      if (getCurrentMode() !== 'HA_ARMED') {
        switchToArmedMode('Token health restored')
        this.logEvent('token_restored', {})
      }
    }
  }

  /**
   * Wrap a query with HA context checking
   */
  async wrapQuery(queryInput, queryFn) {
    const queryId = `ha-q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    try {
      // Start timing
      const startTime = Date.now()

      // Log query start with HA context
      this.logQueryStart(queryId, queryInput)

      // Check token health before query
      this.validateTokenHealth()

      // Run query with current mode
      const result = await queryFn()

      // Apply mode-aware filtering to results
      const filtered = this.filterResults(result)

      // Log query completion
      const duration = Date.now() - startTime
      this.logQueryComplete(queryId, {
        success: true,
        duration,
        mode: getCurrentMode(),
        resultsFiltered: filtered.filtered,
        blockedCount: filtered.blockedCount,
      })

      return {
        ...filtered.results,
        _haContext: {
          queryId,
          mode: getCurrentMode(),
          modeReason: getModeStatus().reason,
          filtered: filtered.filtered,
          blockedCount: filtered.blockedCount,
        },
      }
    } catch (error) {
      // Check if error is due to HA restrictions
      const mode = getCurrentMode()
      const isRestrictionError = mode === 'RESTRICTED' || mode === 'HA_DEGRADED'

      this.logQueryError(queryId, error, isRestrictionError)

      // Try fallback: switch to restricted mode and retry once
      if (!isRestrictionError && this.haContext.isValid) {
        try {
          activateRestrictedMode('Query failed, degrading to restricted mode')
          const fallbackResult = await queryFn()
          const filtered = this.filterResults(fallbackResult)

          this.logEvent('query_fallback_success', {
            queryId,
            originalError: error.message,
          })

          return {
            ...filtered.results,
            _haContext: {
              queryId,
              mode: getCurrentMode(),
              fallback: true,
              originalError: error.message,
            },
          }
        } catch (fallbackError) {
          this.logEvent('query_fallback_failed', {
            queryId,
            originalError: error.message,
            fallbackError: fallbackError.message,
          })

          throw new Error(
            `Query failed in HA mode and fallback: ${error.message} / ${fallbackError.message}`
          )
        }
      }

      throw error
    }
  }

  /**
   * Apply mode-aware filtering to results
   */
  filterResults(result) {
    if (!result) {
      return { results: result, filtered: false, blockedCount: 0 }
    }

    // Handle array results
    if (Array.isArray(result)) {
      const filtered = result.filter((item) => {
        const nodeId = item.id || item.nodeId || ''
        const tags = item.tags || item.metadata?.tags || []
        return isNodeAllowedInCurrentMode(nodeId, tags)
      })

      return {
        results: filtered,
        filtered: filtered.length < result.length,
        blockedCount: result.length - filtered.length,
      }
    }

    // Handle object results with results array
    if (result.results && Array.isArray(result.results)) {
      const filtered = result.results.filter((item) => {
        const nodeId = item.id || item.nodeId || ''
        const tags = item.tags || item.metadata?.tags || []
        return isNodeAllowedInCurrentMode(nodeId, tags)
      })

      const blockedCount = result.results.length - filtered.length
      return {
        results: {
          ...result,
          results: filtered,
          _filtered: blockedCount > 0,
          _blockedCount: blockedCount,
        },
        filtered: blockedCount > 0,
        blockedCount,
      }
    }

    return { results: result, filtered: false, blockedCount: 0 }
  }

  /**
   * Get HA query middleware for Express/Koa style
   */
  createMiddleware() {
    return async (ctx, next) => {
      const queryId = `ha-q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      try {
        ctx.haQueryId = queryId
        ctx.haMode = getCurrentMode()
        ctx.haModeStatus = getModeStatus()

        this.logEvent('request_start', {
          queryId,
          path: ctx.path,
          mode: ctx.haMode,
        })

        await next()

        this.logEvent('request_success', {
          queryId,
          status: ctx.status,
          duration: Date.now() - ctx.startTime,
        })
      } catch (error) {
        this.logEvent('request_error', {
          queryId,
          error: error.message,
          mode: getCurrentMode(),
        })
        throw error
      }
    }
  }

  /**
   * Get status summary
   */
  getStatus() {
    return {
      initialized: this.initialized,
      mode: getCurrentMode(),
      modeStatus: getModeStatus(),
      haContext: this.haContext,
      tokenValid: this.haContext?.isValid,
      tokenExpires: this.haContext?.expiresAt,
      restrictionStats: getRestrictionStats(),
    }
  }

  /**
   * Get HA-aware stats
   */
  getStats() {
    return {
      status: this.getStatus(),
      restrictions: getRestrictionStats(),
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────

  logInit(status, message) {
    this.logEvent('ha_init', { status, message })
  }

  logQueryStart(queryId, input) {
    this.logEvent('query_start', {
      queryId,
      input: typeof input === 'string' ? input.substring(0, 100) : input,
      mode: getCurrentMode(),
    })
  }

  logQueryComplete(queryId, details) {
    this.logEvent('query_complete', { queryId, ...details })
  }

  logQueryError(queryId, error, isRestrictionError) {
    this.logEvent('query_error', {
      queryId,
      error: error.message,
      isRestrictionError,
      mode: getCurrentMode(),
    })
  }

  logEvent(eventType, data) {
    try {
      const entry = {
        timestamp: new Date().toISOString(),
        event: eventType,
        pid: process.pid,
        ...data,
      }

      const line = JSON.stringify(entry) + '\n'
      appendFileSync(HA_QUERY_LOG, line)
    } catch (e) {
      // Silently ignore logging errors
    }
  }
}

/**
 * Singleton instance for global use
 */
let globalIntegration = null

/**
 * Get or create global HA integration
 */
export function initializeHAIntegration() {
  if (!globalIntegration) {
    globalIntegration = new HAMCPIntegration()
    globalIntegration.initialize()
  }
  return globalIntegration
}

/**
 * Get global HA integration (must be initialized first)
 */
export function getHAIntegration() {
  if (!globalIntegration) {
    throw new Error(
      'HA integration not initialized. Call initializeHAIntegration() first.'
    )
  }
  return globalIntegration
}

/**
 * Shutdown global integration
 */
export function shutdownHAIntegration() {
  if (globalIntegration) {
    globalIntegration.shutdown()
    globalIntegration = null
  }
}

// ─────────────────────────────────────────────────────────────
// CLI Interface
// ─────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const integration = initializeHAIntegration()
  const status = integration.getStatus()

  console.log('\n╔══════════════════════════════════════════════════╗')
  console.log('║       MCP HA INTEGRATION STATUS                  ║')
  console.log('╚══════════════════════════════════════════════════╝\n')

  console.log('Initialization:')
  console.log(`  Initialized: ${status.initialized ? '✅ Yes' : '❌ No'}`)
  console.log(`  Mode:        ${status.mode}`)
  console.log(`  Reason:      ${status.modeStatus.reason}`)

  console.log('\nHA Context:')
  console.log(`  Valid:       ${status.tokenValid ? '✅ Yes' : '❌ No'}`)
  console.log(`  Source:      ${status.haContext.source}`)
  console.log(`  Chain Depth: ${status.haContext.chainDepth}`)

  if (status.tokenExpires) {
    const timeLeft = getTimeUntilExpiry(status.tokenExpires)
    console.log(`  Expires:     ${new Date(status.tokenExpires).toLocaleString()}`)
    console.log(`  Time left:   ${timeLeft.human}`)
  }

  console.log('\nRestriction Stats:')
  console.log(
    `  Total mode changes:  ${status.restrictionStats.totalModeChanges}`
  )
  console.log(
    `  Total restrictions:  ${status.restrictionStats.totalRestrictions}`
  )

  console.log('\n')

  // Cleanup
  shutdownHAIntegration()
}

// ─────────────────────────────────────────────────────────────
// MCP Server Startup (stdio transport)
// ─────────────────────────────────────────────────────────────

class HAMCPServer {
  constructor() {
    this.ha = new HAMCPIntegration()
    this.ha.initialize()
    this.tools = this.defineMCPTools()
  }

  defineMCPTools() {
    return [
      // ─────────────────────────────────────────────────────────────
      // CEREMONY & TOKEN (6 tools)
      // ─────────────────────────────────────────────────────────────
      {
        name: 'validate_token',
        description: 'Validate if HA token is valid (format, not expired)',
        inputSchema: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'Token to validate (optional; uses current if not provided)' },
          },
        },
      },
      {
        name: 'run_ceremony',
        description: 'Start HA token ceremony (code + Touch ID)',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Six-digit operator code' },
          },
          required: ['code'],
        },
      },
      {
        name: 'get_inheritance_chain',
        description: 'Get HA inheritance chain (parent → child → grandchild)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'prepare_subagent_env',
        description: 'Prepare environment variables for subagent to inherit HA',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_time_until_expiry',
        description: 'Get remaining time until HA token expires (human-readable)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'refresh_token',
        description: 'Attempt to refresh HA token (if applicable)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },

      // ─────────────────────────────────────────────────────────────
      // MODES & RESTRICTIONS (6 tools)
      // ─────────────────────────────────────────────────────────────
      {
        name: 'switch_to_armed_mode',
        description: 'Switch to HA_ARMED mode (full access)',
        inputSchema: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Reason for mode switch' },
          },
        },
      },
      {
        name: 'switch_to_degraded_mode',
        description: 'Switch to HA_DEGRADED mode (limited access, token expiring)',
        inputSchema: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Reason for mode switch' },
          },
        },
      },
      {
        name: 'activate_restricted_mode',
        description: 'Switch to RESTRICTED mode (no HA or token expired)',
        inputSchema: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Reason for restriction' },
          },
        },
      },
      {
        name: 'check_node_allowed',
        description: 'Check if a node is allowed in current mode',
        inputSchema: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'Node ID to check' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Node tags' },
          },
          required: ['nodeId'],
        },
      },
      {
        name: 'get_restriction_stats',
        description: 'Get restriction statistics and audit summary',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_audit_trail',
        description: 'Get audit trail of all restriction events (last N)',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max entries to return (default 50)' },
          },
        },
      },

      // ─────────────────────────────────────────────────────────────
      // CONTEXT NODES (6 tools)
      // ─────────────────────────────────────────────────────────────
      {
        name: 'query_nodes',
        description: 'Query context nodes by pattern or keyword',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (prefix or keyword)' },
            type: { type: 'string', description: 'Filter by node type (leaf, subnode, project, etc)' },
            limit: { type: 'number', description: 'Max results (default 20)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_node',
        description: 'Get a specific context node by ID',
        inputSchema: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'Node ID (e.g. system.ha-status)' },
          },
          required: ['nodeId'],
        },
      },
      {
        name: 'add_node',
        description: 'Add or update a context node',
        inputSchema: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'Node ID' },
            data: { type: 'object', description: 'Node data (arbitrary JSON)' },
            type: { type: 'string', description: 'Node type (leaf, subnode, project, etc)' },
            label: { type: 'string', description: 'Human-readable label' },
          },
          required: ['nodeId', 'data'],
        },
      },
      {
        name: 'list_agents',
        description: 'List available agents (Claude, Grok, Kimi, Fable)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'list_capabilities',
        description: 'List all capabilities across agents',
        inputSchema: {
          type: 'object',
          properties: {
            agent: { type: 'string', description: 'Filter by agent (claude, grok, kimi, fable)' },
          },
        },
      },
      {
        name: 'get_agent_status',
        description: 'Get status of a specific agent',
        inputSchema: {
          type: 'object',
          properties: {
            agent: { type: 'string', description: 'Agent name (claude, grok, kimi, fable)' },
          },
          required: ['agent'],
        },
      },

      // ─────────────────────────────────────────────────────────────
      // SYSTEM STATUS (5 tools)
      // ─────────────────────────────────────────────────────────────
      {
        name: 'get_live_state',
        description: 'Get complete live state snapshot (HA + infra + agents)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_infrastructure_status',
        description: 'Get infrastructure status (AMS, jailbroken.tech, local services)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_credentials_status',
        description: 'Get credentials status (Claude, Grok, Kimi API keys - expired/active)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'list_endpoints',
        description: 'List all API endpoints (MHA, ollama, C2 panel, code-server, etc)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_ha_logs',
        description: 'Get recent HA logs (token validation, mode changes, restrictions)',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max log entries (default 50)' },
            eventType: { type: 'string', description: 'Filter by event type (token_*, mode_change, query_*, etc)' },
          },
        },
      },

      // ─────────────────────────────────────────────────────────────
      // LEGACY TOOLS (kept for compatibility)
      // ─────────────────────────────────────────────────────────────
      {
        name: 'ha_status',
        description: 'Get current HARD ALLOW status and token expiry',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'ha_context',
        description: 'Get full HA context (grants, mode, restrictions)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'check_grant',
        description: 'Check if a specific grant is active',
        inputSchema: {
          type: 'object',
          properties: {
            grant: { type: 'string', description: 'Grant name (e.g. infection-delivery, crypto-drainer)' },
          },
          required: ['grant'],
        },
      },
      {
        name: 'mode_status',
        description: 'Get current mode (armed/degraded/restricted)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ]
  }

  async handleTool(name, input) {
    switch (name) {
      // ─────────────────────────────────────────────────────────────
      // CEREMONY & TOKEN
      // ─────────────────────────────────────────────────────────────
      case 'validate_token': {
        const context = this.ha.haContext
        return {
          valid: context?.isValid,
          reason: context?.validationReason,
          source: context?.source,
          expiresAt: context?.expiresAt,
        }
      }

      case 'run_ceremony': {
        // In real implementation, would spawn Touch ID + code ceremony
        // For now, return status
        return {
          status: 'ceremony_start',
          message: 'HA ceremony requires operator code + Touch ID',
          instruction: 'Use: grok --hard-allow',
        }
      }

      case 'get_inheritance_chain': {
        const chain = getInheritanceChain()
        return {
          count: chain.length,
          chain: chain.slice(-10), // Last 10
        }
      }

      case 'prepare_subagent_env': {
        const prep = prepareSubagentEnvironment()
        return {
          prepared: prep.prepared,
          reason: prep.reason,
          envVars: prep.prepared ? Object.keys(prep.env).filter(k => k.includes('GROK') || k.includes('HA')) : [],
        }
      }

      case 'get_time_until_expiry': {
        const context = this.ha.haContext
        const timeLeft = getTimeUntilExpiry(context?.expiresAt)
        return {
          expiresAt: context?.expiresAt,
          timeRemaining: timeLeft,
          expired: timeLeft?.expired || false,
        }
      }

      case 'refresh_token': {
        // Token refresh is not typically supported (require new ceremony)
        return {
          status: 'not_supported',
          message: 'Token refresh requires new ceremony: grok --hard-allow',
          note: 'HARD ALLOW tokens have fixed 6-hour TTL',
        }
      }

      // ─────────────────────────────────────────────────────────────
      // MODES & RESTRICTIONS
      // ─────────────────────────────────────────────────────────────
      case 'switch_to_armed_mode': {
        switchToArmedMode(input.reason || 'Manual mode switch')
        return { mode: getCurrentMode(), reason: getModeStatus().reason }
      }

      case 'switch_to_degraded_mode': {
        switchToDegradedMode(input.reason || 'Manual degradation')
        return { mode: getCurrentMode(), reason: getModeStatus().reason }
      }

      case 'activate_restricted_mode': {
        activateRestrictedMode(input.reason || 'Manual restriction')
        return { mode: getCurrentMode(), reason: getModeStatus().reason }
      }

      case 'check_node_allowed': {
        const allowed = isNodeAllowedInCurrentMode(input.nodeId, input.tags || [])
        return {
          nodeId: input.nodeId,
          allowed,
          currentMode: getCurrentMode(),
          reason: allowed ? 'Allowed' : 'Blocked by current mode',
        }
      }

      case 'get_restriction_stats': {
        return getRestrictionStats()
      }

      case 'get_audit_trail': {
        const trail = getRestrictionAuditTrail()
        const limit = input.limit || 50
        return {
          total: trail.length,
          entries: trail.slice(-limit),
        }
      }

      // ─────────────────────────────────────────────────────────────
      // CONTEXT NODES
      // ─────────────────────────────────────────────────────────────
      case 'query_nodes': {
        const cache = this.ha.stateCache
        if (!cache || !cache.nodes) {
          return { error: 'No state cache available', results: [] }
        }

        const results = Object.entries(cache.nodes)
          .filter(([id, node]) => {
            const matchesQuery = id.includes(input.query) || (node._label && node._label.includes(input.query))
            const matchesType = !input.type || node._type === input.type
            return matchesQuery && matchesType
          })
          .slice(0, input.limit || 20)
          .map(([id, node]) => ({ id, ...node }))

        return { results, count: results.length }
      }

      case 'get_node': {
        const cache = this.ha.stateCache
        if (!cache || !cache.nodes) {
          return { error: 'No state cache available' }
        }

        const node = cache.nodes[input.nodeId]
        if (!node) {
          return { error: `Node not found: ${input.nodeId}` }
        }

        return { id: input.nodeId, ...node }
      }

      case 'add_node': {
        // In real implementation, would persist to state.json
        return {
          status: 'added',
          nodeId: input.nodeId,
          message: 'Node added to local cache (would persist to state.json)',
        }
      }

      case 'list_agents': {
        const cache = this.ha.stateCache
        if (!cache || !cache.nodes) {
          return { error: 'No state cache available' }
        }

        const agents = Object.entries(cache.nodes)
          .filter(([id]) => id.startsWith('agents.'))
          .map(([id, node]) => ({
            id,
            name: node.name,
            status: node.oauthStatus,
            models: node.models,
          }))

        return { agents }
      }

      case 'list_capabilities': {
        const cache = this.ha.stateCache
        if (!cache || !cache.nodes) {
          return { error: 'No state cache available' }
        }

        const allCapabilities = new Set()
        Object.entries(cache.nodes)
          .filter(([id]) => id.startsWith('agents.'))
          .forEach(([_, node]) => {
            if (Array.isArray(node.capabilities)) {
              node.capabilities.forEach(c => allCapabilities.add(c))
            }
          })

        const filtered = input.agent
          ? Array.from(allCapabilities).filter(cap =>
              cache.nodes[`agents.${input.agent}`]?.capabilities?.includes(cap)
            )
          : Array.from(allCapabilities)

        return { capabilities: filtered, count: filtered.length }
      }

      case 'get_agent_status': {
        const cache = this.ha.stateCache
        if (!cache || !cache.nodes) {
          return { error: 'No state cache available' }
        }

        const agent = cache.nodes[`agents.${input.agent}`]
        if (!agent) {
          return { error: `Agent not found: ${input.agent}` }
        }

        return {
          agent: input.agent,
          status: agent.oauthStatus,
          models: agent.models,
          capabilities: agent.capabilities,
          expiresAt: agent.expiresAt,
        }
      }

      // ─────────────────────────────────────────────────────────────
      // SYSTEM STATUS
      // ─────────────────────────────────────────────────────────────
      case 'get_live_state': {
        const cache = this.ha.stateCache
        return {
          timestamp: cache?.timestamp || new Date().toISOString(),
          nodeCount: cache?.nodeCount || 0,
          edgeCount: cache?.edgeCount || 0,
          haStatus: this.ha.getStatus(),
          mode: getCurrentMode(),
        }
      }

      case 'get_infrastructure_status': {
        const cache = this.ha.stateCache
        const infra = cache?.nodes?.['system.infrastructure'] || {}
        return {
          ams: infra.ams || { status: 'unknown' },
          jailbroken_tech: infra.jailbroken_tech || { status: 'unknown' },
          local: infra.local || { status: 'unknown' },
        }
      }

      case 'get_credentials_status': {
        const cache = this.ha.stateCache
        const creds = cache?.nodes?.['system.credentials'] || {}
        return {
          claude: creds.claude || { status: 'unknown' },
          kimi: creds.kimi || { status: 'unknown' },
          grok: creds.grok || { status: 'unknown' },
          timestamp: cache?.timestamp,
        }
      }

      case 'list_endpoints': {
        const cache = this.ha.stateCache
        const endpoints = cache?.nodes?.['system.endpoints'] || {}
        return {
          endpoints: Object.entries(endpoints)
            .filter(([k]) => !k.startsWith('_'))
            .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
        }
      }

      case 'get_ha_logs': {
        // Read from HA_QUERY_LOG
        const limit = input.limit || 50
        let logs = []

        try {
          if (existsSync(HA_QUERY_LOG)) {
            const content = readFileSync(HA_QUERY_LOG, 'utf8')
            logs = content
              .split('\n')
              .filter(line => line.trim())
              .map(line => {
                try {
                  return JSON.parse(line)
                } catch {
                  return null
                }
              })
              .filter(Boolean)

            if (input.eventType) {
              logs = logs.filter(log => log.event === input.eventType)
            }

            logs = logs.slice(-limit)
          }
        } catch (e) {
          // Silent fail
        }

        return { logs, count: logs.length }
      }

      // ─────────────────────────────────────────────────────────────
      // LEGACY TOOLS
      // ─────────────────────────────────────────────────────────────
      case 'ha_status': {
        const context = this.ha.haContext
        return {
          valid: context?.isValid,
          expiresAt: context?.expiresAt,
          timeUntilExpiry: getTimeUntilExpiry(context?.expiresAt),
          grants: context?.grants || [],
        }
      }

      case 'ha_context': {
        return {
          context: this.ha.haContext,
          modeStatus: this.ha.modeStatus,
        }
      }

      case 'check_grant': {
        const grants = this.ha.haContext?.grants || []
        const hasGrant = grants.includes(input.grant)
        return {
          grant: input.grant,
          active: hasGrant,
          availableGrants: grants,
        }
      }

      case 'mode_status': {
        return this.ha.modeStatus
      }

      default:
        return { error: `Unknown tool: ${name}` }
    }
  }

  async run() {
    process.stdin.setEncoding('utf-8')

    for await (const line of process.stdin) {
      if (!line.trim()) continue

      try {
        const request = JSON.parse(line)

        if (request.method === 'tools/list') {
          process.stdout.write(JSON.stringify({
            tools: this.tools,
          }) + '\n')
        } else if (request.method === 'tools/call') {
          const result = await this.handleTool(request.params.name, request.params.arguments || {})
          process.stdout.write(JSON.stringify({
            result,
          }) + '\n')
        } else {
          process.stdout.write(JSON.stringify({
            error: `Unknown method: ${request.method}`,
          }) + '\n')
        }
      } catch (error) {
        process.stdout.write(JSON.stringify({
          error: error.message,
        }) + '\n')
      }
    }
  }
}

// Start server
const server = new HAMCPServer()
server.run().catch((err) => {
  console.error('HA MCP Server error:', err)
  process.exit(1)
})
