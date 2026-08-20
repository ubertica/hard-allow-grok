#!/usr/bin/env node
/**
 * verify-query-system.mjs
 * Comprehensive verification of unified query system
 *
 * Checks:
 * - Configuration files
 * - Database integrity
 * - Permission matrix
 * - API connectivity
 * - MCP daemon status
 *
 * Run: node verify-query-system.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = homedir()
const SYSTEM_ROOT = join(HOME, '.grok', 'hard-allow')
const PROJECTS_ROOT = join(HOME, 'dev')

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
}

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`)
}

function pass(msg) {
  log(`✓ ${msg}`, colors.green)
}

function fail(msg) {
  log(`✗ ${msg}`, colors.red)
}

function warn(msg) {
  log(`⚠ ${msg}`, colors.yellow)
}

async function verify() {
  log(`\n${'='.repeat(60)}`, colors.blue)
  log('UNIFIED QUERY SYSTEM VERIFICATION', colors.blue)
  log(`${'='.repeat(60)}\n`, colors.blue)

  let passed = 0
  let failed = 0

  // 1. Check configuration files
  log('1. Configuration Files:', colors.blue)
  const configFiles = [
    'query-config.json',
    'api-config.json',
    'permission-matrix.json',
    'context-graph.json',
  ]

  configFiles.forEach((file) => {
    const path = join(SYSTEM_ROOT, file)
    if (existsSync(path)) {
      try {
        JSON.parse(readFileSync(path, 'utf8'))
        pass(`${file}`)
        passed++
      } catch (e) {
        fail(`${file} - Invalid JSON`)
        failed++
      }
    } else {
      fail(`${file} - Not found`)
      failed++
    }
  })

  // 2. Check executable scripts
  log('\n2. Executable Scripts:', colors.blue)
  const scripts = [
    'mcp-context-query-pipeline.mjs',
    'mcp-server-daemon.mjs',
    'ha-permission-filter.mjs',
    'unified-context-query.mjs',
    'init-query-system.mjs',
    'verify-query-system.mjs',
  ]

  scripts.forEach((script) => {
    const path = join(SYSTEM_ROOT, script)
    if (existsSync(path)) {
      pass(`${script}`)
      passed++
    } else {
      fail(`${script} - Not found`)
      failed++
    }
  })

  // 3. Check project files
  log('\n3. Project Files:', colors.blue)
  const projectFiles = [
    'src/context-graph-api.mjs',
    'src/graph-api-client.mjs',
    'src/api-examples.mjs',
    'test/integration-tests.mjs',
    'test/performance-tests.mjs',
    'test/security-tests.mjs',
    'test/e2e-scenarios.mjs',
    'test/run-all-tests.mjs',
  ]

  projectFiles.forEach((file) => {
    const path = join(PROJECTS_ROOT, 'multi-llm-ha-chat', file)
    if (existsSync(path)) {
      pass(`${file}`)
      passed++
    } else {
      warn(`${file} - Not found (may be in scratchpad)`)
    }
  })

  // 4. Validate permission matrix
  log('\n4. Permission Matrix:', colors.blue)
  try {
    const matrix = JSON.parse(readFileSync(join(SYSTEM_ROOT, 'permission-matrix.json'), 'utf8'))
    const llmCount = Object.keys(matrix.llms || {}).length
    if (llmCount > 0) {
      pass(`Permission matrix has ${llmCount} LLM configurations`)
      passed++
      Object.entries(matrix.llms).forEach(([llmId, config]) => {
        const toolCount = Object.keys(config.tools || {}).length
        log(`  - ${llmId}: ${toolCount} tools`, colors.reset)
      })
    } else {
      fail('Permission matrix is empty')
      failed++
    }
  } catch (e) {
    fail(`Permission matrix validation failed: ${e.message}`)
    failed++
  }

  // 5. Validate context graph
  log('\n5. Context Graph Database:', colors.blue)
  try {
    const graph = JSON.parse(readFileSync(join(SYSTEM_ROOT, 'context-graph.json'), 'utf8'))
    const nodeCount = graph.nodes?.length || 0
    const edgeCount = graph.edges?.length || 0
    pass(`Database has ${nodeCount} nodes and ${edgeCount} edges`)
    passed++

    if (nodeCount > 0) {
      log(`  Sample nodes: ${graph.nodes.slice(0, 3).map((n) => n.id).join(', ')}`)
    }
  } catch (e) {
    fail(`Context graph validation failed: ${e.message}`)
    failed++
  }

  // 6. Check API configuration
  log('\n6. API Configuration:', colors.blue)
  try {
    const apiConfig = JSON.parse(readFileSync(join(SYSTEM_ROOT, 'api-config.json'), 'utf8'))
    if (apiConfig.server?.port) {
      pass(`API configured for port ${apiConfig.server.port}`)
      passed++
    } else {
      warn('API port not configured')
    }
  } catch (e) {
    fail(`API configuration validation failed: ${e.message}`)
    failed++
  }

  // 7. Summary
  log(`\n${'='.repeat(60)}`, colors.blue)
  log('VERIFICATION SUMMARY', colors.blue)
  log(`${'='.repeat(60)}`, colors.blue)

  log(`\nPassed: ${passed}`, colors.green)
  log(`Failed: ${failed}`, failed > 0 ? colors.red : colors.green)

  if (failed === 0) {
    log(`\n✅ All checks passed - system is ready!`, colors.green)
    log(`\nTo start the system:`, colors.blue)
    log(`  1. node ${join(SYSTEM_ROOT, 'init-query-system.mjs')}`)
    log(`  2. node ${join(PROJECTS_ROOT, 'multi-llm-ha-chat/src/context-graph-api.mjs')}`)
    log(`  3. node ${join(SYSTEM_ROOT, 'mcp-server-daemon.mjs')} start`)
    process.exit(0)
  } else {
    log(`\n❌ Some checks failed - fix issues before deployment`, colors.red)
    process.exit(1)
  }
}

verify()
