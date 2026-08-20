#!/usr/bin/env node
/**
 * test-subagent-inheritance.mjs
 * Comprehensive test suite for HA subagent inheritance and fallback
 *
 * Tests:
 * 1. Parent HA armed → spawn subagent with token
 * 2. Parent HA armed → spawn subagent → token expires mid-execution
 * 3. Parent HA NOT armed → spawn subagent (restricted mode)
 * 4. Parent HA invalid token → spawn subagent (restricted mode)
 * 5. Grandchild subagent (subagent spawns another subagent)
 *
 * Run: node test-subagent-inheritance.mjs
 */

import { getHAContext, inheritHAFromParent, validateTokenForSubagent, prepareSubagentEnvironment, getTimeUntilExpiry } from './ha-subagent-wrapper.mjs'
import {
  getCurrentMode,
  getModeStatus,
  activateRestrictedMode,
  switchToArmedMode,
  isNodeAllowedInCurrentMode,
  applyRestrictedFilter,
  getRestrictionStats
} from './subagent-fallback-mode.mjs'
import { HAMCPIntegration, initializeHAIntegration, shutdownHAIntegration } from './mcp-ha-integration.mjs'

// ─────────────────────────────────────────────────────────────
// Test Framework
// ─────────────────────────────────────────────────────────────

const tests = []
let passCount = 0
let failCount = 0

function describe(name, fn) {
  tests.push({ name, fn })
}

function it(description, fn) {
  return fn
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected} but got ${actual}: ${message}`)
  }
}

function assertTrue(value, message) {
  assert(value === true, message)
}

function assertFalse(value, message) {
  assert(value === false, message)
}

function assertExists(value, message) {
  assert(value !== null && value !== undefined, message)
}

function assertArrayIncludes(arr, value, message) {
  assert(Array.isArray(arr) && arr.includes(value), message)
}

// ─────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────

describe('Test 1: Parent HA armed → spawn subagent with token', () => {
  return it('Subagent should inherit HA token and have full access', () => {
    // Set up parent HA context
    process.env.NODE_ENV = 'test'

    // Simulate parent having valid HA token
    const mockToken = 'ha_' + 'a'.repeat(48)
    const mockExpires = new Date(Date.now() + 3600000).toISOString() // 1 hour from now

    process.env.GROK_HARD_ALLOW_TOKEN_INHERITED = mockToken
    process.env.GROK_HARD_ALLOW_TOKEN_EXPIRES_INHERITED = mockExpires
    process.env.GROK_HA_INHERITANCE_DEPTH = '1'

    // Clear cache to force re-evaluation
    const context = getHAContext()

    // Assert inheritance
    assertTrue(context.isValid, 'Token should be valid')
    assertEqual(context.source, 'inherited', 'Source should be inherited')
    assertEqual(context.chainDepth, 1, 'Chain depth should be 1')

    // Clear env
    delete process.env.GROK_HARD_ALLOW_TOKEN_INHERITED
    delete process.env.GROK_HARD_ALLOW_TOKEN_EXPIRES_INHERITED
    delete process.env.GROK_HA_INHERITANCE_DEPTH
  })
})

describe('Test 2: Token expires mid-execution', () => {
  return it('Should gracefully degrade to restricted mode when token expires', () => {
    // Start in armed mode
    switchToArmedMode('Initial armed state')
    assertEqual(getCurrentMode(), 'HA_ARMED', 'Should start in armed mode')

    // Simulate token expiring
    activateRestrictedMode('Token expired during execution')
    assertEqual(getCurrentMode(), 'RESTRICTED', 'Should switch to restricted mode')

    const status = getModeStatus()
    assertTrue(status.isRestricted, 'Status should indicate restricted mode')
    assertArrayIncludes(status.reason.toLowerCase(), 'expired', 'Reason should mention expiry')
  })
})

describe('Test 3: Parent HA NOT armed → spawn subagent (restricted mode)', () => {
  return it('Subagent without parent HA should activate restricted mode', () => {
    process.env.NODE_ENV = 'test'

    // Clear inherited token env vars (simulating no parent HA)
    delete process.env.GROK_HARD_ALLOW_TOKEN_INHERITED
    delete process.env.GROK_HARD_ALLOW_TOKEN_EXPIRES_INHERITED
    delete process.env.GROK_HA_INHERITANCE_DEPTH

    const context = getHAContext()

    assertFalse(context.isValid, 'Token should not be valid without parent HA')
    assertEqual(context.source, 'none', 'Source should be none')

    // Activate restricted mode
    activateRestrictedMode('No parent HA token')
    assertEqual(getCurrentMode(), 'RESTRICTED', 'Should be in restricted mode')

    // Verify dangerous nodes are blocked
    const dangerousNodeTags = ['crypto-drainer', 'c2-commands', 'offense']
    dangerousNodeTags.forEach(tag => {
      assertFalse(
        isNodeAllowedInCurrentMode('dangerous-node', [tag]),
        `Node with tag ${tag} should be blocked in restricted mode`
      )
    })

    // Verify safe nodes are allowed
    const safeNodeTags = ['research', 'defense', 'base']
    safeNodeTags.forEach(tag => {
      assertTrue(
        isNodeAllowedInCurrentMode('safe-node', [tag]),
        `Node with tag ${tag} should be allowed in restricted mode`
      )
    })
  })
})

describe('Test 4: Invalid parent token → restricted mode', () => {
  return it('Subagent with invalid parent token should use restricted mode', () => {
    process.env.NODE_ENV = 'test'

    // Set invalid token (wrong format)
    process.env.GROK_HARD_ALLOW_TOKEN_INHERITED = 'invalid_token_format'
    process.env.GROK_HARD_ALLOW_TOKEN_EXPIRES_INHERITED = new Date(Date.now() + 3600000).toISOString()

    const context = getHAContext()

    assertFalse(context.isValid, 'Invalid token should not be valid')
    assertArrayIncludes(context.validationReason.toLowerCase(), 'invalid', 'Reason should mention invalid format')

    // Clean up
    delete process.env.GROK_HARD_ALLOW_TOKEN_INHERITED
    delete process.env.GROK_HARD_ALLOW_TOKEN_EXPIRES_INHERITED
  })
})

describe('Test 5: Grandchild subagent (inheritance chain)', () => {
  return it('Token should chain through parent → child → grandchild', () => {
    process.env.NODE_ENV = 'test'

    // Simulate grandchild (chain depth = 2)
    const mockToken = 'ha_' + 'b'.repeat(48)
    const mockExpires = new Date(Date.now() + 3600000).toISOString()

    process.env.GROK_HARD_ALLOW_TOKEN_INHERITED = mockToken
    process.env.GROK_HARD_ALLOW_TOKEN_EXPIRES_INHERITED = mockExpires
    process.env.GROK_HA_INHERITANCE_DEPTH = '2'

    const context = getHAContext()

    assertTrue(context.isValid, 'Token should be valid in grandchild')
    assertEqual(context.chainDepth, 2, 'Chain depth should be 2')
    assertEqual(context.source, 'inherited', 'Source should be inherited')

    // Verify prepare for great-grandchild
    const env = prepareSubagentEnvironment(process.env)
    assertTrue(env.prepared, 'Should be able to prepare great-grandchild env')
    assertEqual(env.env.GROK_HA_INHERITANCE_DEPTH, '3', 'Great-grandchild should have depth 3')

    // Clean up
    delete process.env.GROK_HARD_ALLOW_TOKEN_INHERITED
    delete process.env.GROK_HARD_ALLOW_TOKEN_EXPIRES_INHERITED
    delete process.env.GROK_HA_INHERITANCE_DEPTH
  })
})

describe('Test 6: Node filtering in restricted mode', () => {
  return it('Should filter dangerous nodes while allowing safe ones', () => {
    activateRestrictedMode('Testing node filtering')

    const nodes = [
      { id: 'safe-1', tags: ['research'] },
      { id: 'safe-2', tags: ['defense'] },
      { id: 'dangerous-1', tags: ['crypto-drainer'] },
      { id: 'dangerous-2', tags: ['c2-commands'] },
      { id: 'safe-3', tags: ['base'] },
      { id: 'dangerous-3', tags: ['offense'] },
    ]

    const result = applyRestrictedFilter(nodes)

    assertTrue(result.filtered, 'Some nodes should be filtered')
    assertEqual(result.blockedCount, 3, 'Should block 3 dangerous nodes')
    assertEqual(result.results.length, 3, 'Should return 3 safe nodes')

    // Verify only safe nodes remain
    result.results.forEach(node => {
      assertArrayIncludes(['safe-1', 'safe-2', 'safe-3'], node.id, `Safe node ${node.id} should be in results`)
    })
  })
})

describe('Test 7: Token expiry time calculation', () => {
  return it('Should accurately calculate time until token expires', () => {
    const now = new Date()
    const in5minutes = new Date(now.getTime() + 300000)

    const timeLeft = getTimeUntilExpiry(in5minutes.toISOString())

    assertExists(timeLeft, 'Should return time info')
    assertFalse(timeLeft.expired, 'Token should not be expired')
    assert(timeLeft.ms > 0, 'Milliseconds should be positive')
    assert(timeLeft.minutes >= 4, 'Should show ~5 minutes remaining')
  })
})

describe('Test 8: MCP HA Integration initialization', () => {
  return it('Should initialize and track HA state through pipeline', async () => {
    process.env.NODE_ENV = 'test'

    const integration = new HAMCPIntegration()
    integration.initialize()

    assertTrue(integration.initialized, 'Should be initialized')
    assertExists(integration.haContext, 'Should have HA context')
    assertExists(integration.modeStatus, 'Should have mode status')

    const status = integration.getStatus()
    assertExists(status.mode, 'Status should have mode')
    assertExists(status.modeStatus, 'Status should have mode details')

    integration.shutdown()
  })
})

describe('Test 9: Query wrapping with HA context', () => {
  return it('Should wrap queries and apply mode-aware filtering', async () => {
    const integration = new HAMCPIntegration()
    integration.initialize()

    activateRestrictedMode('Testing query wrapping')

    // Mock query function that returns nodes
    const mockQueryFn = async () => ({
      results: [
        { id: 'node1', tags: ['research'] },
        { id: 'node2', tags: ['crypto-drainer'] },
        { id: 'node3', tags: ['defense'] },
      ]
    })

    const result = await integration.wrapQuery({ query: 'test' }, mockQueryFn)

    assertExists(result._haContext, 'Result should have HA context metadata')
    assertEqual(result._haContext.mode, 'RESTRICTED', 'Should show current mode')
    assertTrue(result._haContext.filtered, 'Results should be filtered')

    integration.shutdown()
  })
})

describe('Test 10: Restriction audit trail', () => {
  return it('Should maintain audit trail of restrictions', () => {
    activateRestrictedMode('Testing audit trail')

    // Apply filtering to generate restrictions
    const nodes = [
      { id: 'node1', tags: ['crypto-drainer'] },
      { id: 'node2', tags: ['c2-commands'] },
      { id: 'node3', tags: ['offense'] },
    ]

    applyRestrictedFilter(nodes)

    const stats = getRestrictionStats()

    assertExists(stats, 'Should return stats')
    assert(stats.totalRestrictions > 0, 'Should have recorded restrictions')
  })
})

// ─────────────────────────────────────────────────────────────
// Test Runner
// ─────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log('║   HA SUBAGENT INHERITANCE TEST SUITE                      ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')

  for (const test of tests) {
    try {
      const fn = test.fn
      if (fn && typeof fn === 'function') {
        await fn()
      }
      console.log(`✅ ${test.name}`)
      passCount++
    } catch (error) {
      console.log(`❌ ${test.name}`)
      console.log(`   Error: ${error.message}`)
      failCount++
    }
  }

  console.log('\n' + '═'.repeat(60))
  console.log(`Results: ${passCount} passed, ${failCount} failed`)
  console.log('═'.repeat(60) + '\n')

  process.exit(failCount > 0 ? 1 : 0)
}

// Run tests
runTests().catch((error) => {
  console.error('Test suite error:', error)
  process.exit(1)
})
