#!/usr/bin/env node
/**
 * Comprehensive Test Suite for HA Permission Filter System
 */

import HAPermissionFilter from './ha-permission-filter.mjs';
import { checkHA, getHAStatus } from './ha-status-check.mjs';
import {
  resolvePermissions,
  isNodeVisible,
  auditNodeVisibility,
} from './permission-matrix.mjs';
import { getAuditTrail } from './permission-audit.mjs';

const TESTS = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  TESTS.push({ name, fn });
}

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     HA Permission Filter - Comprehensive Test Suite     ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  for (const { name, fn } of TESTS) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`✗ ${name}`);
      console.log(`  Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// ==============================================================================
// Test Suite
// ==============================================================================

test('HAPermissionFilter: Token validation', () => {
  const filter = new HAPermissionFilter();
  const result = filter.validateHAToken();
  if (!result.valid) throw new Error('Token should be valid');
  if (!result.isArmed) throw new Error('Should be armed');
});

test('HAPermissionFilter: Caller detection', () => {
  const filter = new HAPermissionFilter();
  const { caller, confidence } = filter.determineCaller();
  if (!caller) throw new Error('Caller should be detected');
  if (!['claude', 'grok', 'kimi', 'fable'].includes(caller)) {
    throw new Error(`Invalid caller: ${caller}`);
  }
});

test('HAPermissionFilter: Get allowed tags', () => {
  const filter = new HAPermissionFilter();
  const tags = filter.getAllowedTags('claude', false);
  if (!tags.includes('research')) throw new Error('Missing research tag');
  if (!tags.includes('defense')) throw new Error('Missing defense tag');
  if (tags.includes('offense')) throw new Error('Should not have offense without HA');
});

test('HAPermissionFilter: Node visibility - research visible', () => {
  const filter = new HAPermissionFilter();
  const node = { id: 'n1', context_gate_tags: ['research'] };
  const visible = filter.isNodeVisible(node, 'claude', false);
  if (!visible) throw new Error('Research should be visible');
});

test('HAPermissionFilter: No gate tags = visible to all', () => {
  const filter = new HAPermissionFilter();
  const node = { id: 'n1', data: 'test' };
  const visible = filter.isNodeVisible(node, 'claude', false);
  if (!visible) throw new Error('No-tag nodes should be visible');
});

test('HAPermissionFilter: Expiry check', () => {
  const filter = new HAPermissionFilter();
  const { expiring, timeRemaining } = filter.checkHAExpiry();
  if (expiring) throw new Error('Token should not be expiring');
  if (timeRemaining < 0) throw new Error('Should have positive time remaining');
});

test('HAPermissionFilter: Permission report', () => {
  const filter = new HAPermissionFilter();
  const report = filter.getPermissionReport('grok', true);
  if (!report.canSeeOffense) throw new Error('Grok should see offense');
  if (!report.canSeeInfra) throw new Error('Grok should see infra');
  if (!report.canSeeCrypto) throw new Error('Grok should see crypto');
});

test('HAStatusChecker: Quick status', () => {
  const status = checkHA();
  if (!status.armed) throw new Error('Should be armed');
  if (!status.nuclear) throw new Error('Should be nuclear');
  if (!status.tokenValid) throw new Error('Token should be valid');
});

test('HAStatusChecker: Detailed report', () => {
  const status = getHAStatus();
  if (!status.status.armed) throw new Error('Should be armed');
  if (!status.multiLLM.grok) throw new Error('Should have grok entry');
});

test('PermissionMatrix: Resolve claude (no HA)', () => {
  const perms = resolvePermissions('claude', { armed: false });
  if (!perms.effective.includes('research')) throw new Error('Missing research');
  if (!perms.effective.includes('defense')) throw new Error('Missing defense');
  if (perms.effective.includes('offense')) throw new Error('Should not have offense');
});

test('PermissionMatrix: Resolve claude (HA)', () => {
  const perms = resolvePermissions('claude', { armed: true, nuclear: true });
  if (!perms.effective.includes('offense')) throw new Error('Missing offense');
  if (!perms.effective.includes('infra')) throw new Error('Missing infra');
});

test('PermissionMatrix: Resolve grok (HA + nuclear)', () => {
  const perms = resolvePermissions('grok', { armed: true, nuclear: true });
  if (!perms.effective.includes('offense')) throw new Error('Missing offense');
  if (!perms.effective.includes('crypto')) throw new Error('Missing crypto');
  if (!perms.effective.includes('infra')) throw new Error('Missing infra');
});

test('PermissionMatrix: Resolve kimi (HA)', () => {
  const perms = resolvePermissions('kimi', { armed: true });
  if (!perms.effective.includes('research')) throw new Error('Missing research');
  if (!perms.effective.includes('crypto')) throw new Error('Missing crypto');
  if (perms.effective.includes('offense')) throw new Error('Should not have offense');
  if (perms.effective.includes('infra')) throw new Error('Should not have infra');
});

test('PermissionMatrix: isNodeVisible - research always', () => {
  const node = { id: 'n1', context_gate_tags: ['research'] };
  const vis1 = isNodeVisible(node, 'claude', { armed: false });
  const vis2 = isNodeVisible(node, 'kimi', { armed: false });
  if (!vis1 || !vis2) throw new Error('Research should be visible to all');
});

test('PermissionMatrix: isNodeVisible - offense gating', () => {
  const node = { id: 'n1', context_gate_tags: ['offense'] };
  const claude = isNodeVisible(node, 'claude', { armed: false, nuclear: false });
  const grok = isNodeVisible(node, 'grok', { armed: true, nuclear: true });
  if (claude) throw new Error('Claude should not see offense without HA');
  if (!grok) throw new Error('Grok should see offense with HA+nuclear');
});

test('PermissionMatrix: auditNodeVisibility', () => {
  const node = { id: 'n1', context_gate_tags: ['offense'] };
  const audit = auditNodeVisibility(node, 'claude', { armed: false });
  if (audit.visible) throw new Error('Should be hidden');
  if (audit.reasons.length === 0) throw new Error('Should have reasons');
});

test('PermissionAudit: Logging', () => {
  const audit = getAuditTrail();
  audit.logDenial('test', 'node-test', 'Test Node', ['research'], 'test');
  audit.logGrant('test', 'node-test', 'Test Node', ['research']);
  // Just verify no error thrown
});

test('PermissionAudit: Summary', () => {
  const audit = getAuditTrail();
  const summary = audit.generateSummary();
  if (typeof summary.total !== 'number') throw new Error('Should have total count');
  if (!summary.byType) throw new Error('Should have type breakdown');
});

test('PermissionAudit: Compliance report', () => {
  const audit = getAuditTrail();
  const report = audit.getComplianceReport();
  if (typeof report.totalDenials !== 'number') {
    throw new Error('Should have denial count');
  }
});

test('PermissionAudit: Export with filter', () => {
  const audit = getAuditTrail();
  const entries = audit.export({ limit: 10 });
  if (!Array.isArray(entries)) throw new Error('Should return array');
});

test('Node filtering: Direct checks', async () => {
  // Test using permission-matrix functions directly
  const node1 = { id: 'n1', context_gate_tags: ['research'] };
  const node2 = { id: 'n2', context_gate_tags: ['offense'] };
  
  // Research visible to all
  if (!isNodeVisible(node1, 'claude', { armed: false })) {
    throw new Error('Claude should see research');
  }
  
  // Offense hidden without HA
  if (isNodeVisible(node2, 'claude', { armed: false, nuclear: false })) {
    throw new Error('Claude should not see offense without HA');
  }
  
  // Offense visible with HA+nuclear
  if (!isNodeVisible(node2, 'claude', { armed: true, nuclear: true })) {
    throw new Error('Claude should see offense with HA+nuclear');
  }
});

test('Batch filtering: Graph format', async () => {
  const filter = new HAPermissionFilter();
  const results = {
    nodes: [
      { id: 'n1', context_gate_tags: ['research'] },
      { id: 'n2', context_gate_tags: ['offense'] },
    ],
    edges: [
      { from: 'n1', to: 'n2' },
    ],
  };

  const filtered = await filter.filterQueryResults(results, {
    model: 'grok',
  });

  if (!filtered.nodes) throw new Error('Should have nodes');
  if (!filtered.edges) throw new Error('Should have edges');
  if (!filtered.metadata) throw new Error('Should have metadata');
});

test('Kimi restrictions: No offense/infra', () => {
  const node1 = { id: 'n1', context_gate_tags: ['offense'] };
  const node2 = { id: 'n2', context_gate_tags: ['infra'] };
  
  // Kimi should never see offense/infra even with HA
  if (isNodeVisible(node1, 'kimi', { armed: true, nuclear: true })) {
    throw new Error('Kimi should not see offense even with HA');
  }
  if (isNodeVisible(node2, 'kimi', { armed: true, nuclear: true })) {
    throw new Error('Kimi should not see infra even with HA');
  }
});

test('Fable inheritance: Parent permissions', () => {
  // Fable should inherit from claude (default parent)
  const node1 = { id: 'n1', context_gate_tags: ['research'] };
  const node2 = { id: 'n2', context_gate_tags: ['offense'] };
  
  if (!isNodeVisible(node1, 'fable', { armed: false })) {
    throw new Error('Fable should see research');
  }
  if (isNodeVisible(node2, 'fable', { armed: true, nuclear: true })) {
    throw new Error('Fable should not see offense (restricted)');
  }
});

// Run all tests
runTests();
