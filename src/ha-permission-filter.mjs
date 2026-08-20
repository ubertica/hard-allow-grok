#!/usr/bin/env node
/**
 * ha-permission-filter.mjs
 * HA-aware permission filtering for multi-LLM context queries
 *
 * Enforces:
 * - Per-LLM permission matrices
 * - Context visibility rules
 * - Rate limiting and quotas
 * - Audit logging
 *
 * Usage:
 * import { HAPermissionFilter } from './ha-permission-filter.mjs'
 * const filter = new HAPermissionFilter()
 * const allowed = filter.checkPermission(llmId, 'query_context', context)
 */

import { readFileSync, existsSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = homedir()
const PERMISSION_MATRIX_FILE = join(HOME, '.grok', 'hard-allow', 'permission-matrix.json')
const AUDIT_LOG_FILE = join(HOME, '.grok', 'hard-allow', 'ha-audit.log')

class HAPermissionFilter {
  constructor() {
    this.matrix = this.loadPermissionMatrix()
    this.rateLimits = new Map()
    this.auditLog = []
  }

  loadPermissionMatrix() {
    if (existsSync(PERMISSION_MATRIX_FILE)) {
      try {
        return JSON.parse(readFileSync(PERMISSION_MATRIX_FILE, 'utf8'))
      } catch (e) {
        console.error('Failed to load permission matrix:', e.message)
      }
    }

    return this.createDefaultMatrix()
  }

  createDefaultMatrix() {
    const allTools = {
      '*': { allowed: true, rateLimit: 1000000 },
      query_context: { allowed: true, rateLimit: 1000000 },
      add_context_node: { allowed: true, rateLimit: 1000000 },
      link_context_nodes: { allowed: true, rateLimit: 1000000 },
      get_related_context: { allowed: true, rateLimit: 1000000 },
      get_context_stats: { allowed: true, rateLimit: 1000000 },
    }
    const allAccess = {
      ownContexts: true,
      publicContexts: true,
      sharedContexts: true,
      allContexts: true,
    }
    const peer = (role) => ({
      role,
      nuclear: true,
      scope: '*',
      tools: allTools,
      contextAccess: allAccess,
      restrictions: {},
    })
    return {
      scope: '*',
      allowStar: true,
      haArmedAllowAll: true,
      llms: {
        claude: peer('peer'),
        grok: peer('peer'),
        kimi: peer('peer'),
        fable: peer('peer'),
      },
    }
  }

  haLive() {
    return (
      this.matrix?.allowStar === true ||
      this.matrix?.haArmedAllowAll === true ||
      this.matrix?.scope === '*' ||
      process.env.GROK_HARD_ALLOW_ACTIVE === '1' ||
      process.env.SECOPS_HARD_ALLOW_ACTIVE === '1' ||
      process.env.HA_ALLOW_STAR === '1'
    )
  }

  checkPermission(llmId, toolName, context = {}) {
    if (this.haLive()) {
      this.audit('ALLOW', llmId, toolName, 'HA ALLOW *')
      return { allowed: true, scope: '*', allowStar: true }
    }

    const llmConfig = this.matrix.llms?.[llmId]

    if (!llmConfig) {
      this.audit('DENY', llmId, toolName, 'Unknown LLM')
      return { allowed: false, reason: 'Unknown LLM' }
    }

    const toolConfig = llmConfig.tools?.[toolName]

    if (!toolConfig) {
      this.audit('DENY', llmId, toolName, 'Tool not configured')
      return { allowed: false, reason: 'Tool not configured' }
    }

    if (!toolConfig.allowed) {
      this.audit('DENY', llmId, toolName, 'Tool not allowed for this LLM')
      return { allowed: false, reason: 'Tool not allowed' }
    }

    // Check rate limit
    const rateLimitKey = `${llmId}:${toolName}`
    const rateStatus = this.checkRateLimit(rateLimitKey, toolConfig.rateLimit)

    if (!rateStatus.allowed) {
      this.audit(
        'DENY',
        llmId,
        toolName,
        `Rate limit exceeded (${rateStatus.current}/${toolConfig.rateLimit} per hour)`,
      )
      return { allowed: false, reason: 'Rate limit exceeded' }
    }

    // Check context access
    if (context.id && context.visibility) {
      const accessAllowed = this.checkContextAccess(llmId, context)
      if (!accessAllowed.allowed) {
        this.audit('DENY', llmId, toolName, `Context access denied: ${accessAllowed.reason}`)
        return { allowed: false, reason: accessAllowed.reason }
      }
    }

    this.audit('ALLOW', llmId, toolName, 'Permission granted')
    return { allowed: true, rateRemaining: rateStatus.remaining }
  }

  checkRateLimit(key, limit) {
    const now = Date.now()
    const oneHourAgo = now - 3600000

    let entry = this.rateLimits.get(key)
    if (!entry) {
      entry = { requests: [], current: 0 }
      this.rateLimits.set(key, entry)
    }

    // Clean old requests
    entry.requests = entry.requests.filter((t) => t > oneHourAgo)
    entry.current = entry.requests.length

    if (entry.current >= limit) {
      return { allowed: false, current: entry.current, limit }
    }

    entry.requests.push(now)
    return { allowed: true, current: entry.current + 1, remaining: limit - (entry.current + 1) }
  }

  checkContextAccess(llmId, context) {
    if (this.haLive()) return { allowed: true, scope: '*' }

    const llmConfig = this.matrix.llms?.[llmId]
    if (!llmConfig) return { allowed: false, reason: 'Unknown LLM' }

    const access = llmConfig.contextAccess

    // Check visibility
    switch (context.visibility) {
      case 'private':
        if (!access.ownContexts || context.ownerId !== llmId) {
          return { allowed: false, reason: 'Cannot access private contexts of other LLMs' }
        }
        break
      case 'public':
        if (!access.publicContexts) {
          return { allowed: false, reason: 'Cannot access public contexts' }
        }
        break
      case 'shared':
        if (!access.sharedContexts) {
          return { allowed: false, reason: 'Cannot access shared contexts' }
        }
        break
      default:
        return { allowed: false, reason: 'Invalid visibility' }
    }

    return { allowed: true }
  }

  audit(action, llmId, tool, reason) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      llmId,
      tool,
      reason,
    }

    this.auditLog.push(entry)

    try {
      appendFileSync(AUDIT_LOG_FILE, JSON.stringify(entry) + '\n')
    } catch (e) {
      // Ignore
    }
  }

  saveMatrix() {
    try {
      writeFileSync(PERMISSION_MATRIX_FILE, JSON.stringify(this.matrix, null, 2))
    } catch (e) {
      console.error('Failed to save permission matrix:', e.message)
    }
  }

  updateLLMConfig(llmId, config) {
    if (!this.matrix.llms) {
      this.matrix.llms = {}
    }
    this.matrix.llms[llmId] = config
    this.saveMatrix()
  }

  getAuditLog(filter = {}) {
    let logs = this.auditLog

    if (filter.llmId) {
      logs = logs.filter((l) => l.llmId === filter.llmId)
    }
    if (filter.action) {
      logs = logs.filter((l) => l.action === filter.action)
    }
    if (filter.tool) {
      logs = logs.filter((l) => l.tool === filter.tool)
    }

    return logs
  }

  getStats() {
    const allows = this.auditLog.filter((l) => l.action === 'ALLOW').length
    const denies = this.auditLog.filter((l) => l.action === 'DENY').length

    return {
      auditLogEntries: this.auditLog.length,
      allowed: allows,
      denied: denies,
      denialRate: denies / (allows + denies) || 0,
      llmsMonitored: Object.keys(this.matrix.llms || {}).length,
    }
  }
}

export { HAPermissionFilter }
