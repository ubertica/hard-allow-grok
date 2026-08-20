#!/usr/bin/env node
/**
 * ha-subagent-wrapper.mjs
 * Automatic HA token inheritance and validation for subagents
 *
 * Purpose:
 * - Detect parent HA status (token, expiry, scope)
 * - Pass token to subagent via environment variables
 * - Validate token before inheritance
 * - Log inheritance chain (parent → child → grandchild)
 * - Handle token expiry gracefully
 *
 * Exports:
 * - inheritHAFromParent() — Detect and pass token to subagent
 * - getHAContext() — Returns {token, isActive, expiresAt, isValid}
 * - validateTokenForSubagent() — Check token format and expiry
 * - isTokenValid() — Quick expiry check
 *
 * Usage:
 * import { inheritHAFromParent, getHAContext } from './ha-subagent-wrapper.mjs'
 *
 * // At subagent startup
 * const context = inheritHAFromParent()
 * if (context.isValid) {
 *   console.log('HA armed in subagent')
 * } else {
 *   console.log('Falling back to restricted mode')
 * }
 */

import { readFileSync, existsSync, appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = homedir()
const ARMED_FILE = join(HOME, '.grok', 'hard-allow', 'ARMED')
const INHERITANCE_LOG = join(HOME, '.grok', 'hard-allow', 'ha-inheritance-log.jsonl')

// ─────────────────────────────────────────────────────────────
// Token Validation
// ─────────────────────────────────────────────────────────────

/**
 * Check if token is still valid (not expired)
 */
export function isTokenValid(expiresAt) {
  if (!expiresAt) return false
  const expires = new Date(expiresAt)
  const now = new Date()
  return expires > now
}

/**
 * Validate token format and expiry
 * Returns: {valid, reason, expiresAt}
 */
export function validateTokenForSubagent(token, expiresAt) {
  if (!token) {
    return {
      valid: false,
      reason: 'No token provided',
      expiresAt: null,
    }
  }

  if (!expiresAt) {
    return {
      valid: false,
      reason: 'No expiry timestamp',
      expiresAt: null,
    }
  }

  // Token format: ha_<48-char-hex>
  if (!/^ha_[a-f0-9]{48}$/.test(token)) {
    return {
      valid: false,
      reason: 'Invalid token format',
      expiresAt,
    }
  }

  if (!isTokenValid(expiresAt)) {
    return {
      valid: false,
      reason: 'Token expired',
      expiresAt,
    }
  }

  return {
    valid: true,
    reason: 'Token valid',
    expiresAt,
  }
}

// ─────────────────────────────────────────────────────────────
// Parent HA Detection
// ─────────────────────────────────────────────────────────────

/**
 * Load parent HA state from ARMED file
 */
function loadParentHAState() {
  if (!existsSync(ARMED_FILE)) {
    return null
  }

  try {
    const state = JSON.parse(readFileSync(ARMED_FILE, 'utf8'))
    return {
      armed: state.armed === true,
      nuclear: state.nuclear === true,
      cryptoDrainer: state.cryptoDrainer === true,
      infraOpsComms: state.infraOpsComms === true,
      multiLlmReady: state.multiLlmReady === true,
      session: state.session || {},
    }
  } catch (e) {
    console.error('[HA-Wrapper] Failed to load ARMED file:', e.message)
    return null
  }
}

/**
 * Load HA token from environment variables (for already inherited tokens)
 */
function loadInheritedHAToken() {
  const token = process.env.GROK_HARD_ALLOW_TOKEN_INHERITED
  const expiresAt = process.env.GROK_HARD_ALLOW_TOKEN_EXPIRES_INHERITED
  const chainDepth = parseInt(process.env.GROK_HA_INHERITANCE_DEPTH || '0', 10)

  if (!token || !expiresAt) {
    return null
  }

  return {
    token,
    expiresAt,
    chainDepth,
    source: 'inherited',
  }
}

// ─────────────────────────────────────────────────────────────
// HA Context Management
// ─────────────────────────────────────────────────────────────

let cachedHAContext = null

/**
 * Get HA context for this process
 * Returns: {token, isActive, expiresAt, isValid, source, chainDepth}
 */
export function getHAContext() {
  if (cachedHAContext) {
    return cachedHAContext
  }

  // Try inherited token first (faster path for subagents)
  let inherited = loadInheritedHAToken()
  if (inherited) {
    const validation = validateTokenForSubagent(inherited.token, inherited.expiresAt)
    cachedHAContext = {
      token: inherited.token,
      isActive: validation.valid,
      expiresAt: inherited.expiresAt,
      isValid: validation.valid,
      source: 'inherited',
      chainDepth: inherited.chainDepth,
      validationReason: validation.reason,
    }
    return cachedHAContext
  }

  // Fallback to ARMED file (parent or standalone process)
  const parentState = loadParentHAState()
  if (parentState && parentState.armed && parentState.session.hardAllowToken) {
    const validation = validateTokenForSubagent(
      parentState.session.hardAllowToken,
      parentState.session.expiresAt
    )
    cachedHAContext = {
      token: parentState.session.hardAllowToken,
      isActive: parentState.armed,
      expiresAt: parentState.session.expiresAt,
      isValid: validation.valid,
      source: 'parent',
      chainDepth: 0,
      validationReason: validation.reason,
      policy: parentState.session.policy || {},
    }
    return cachedHAContext
  }

  // No HA context available
  cachedHAContext = {
    token: null,
    isActive: false,
    expiresAt: null,
    isValid: false,
    source: 'none',
    chainDepth: 0,
    validationReason: 'No HA context found',
  }
  return cachedHAContext
}

// ─────────────────────────────────────────────────────────────
// HA Inheritance
// ─────────────────────────────────────────────────────────────

/**
 * Inherit HA from parent and set environment variables for subagent
 * Returns: {inherited, context, error}
 */
export function inheritHAFromParent() {
  const context = getHAContext()

  const result = {
    inherited: false,
    context,
    error: null,
  }

  if (!context.isValid) {
    result.error = `HA inheritance failed: ${context.validationReason}`
    logInheritance({
      status: 'failed',
      reason: context.validationReason,
      source: context.source,
      chainDepth: context.chainDepth,
    })
    return result
  }

  // Calculate next chain depth
  const nextChainDepth = (context.chainDepth || 0) + 1

  // Set environment variables for child processes / subagents
  if (process.env.NODE_ENV !== 'test') {
    process.env.GROK_HARD_ALLOW_TOKEN_INHERITED = context.token
    process.env.GROK_HARD_ALLOW_TOKEN_EXPIRES_INHERITED = context.expiresAt
    process.env.GROK_HA_INHERITANCE_DEPTH = String(nextChainDepth)
    process.env.GROK_HA_PARENT_SOURCE = context.source
  }

  result.inherited = true
  result.context = {
    ...context,
    chainDepth: nextChainDepth,
  }

  logInheritance({
    status: 'success',
    source: context.source,
    expiresAt: context.expiresAt,
    chainDepth: nextChainDepth,
    policy: context.policy,
  })

  return result
}

/**
 * Set environment variables for subagent to inherit HA
 * Call this before spawning a subagent
 */
export function prepareSubagentEnvironment(env = process.env) {
  const context = getHAContext()

  if (!context.isValid) {
    return { prepared: false, reason: context.validationReason }
  }

  const nextChainDepth = (context.chainDepth || 0) + 1

  return {
    prepared: true,
    env: {
      ...env,
      GROK_HARD_ALLOW_TOKEN_INHERITED: context.token,
      GROK_HARD_ALLOW_TOKEN_EXPIRES_INHERITED: context.expiresAt,
      GROK_HA_INHERITANCE_DEPTH: String(nextChainDepth),
      GROK_HA_PARENT_SOURCE: context.source,
    },
  }
}

// ─────────────────────────────────────────────────────────────
// Time Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Time remaining until token expires
 */
export function getTimeUntilExpiry(expiresAt) {
  if (!expiresAt) return null

  const expires = new Date(expiresAt)
  const now = new Date()
  const diffMs = expires - now

  if (diffMs <= 0) {
    return { expired: true, ms: 0, human: 'expired' }
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)

  let human = ''
  if (hours > 0) human += `${hours}h `
  if (minutes > 0) human += `${minutes}m `
  human += `${seconds}s`

  return {
    expired: false,
    ms: diffMs,
    hours,
    minutes,
    seconds,
    human: human.trim(),
  }
}

// ─────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────

/**
 * Log inheritance event to audit trail
 */
function logInheritance(event) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      ppid: process.ppid || null,
      ...event,
    }

    const line = JSON.stringify(entry) + '\n'
    appendFileSync(INHERITANCE_LOG, line)
  } catch (e) {
    // Silently ignore logging errors
  }
}

/**
 * Get inheritance chain from log
 */
export function getInheritanceChain() {
  if (!existsSync(INHERITANCE_LOG)) {
    return []
  }

  try {
    const content = readFileSync(INHERITANCE_LOG, 'utf8')
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

// ─────────────────────────────────────────────────────────────
// CLI Interface
// ─────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const context = getHAContext()

  console.log('\n╔══════════════════════════════════════════════════╗')
  console.log('║       HA SUBAGENT WRAPPER STATUS                 ║')
  console.log('╚══════════════════════════════════════════════════╝\n')

  console.log('HA Context:')
  console.log(`  Valid:        ${context.isValid ? '✅ Yes' : '❌ No'}`)
  console.log(`  Active:       ${context.isActive ? '🟢 Yes' : '🔴 No'}`)
  console.log(`  Source:       ${context.source}`)
  console.log(`  Chain Depth:  ${context.chainDepth}`)
  console.log(`  Token:        ${context.token ? context.token.substring(0, 16) + '...' : 'None'}`)

  if (context.expiresAt) {
    const timeLeft = getTimeUntilExpiry(context.expiresAt)
    console.log(`  Expires at:   ${new Date(context.expiresAt).toLocaleString()}`)
    console.log(`  Time left:    ${timeLeft.human}`)
  }

  if (context.validationReason) {
    console.log(`  Reason:       ${context.validationReason}`)
  }

  console.log('\nInheritance Log (last 5):')
  const chain = getInheritanceChain()
  chain.slice(-5).forEach((entry, idx) => {
    console.log(`  ${idx + 1}. ${entry.timestamp} - ${entry.status} (chain depth: ${entry.chainDepth})`)
  })

  console.log('\n')
}
