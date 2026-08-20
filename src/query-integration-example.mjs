#!/usr/bin/env node
/**
 * Query Integration Example: HA Permission Filter in Action
 *
 * Demonstrates how to integrate HAPermissionFilter into:
 * 1. Express.js REST API
 * 2. MCP tool wrapper
 * 3. Query engine middleware
 * 4. WebSocket streaming
 */

import HAPermissionFilter from './ha-permission-filter.mjs';
import {
  createQueryAuthMiddleware,
  createQueryHandler,
  QueryStreamHandler,
  PermissionAwareQueryEngine,
} from './query-engine-integration.mjs';
import {
  resolvePermissions,
  isNodeVisible,
  getVisibilityReport,
} from './permission-matrix.mjs';
import {
  getAuditTrail,
  logDenial,
  logGrant,
} from './permission-audit.mjs';

/**
 * Example 1: Express.js REST API with Permission Middleware
 */
export function createExampleAPI() {
  // Mock query engine
  const mockQueryEngine = {
    async query(params) {
      // Simulated query results with context gates
      return [
        {
          id: 'research.zerocopy-exploit',
          _label: 'ZeroCopy Exploit Analysis',
          context_gate_tags: ['research'],
          data: { description: 'Public research on ZeroCopy' },
        },
        {
          id: 'offense.c2-setup-guide',
          _label: 'C2 Setup & Operations',
          context_gate_tags: ['offense', 'infra'],
          data: { description: 'C2 panel deployment guide' },
        },
        {
          id: 'crypto.drainer-campaigns',
          _label: 'Active Drainer Campaigns',
          context_gate_tags: ['crypto', 'drainer-active'],
          data: { description: 'Live drainer operational data' },
        },
        {
          id: 'defense.hardening-guide',
          _label: 'Security Hardening',
          context_gate_tags: ['defense'],
          data: { description: 'System hardening best practices' },
        },
      ];
    },
  };

  // API keys (in real app, use secret store)
  const apiKeys = {
    'key_claude_123': 'claude',
    'key_grok_456': 'grok',
    'key_kimi_789': 'kimi',
  };

  return {
    mockQueryEngine,
    apiKeys,

    // Route handler
    async handleQueryRequest(req, res) {
      const handler = createQueryHandler(mockQueryEngine, apiKeys);
      return handler(req, res);
    },

    // Get middleware
    getAuthMiddleware() {
      return createQueryAuthMiddleware(apiKeys);
    },
  };
}

/**
 * Example 2: MCP Tool Wrapper
 */
export class MockMCPQueryTool {
  constructor() {
    this.filter = new HAPermissionFilter();
    this.audit = getAuditTrail();
  }

  /**
   * MCP tool: query
   */
  async query(params = {}) {
    const { caller } = this.filter.determineCaller();
    const { valid: tokenValid, isArmed } = this.filter.validateHAToken();

    // Simulated results
    const allResults = [
      {
        id: 'research.exploit-patterns',
        _label: 'Exploit Patterns Research',
        context_gate_tags: ['research'],
      },
      {
        id: 'offense.infection-vectors',
        _label: 'Infection Vectors',
        context_gate_tags: ['offense'],
      },
      {
        id: 'infra.c2-infrastructure',
        _label: 'C2 Infrastructure Setup',
        context_gate_tags: ['infra', 'c2-commands'],
      },
    ];

    // Filter by permission
    const filtered = [];
    for (const node of allResults) {
      const visible = this.filter.isNodeVisible(node, caller, {
        armed: tokenValid && isArmed,
        nuclear: isArmed,
      });

      if (visible) {
        filtered.push(node);
        this.audit.logGrant(caller, node.id, node._label, node.context_gate_tags);
      } else {
        this.audit.logDenial(
          caller,
          node.id,
          node._label,
          node.context_gate_tags,
          'insufficient_permissions'
        );
      }
    }

    return {
      success: true,
      caller,
      nodeCount: allResults.length,
      filteredCount: filtered.length,
      results: filtered,
    };
  }
}

/**
 * Example 3: Direct Usage Pattern
 */
export async function exampleDirectUsage() {
  console.log('\n=== Example: Direct Permission Filter Usage ===\n');

  const filter = new HAPermissionFilter();
  const audit = getAuditTrail();

  // Check HA status
  const haStatus = filter.validateHAToken();
  console.log('HA Status:', haStatus);

  // Determine caller
  const { caller, confidence } = filter.determineCaller();
  console.log(`Caller: ${caller} (${confidence})`);

  // Get permissions
  const perms = resolvePermissions(caller, {
    armed: haStatus.valid && haStatus.isArmed,
    nuclear: haStatus.isArmed,
  });
  console.log('Allowed Tags:', perms.effective);

  // Simulate nodes
  const nodes = [
    {
      id: 'research.ai-safety',
      _label: 'AI Safety Paper',
      context_gate_tags: ['research'],
    },
    {
      id: 'offense.exploit-kit',
      _label: 'Exploit Kit Tutorial',
      context_gate_tags: ['offense', 'infra'],
    },
    {
      id: 'crypto.market-data',
      _label: 'Crypto Market Analysis',
      context_gate_tags: ['crypto'],
    },
  ];

  // Filter nodes
  console.log('\nNode Visibility:');
  for (const node of nodes) {
    const visible = filter.isNodeVisible(node, caller, {
      armed: haStatus.valid && haStatus.isArmed,
      nuclear: haStatus.isArmed,
    });

    const status = visible ? '✓ VISIBLE' : '✗ HIDDEN';
    console.log(`  ${status}: ${node._label}`);

    if (!visible) {
      audit.logDenial(
        caller,
        node.id,
        node._label,
        node.context_gate_tags
      );
    }
  }

  // Permission report
  console.log('\nPermission Report:');
  const report = filter.getPermissionReport(caller, haStatus.valid && haStatus.isArmed);
  console.log(JSON.stringify(report, null, 2));
}

/**
 * Example 4: Permission Matrix Audit
 */
export async function examplePermissionMatrixAudit() {
  console.log('\n=== Example: Permission Matrix Audit ===\n');

  const llms = ['claude', 'grok', 'kimi', 'fable'];
  const modes = [
    { armed: false, nuclear: false, label: 'Standard' },
    { armed: true, nuclear: false, label: 'HA (standard)' },
    { armed: true, nuclear: true, label: 'HA (nuclear)' },
  ];

  for (const llm of llms) {
    console.log(`\n${llm.toUpperCase()}:`);
    for (const mode of modes) {
      const perms = resolvePermissions(llm, mode);
      console.log(
        `  ${mode.label}: ${perms.effective.join(', ')}`
      );
    }
  }
}

/**
 * Example 5: Compliance Audit Report
 */
export async function exampleComplianceReport() {
  console.log('\n=== Example: Compliance Report ===\n');

  const audit = getAuditTrail();

  // Generate report
  const report = audit.getComplianceReport();
  console.log(JSON.stringify(report, null, 2));
}

/**
 * Example 6: WebSocket Streaming
 */
export async function exampleWebSocketHandler() {
  console.log('\n=== Example: WebSocket Query Stream ===\n');

  const filter = new HAPermissionFilter();

  // Simulate incoming WebSocket messages
  const incomingQueries = [
    { queryId: '1', requiresGates: ['research'] },
    { queryId: '2', requiresGates: ['offense'] },
    { queryId: '3', requiresGates: ['crypto'] },
  ];

  const { caller } = filter.determineCaller();
  const { valid: tokenValid, isArmed } = filter.validateHAToken();
  const allowedTags = filter.getAllowedTags(caller, tokenValid && isArmed);

  console.log(`Caller: ${caller}`);
  console.log(`Allowed: ${allowedTags.join(', ')}\n`);

  for (const query of incomingQueries) {
    const allowed = query.requiresGates.some((gate) =>
      allowedTags.includes(gate)
    );

    if (allowed) {
      console.log(`✓ Query ${query.queryId}: ALLOWED`);
    } else {
      console.log(`✗ Query ${query.queryId}: DENIED`);
      console.log(`  Required: ${query.requiresGates.join(', ')}`);
    }
  }
}

/**
 * Main: Run all examples
 */
async function runExamples() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Query Integration: HA Permission Filter Examples  ║');
  console.log('╚════════════════════════════════════════════════════╝');

  try {
    await exampleDirectUsage();
    await examplePermissionMatrixAudit();
    await exampleWebSocketHandler();
    await exampleComplianceReport();

    console.log('\n✓ All examples completed');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];

  switch (cmd) {
    case 'direct':
      exampleDirectUsage();
      break;
    case 'matrix':
      examplePermissionMatrixAudit();
      break;
    case 'websocket':
      exampleWebSocketHandler();
      break;
    case 'compliance':
      exampleComplianceReport();
      break;
    case 'api':
      {
        const api = createExampleAPI();
        console.log('API Example created');
        console.log('API Keys:', api.apiKeys);
      }
      break;
    default:
      runExamples();
  }
}

export default {
  createExampleAPI,
  MockMCPQueryTool,
  exampleDirectUsage,
  examplePermissionMatrixAudit,
  exampleComplianceReport,
  exampleWebSocketHandler,
  runExamples,
};
