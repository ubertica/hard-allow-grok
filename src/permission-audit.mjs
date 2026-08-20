#!/usr/bin/env node
/**
 * Permission Audit Trail: Compliance & Security Logging
 *
 * Logs:
 * - Permission denials (attempted access to restricted nodes)
 * - Who accessed what (for compliance)
 * - Token validation attempts
 * - Context gate decisions
 *
 * Output: ~/.grok/hard-allow/permission-audit.jsonl
 */

import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { hostname } from 'node:os';

const HOME = homedir();
const GROK_HA = join(HOME, '.grok', 'hard-allow');
const AUDIT_LOG = join(GROK_HA, 'permission-audit.jsonl');

/**
 * PermissionAuditTrail: Write-once audit log
 */
class PermissionAuditTrail {
  constructor(logPath = AUDIT_LOG) {
    this.logPath = logPath;
    this.ensureLogFile();
  }

  /**
   * Ensure log file and directory exist
   */
  ensureLogFile() {
    const dir = dirname(this.logPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!existsSync(this.logPath)) {
      appendFileSync(this.logPath, '');
    }
  }

  /**
   * Build audit entry
   */
  buildEntry(type, data = {}) {
    return {
      '@timestamp': new Date().toISOString(),
      type,
      host: hostname(),
      caller: data.caller || 'unknown',
      node: data.nodeId || data.node || null,
      nodeLabel: data.nodeLabel || null,
      tags: data.tags || [],
      action: data.action || null,
      reason: data.reason || null,
      hasHA: data.hasHA || false,
      isNuclear: data.isNuclear || false,
      requestId: data.requestId || null,
      metadata: data.metadata || {},
    };
  }

  /**
   * Write entry to audit log
   */
  logEntry(entry) {
    try {
      const line = JSON.stringify(entry) + '\n';
      appendFileSync(this.logPath, line, 'utf8');
    } catch (err) {
      console.error('Failed to write audit log:', err);
    }
  }

  /**
   * Log permission denial
   */
  logDenial(caller, nodeId, nodeLabel, tags, reason = 'insufficient_permissions', metadata = {}) {
    const entry = this.buildEntry('denial', {
      caller,
      nodeId,
      nodeLabel,
      tags,
      reason,
      metadata,
    });

    this.logEntry(entry);
  }

  /**
   * Log permission grant
   */
  logGrant(caller, nodeId, nodeLabel, tags, requestId = null) {
    const entry = this.buildEntry('grant', {
      caller,
      nodeId,
      nodeLabel,
      tags,
      action: 'query_executed',
      requestId,
    });

    this.logEntry(entry);
  }

  /**
   * Log token validation attempt
   */
  logTokenValidation(status, hasToken = false, isValid = false, reason = null) {
    const entry = this.buildEntry('token_validation', {
      action: status,
      hasToken,
      isValid,
      reason,
    });

    this.logEntry(entry);
  }

  /**
   * Log context gate decision
   */
  logGateDecision(caller, gateName, allowed, reason = null) {
    const entry = this.buildEntry('gate_decision', {
      caller,
      action: allowed ? 'allowed' : 'denied',
      tags: [gateName],
      reason,
    });

    this.logEntry(entry);
  }

  /**
   * Log API access
   */
  logAPIAccess(apiKey, caller, endpoint, statusCode, responseTime = 0) {
    const entry = this.buildEntry('api_access', {
      action: 'api_request',
      caller,
      metadata: {
        endpoint,
        statusCode,
        responseTime,
      },
    });

    this.logEntry(entry);
  }

  /**
   * Log MCP tool invocation
   */
  logMCPInvocation(toolName, caller, nodeCount = 0, filteredCount = 0) {
    const entry = this.buildEntry('mcp_tool', {
      action: 'tool_invoked',
      caller,
      metadata: {
        toolName,
        nodeCount,
        filteredCount,
      },
    });

    this.logEntry(entry);
  }

  /**
   * Export audit log (last N lines or time range)
   */
  export(filter = {}) {
    try {
      if (!existsSync(this.logPath)) {
        return [];
      }

      const lines = readFileSync(this.logPath, 'utf8')
        .split('\n')
        .filter((l) => l.trim());

      let entries = lines.map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      }).filter(Boolean);

      // Apply filters
      if (filter.caller) {
        entries = entries.filter((e) => e.caller === filter.caller);
      }

      if (filter.type) {
        entries = entries.filter((e) => e.type === filter.type);
      }

      if (filter.since) {
        const since = new Date(filter.since);
        entries = entries.filter((e) => new Date(e['@timestamp']) >= since);
      }

      if (filter.limit) {
        entries = entries.slice(-filter.limit);
      }

      return entries;
    } catch (err) {
      console.error('Failed to export audit log:', err);
      return [];
    }
  }

  /**
   * Generate audit summary
   */
  generateSummary(timeWindowMs = 3600000) {
    // 1 hour window
    const since = new Date(Date.now() - timeWindowMs);
    const entries = this.export({ since });

    const summary = {
      window: {
        start: since.toISOString(),
        end: new Date().toISOString(),
      },
      total: entries.length,
      byType: {},
      byCaller: {},
      denials: 0,
      grants: 0,
    };

    for (const entry of entries) {
      // By type
      summary.byType[entry.type] = (summary.byType[entry.type] || 0) + 1;

      // By caller
      summary.byCaller[entry.caller] = (summary.byCaller[entry.caller] || 0) + 1;

      // Denials/grants
      if (entry.type === 'denial') summary.denials++;
      if (entry.type === 'grant') summary.grants++;
    }

    return summary;
  }

  /**
   * Compliance report: denied queries grouped by node
   */
  getComplianceReport() {
    const entries = this.export({ type: 'denial' });
    const report = {
      generatedAt: new Date().toISOString(),
      totalDenials: entries.length,
      deniedNodes: {},
      byReason: {},
      byCaller: {},
    };

    for (const entry of entries) {
      const nodeId = entry.node || 'unknown';
      const reason = entry.reason || 'unknown';
      const caller = entry.caller || 'unknown';

      // By node
      if (!report.deniedNodes[nodeId]) {
        report.deniedNodes[nodeId] = {
          label: entry.nodeLabel,
          count: 0,
          callers: {},
        };
      }
      report.deniedNodes[nodeId].count++;
      report.deniedNodes[nodeId].callers[caller] =
        (report.deniedNodes[nodeId].callers[caller] || 0) + 1;

      // By reason
      report.byReason[reason] = (report.byReason[reason] || 0) + 1;

      // By caller
      report.byCaller[caller] = (report.byCaller[caller] || 0) + 1;
    }

    return report;
  }
}

/**
 * Global instance
 */
let globalAudit = null;

export function getAuditTrail() {
  if (!globalAudit) {
    globalAudit = new PermissionAuditTrail();
  }
  return globalAudit;
}

/**
 * Exported functions (convenience)
 */

export function logDenial(caller, nodeId, nodeLabel, tags, reason, metadata) {
  getAuditTrail().logDenial(caller, nodeId, nodeLabel, tags, reason, metadata);
}

export function logGrant(caller, nodeId, nodeLabel, tags, requestId) {
  getAuditTrail().logGrant(caller, nodeId, nodeLabel, tags, requestId);
}

export function logTokenValidation(status, hasToken, isValid, reason) {
  getAuditTrail().logTokenValidation(status, hasToken, isValid, reason);
}

export function logAPIAccess(apiKey, caller, endpoint, statusCode, responseTime) {
  getAuditTrail().logAPIAccess(apiKey, caller, endpoint, statusCode, responseTime);
}

export function getAuditSummary(timeWindowMs) {
  return getAuditTrail().generateSummary(timeWindowMs);
}

export function getComplianceReport() {
  return getAuditTrail().getComplianceReport();
}

export function exportAuditLog(filter) {
  return getAuditTrail().export(filter);
}

/**
 * CLI: Show audit log
 */
export function showAuditLog(args = {}) {
  const audit = getAuditTrail();

  if (args.summary) {
    const summary = audit.generateSummary(args.window || 3600000);
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }

  if (args.compliance) {
    const report = audit.getComplianceReport();
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  // Default: last N entries by type
  const type = args.type || 'denial';
  const limit = args.limit || 20;
  const entries = audit.export({ type, limit });

  console.log(`${type} (last ${limit}):`);
  for (const entry of entries) {
    console.log(JSON.stringify(entry, null, 2));
  }

  return entries;
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  const args = {};

  // Parse args
  for (let i = 3; i < process.argv.length; i++) {
    if (process.argv[i] === '--summary') args.summary = true;
    if (process.argv[i] === '--compliance') args.compliance = true;
    if (process.argv[i] === '--type') args.type = process.argv[++i];
    if (process.argv[i] === '--limit') args.limit = parseInt(process.argv[++i]);
    if (process.argv[i] === '--window') args.window = parseInt(process.argv[++i]);
  }

  if (cmd === 'show' || cmd === 'export') {
    showAuditLog(args);
  } else if (cmd === 'summary') {
    const summary = getAuditSummary(args.window);
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('usage: permission-audit.mjs [show|export|summary] [--type TYPE] [--limit N]');
    console.log('usage: permission-audit.mjs show --summary [--window MS]');
    console.log('usage: permission-audit.mjs show --compliance');
  }
}

export default {
  PermissionAuditTrail,
  getAuditTrail,
  logDenial,
  logGrant,
  logTokenValidation,
  logAPIAccess,
  getAuditSummary,
  getComplianceReport,
  exportAuditLog,
  showAuditLog,
};
