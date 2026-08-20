#!/usr/bin/env node
/**
 * subagent-fallback-mode.mjs
 * Graceful degradation when HA token unavailable or expired
 *
 * Purpose:
 * - Gracefully degrade to restricted mode when HA unavailable
 * - Switch modes mid-execution without crashing
 * - Filter nodes based on tags and allowed/blocked lists
 * - Audit every restriction (why nodes were filtered)
 * - Return partial results instead of errors
 *
 * Exports:
 * - activateRestrictedMode() — Switch to restricted mode
 * - isNodeAllowedInRestrictedMode(nodeId) — Check if node is accessible
 * - applyRestrictedFilter(nodes) — Filter nodes array
 * - getModeStatus() — Get current mode and reason
 * - getCurrentMode() — Get current mode (HA_ARMED, HA_DEGRADED, RESTRICTED)
 *
 * Node Tags:
 * - offense, crypto-drainer, infra-ops-comms, c2-commands — blocked in restricted
 * - research, base, defense, multi-llm — always allowed
 *
 * Usage:
 * import { activateRestrictedMode, isNodeAllowedInRestrictedMode } from './subagent-fallback-mode.mjs'
 *
 * // On token expiry
 * activateRestrictedMode('token_expired')
 *
 * // Filter results
 * const filtered = applyRestrictedFilter(nodes)
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = homedir()
const RESTRICTION_LOG = join(HOME, '.grok', 'hard-allow', 'restriction-audit.jsonl')

// ─────────────────────────────────────────────────────────────
// Mode State Management
// ─────────────────────────────────────────────────────────────

let currentMode = 'HA_ARMED' // HA_ARMED | HA_DEGRADED | RESTRICTED
let modeReason = 'Initial armed state'
let modeActivatedAt = new Date().toISOString()
let restrictionCount = 0

/**
 * Modes:
 * - HA_ARMED: Full access, parent HA token valid
 * - HA_DEGRADED: Limited access, token expiring soon or parent context weak
 * - RESTRICTED: Minimal access, no HA token or token expired
 */

const NODE_FILTERS = {
  // Always allowed in any mode
  ALWAYS_ALLOWED: new Set(['base', 'research', 'defense', 'multi-llm']),

  // Blocked tags (dangerous nodes)
  BLOCKED_TAGS: new Set([
    'offense',
    'crypto-drainer',
    'drainer',
    'infra-ops-comms',
    'c2-commands',
    'c2-panel',
    'payload-delivery',
    'evasion-technique',
    'privilege-escalation',
    'lateral-movement',
  ]),

  // Degraded mode restrictions (semi-dangerous)
  DEGRADED_RESTRICTIONS: new Set([
    'crypto-drainer',
    'c2-commands',
    'c2-panel',
    'privilege-escalation',
  ]),
}

// ─────────────────────────────────────────────────────────────
// Mode Management
// ─────────────────────────────────────────────────────────────

/**
 * Get current mode
 */
export function getCurrentMode() {
  return currentMode
}

/**
 * Get detailed mode status
 */
export function getModeStatus() {
  return {
    mode: currentMode,
    reason: modeReason,
    activatedAt: modeActivatedAt,
    restrictionCount,
    isRestricted: currentMode === 'RESTRICTED',
    isDegraded: currentMode === 'HA_DEGRADED',
    isArmed: currentMode === 'HA_ARMED',
  }
}

/**
 * Switch to HA_ARMED mode
 */
export function switchToArmedMode(reason = 'HA token valid') {
  currentMode = 'HA_ARMED'
  modeReason = reason
  modeActivatedAt = new Date().toISOString()
  restrictionCount = 0
  logModeChange('ARMED', reason)
}

/**
 * Switch to HA_DEGRADED mode (token expiring soon or weak parent context)
 */
export function switchToDegradedMode(reason = 'HA degraded') {
  currentMode = 'HA_DEGRADED'
  modeReason = reason
  modeActivatedAt = new Date().toISOString()
  logModeChange('DEGRADED', reason)
}

/**
 * Activate RESTRICTED mode (no HA or token expired)
 */
export function activateRestrictedMode(reason = 'No HA token') {
  currentMode = 'RESTRICTED'
  modeReason = reason
  modeActivatedAt = new Date().toISOString()
  restrictionCount = 0
  logModeChange('RESTRICTED', reason)
}

// ─────────────────────────────────────────────────────────────
// Node Access Control
// ─────────────────────────────────────────────────────────────

/**
 * Check if a node is allowed in restricted mode
 */
export function isNodeAllowedInRestrictedMode(nodeId, nodeTags = []) {
  if (!nodeId) return false

  // Always allow certain node types
  if (NODE_FILTERS.ALWAYS_ALLOWED.has(nodeId) || nodeTags.some((tag) => NODE_FILTERS.ALWAYS_ALLOWED.has(tag))) {
    return true
  }

  // Block dangerous nodes
  if (nodeTags.some((tag) => NODE_FILTERS.BLOCKED_TAGS.has(tag))) {
    logRestriction(nodeId, 'blocked_tag', nodeTags)
    return false
  }

  // Default: allow in restricted mode
  return true
}

/**
 * Check if a node is allowed in degraded mode
 */
function isNodeAllowedInDegradedMode(nodeId, nodeTags = []) {
  // Always allow
  if (NODE_FILTERS.ALWAYS_ALLOWED.has(nodeId) || nodeTags.some((tag) => NODE_FILTERS.ALWAYS_ALLOWED.has(tag))) {
    return true
  }

  // Block dangerous nodes that are restricted in degraded mode
  if (nodeTags.some((tag) => NODE_FILTERS.DEGRADED_RESTRICTIONS.has(tag))) {
    logRestriction(nodeId, 'degraded_restriction', nodeTags)
    return false
  }

  // Still allow most other nodes
  return true
}

/**
 * Check if a node is allowed in current mode
 */
export function isNodeAllowedInCurrentMode(nodeId, nodeTags = []) {
  switch (currentMode) {
    case 'HA_ARMED':
      return true // All nodes allowed

    case 'HA_DEGRADED':
      return isNodeAllowedInDegradedMode(nodeId, nodeTags)

    case 'RESTRICTED':
      return isNodeAllowedInRestrictedMode(nodeId, nodeTags)

    default:
      return false
  }
}

// ─────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────

/**
 * Apply restricted mode filter to an array of nodes
 * Returns: {filtered, original, blockedCount, results}
 */
export function applyRestrictedFilter(nodes) {
  if (!Array.isArray(nodes)) {
    return {
      filtered: true,
      original: 0,
      blockedCount: 0,
      results: [],
    }
  }

  const filtered = []
  let blockedCount = 0

  for (const node of nodes) {
    const nodeId = node.id || node.nodeId || ''
    const tags = node.tags || node.metadata?.tags || []
    const allowed = isNodeAllowedInCurrentMode(nodeId, tags)

    if (allowed) {
      filtered.push(node)
    } else {
      blockedCount++
    }
  }

  restrictionCount += blockedCount

  if (blockedCount > 0) {
    logRestriction('batch', `filtered_${blockedCount}_of_${nodes.length}`, [])
  }

  return {
    filtered: blockedCount > 0,
    original: nodes.length,
    blockedCount,
    results: filtered,
  }
}

/**
 * Apply filter to query results before returning to LLM
 */
export function filterQueryResults(results) {
  if (!results) return results
  if (!Array.isArray(results)) return results

  return applyRestrictedFilter(results).results
}

/**
 * Wrap MCP tool result with mode-aware filtering
 */
export function wrapMCPToolResult(toolName, result) {
  if (!result || typeof result !== 'object') {
    return result
  }

  // Filter results arrays based on mode
  if (Array.isArray(result.results)) {
    const filtered = applyRestrictedFilter(result.results)
    return {
      ...result,
      results: filtered.results,
      _mode: currentMode,
      _blocked: filtered.blockedCount,
    }
  }

  // Wrap single node results
  if (result.node && typeof result.node === 'object') {
    const nodeId = result.node.id || ''
    const tags = result.node.tags || []

    if (!isNodeAllowedInCurrentMode(nodeId, tags)) {
      logRestriction(nodeId, 'access_denied', tags)
      return {
        error: 'Access denied in restricted mode',
        _mode: currentMode,
        _reason: modeReason,
      }
    }
  }

  return {
    ...result,
    _mode: currentMode,
  }
}

// ─────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────

/**
 * Log mode change event
 */
function logModeChange(mode, reason) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      event: 'mode_change',
      mode,
      reason,
      pid: process.pid,
    }

    const line = JSON.stringify(entry) + '\n'
    appendFileSync(RESTRICTION_LOG, line)
  } catch (e) {
    // Silently ignore logging errors
  }
}

/**
 * Log restriction event (why a node was filtered)
 */
function logRestriction(nodeId, reason, tags) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      event: 'node_restriction',
      nodeId,
      reason,
      tags,
      currentMode,
      pid: process.pid,
    }

    const line = JSON.stringify(entry) + '\n'
    appendFileSync(RESTRICTION_LOG, line)
  } catch (e) {
    // Silently ignore logging errors
  }
}

/**
 * Get audit trail of restrictions
 */
export function getRestrictionAuditTrail() {
  if (!existsSync(RESTRICTION_LOG)) {
    return []
  }

  try {
    const content = readFileSync(RESTRICTION_LOG, 'utf8')
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch (e) {
    return []
  }
}

/**
 * Get summary statistics
 */
export function getRestrictionStats() {
  const audit = getRestrictionAuditTrail()
  const modeChanges = audit.filter((e) => e.event === 'mode_change')
  const restrictions = audit.filter((e) => e.event === 'node_restriction')

  return {
    totalModeChanges: modeChanges.length,
    totalRestrictions: restrictions.length,
    currentMode,
    modeReason,
    activeSince: modeActivatedAt,
    restrictionsByReason: restrictions.reduce((acc, e) => {
      acc[e.reason] = (acc[e.reason] || 0) + 1
      return acc
    }, {}),
  }
}

// ─────────────────────────────────────────────────────────────
// CLI Interface
// ─────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const status = getModeStatus()
  const stats = getRestrictionStats()

  console.log('\n╔══════════════════════════════════════════════════╗')
  console.log('║     SUBAGENT FALLBACK MODE STATUS                ║')
  console.log('╚══════════════════════════════════════════════════╝\n')

  console.log('Current Status:')
  console.log(`  Mode:         ${status.mode}`)
  console.log(`  Reason:       ${status.reason}`)
  console.log(`  Active since: ${new Date(status.activatedAt).toLocaleString()}`)
  console.log(`  Restrictions: ${status.restrictionCount}`)

  console.log('\nAllowed Node Tags:')
  console.log(`  ${Array.from(NODE_FILTERS.ALWAYS_ALLOWED).join(', ')}`)

  console.log('\nBlocked Tags (Restricted/Degraded Mode):')
  console.log(`  ${Array.from(NODE_FILTERS.BLOCKED_TAGS).join(', ')}`)

  console.log('\nAudit Trail (last 10):')
  const trail = getRestrictionAuditTrail()
  trail.slice(-10).forEach((entry, idx) => {
    const verb = entry.event === 'mode_change' ? 'SWITCHED' : 'FILTERED'
    const detail = entry.event === 'mode_change' ? entry.mode : entry.nodeId
    console.log(`  ${idx + 1}. ${entry.timestamp} - ${verb} ${detail}`)
  })

  console.log('\nRestriction Stats:')
  console.log(`  Total mode changes:  ${stats.totalModeChanges}`)
  console.log(`  Total restrictions:  ${stats.totalRestrictions}`)

  if (Object.keys(stats.restrictionsByReason).length > 0) {
    console.log('  By reason:')
    Object.entries(stats.restrictionsByReason).forEach(([reason, count]) => {
      console.log(`    - ${reason}: ${count}`)
    })
  }

  console.log('\n')
}
