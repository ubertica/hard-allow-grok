#!/usr/bin/env node
/**
 * init-query-system.mjs
 * Initialize the unified query system for production
 *
 * Sets up:
 * - Directory structure
 * - Configuration files
 * - Permission matrices
 * - Context database
 * - Daemon registration
 *
 * Run: node init-query-system.mjs
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = homedir()
const SYSTEM_ROOT = join(HOME, '.grok', 'hard-allow')
const PROJECTS_ROOT = join(HOME, 'dev')

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
}

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`)
}

function step(msg) {
  log(`\n${msg}`, colors.blue)
}

function success(msg) {
  log(`✓ ${msg}`, colors.green)
}

function error(msg) {
  log(`✗ ${msg}`, colors.red)
}

async function initSystem() {
  try {
    step('INITIALIZING UNIFIED QUERY SYSTEM')

    // 1. Create directories
    step('\n1. Creating directory structure...')
    const dirs = [
      SYSTEM_ROOT,
      join(PROJECTS_ROOT, 'multi-llm-ha-chat', 'src'),
      join(PROJECTS_ROOT, 'multi-llm-ha-chat', 'test'),
      join(PROJECTS_ROOT, 'semantic-memory', 'src'),
    ]

    dirs.forEach((dir) => {
      mkdirSync(dir, { recursive: true })
      success(`Created: ${dir}`)
    })

    // 2. Initialize configuration
    step('\n2. Creating configuration files...')

    const queryConfig = {
      system: 'unified-query-orchestrator',
      version: '1.0.0',
      initialized: new Date().toISOString(),
      api: {
        host: '127.0.0.1',
        port: 7777,
        timeout: 10000,
      },
      cache: {
        maxSize: 1000,
        ttl: 3600000,
      },
      llms: {
        claude: { role: 'primary', enabled: true },
        grok: { role: 'secondary', enabled: true },
        kimi: { role: 'tertiary', enabled: true },
      },
    }

    writeFileSync(join(SYSTEM_ROOT, 'query-config.json'), JSON.stringify(queryConfig, null, 2))
    success('Created: query-config.json')

    // 3. Create permission matrix
    step('\n3. Initializing permission matrix...')

    const permissionMatrix = {
      llms: {
        claude: {
          role: 'primary',
          tools: {
            query_context: { allowed: true, rateLimit: 100 },
            add_context_node: { allowed: true, rateLimit: 50 },
            link_context_nodes: { allowed: true, rateLimit: 50 },
            get_related_context: { allowed: true, rateLimit: 100 },
            get_context_stats: { allowed: true, rateLimit: 100 },
          },
          contextAccess: {
            ownContexts: true,
            publicContexts: true,
            sharedContexts: true,
            allContexts: false,
          },
        },
        grok: {
          role: 'secondary',
          tools: {
            query_context: { allowed: true, rateLimit: 50 },
            get_related_context: { allowed: true, rateLimit: 50 },
            get_context_stats: { allowed: true, rateLimit: 50 },
            add_context_node: { allowed: false },
            link_context_nodes: { allowed: false },
          },
          contextAccess: {
            ownContexts: true,
            publicContexts: true,
            sharedContexts: false,
            allContexts: false,
          },
        },
        kimi: {
          role: 'tertiary',
          tools: {
            query_context: { allowed: true, rateLimit: 25 },
            get_related_context: { allowed: true, rateLimit: 25 },
            get_context_stats: { allowed: false },
            add_context_node: { allowed: false },
            link_context_nodes: { allowed: false },
          },
          contextAccess: {
            ownContexts: true,
            publicContexts: true,
            sharedContexts: false,
            allContexts: false,
          },
        },
      },
    }

    writeFileSync(
      join(SYSTEM_ROOT, 'permission-matrix.json'),
      JSON.stringify(permissionMatrix, null, 2),
    )
    success('Created: permission-matrix.json')

    // 4. Initialize context database
    step('\n4. Initializing context graph database...')

    const contextDb = {
      nodes: [],
      edges: [],
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        version: '1.0.0',
        nodeCount: 0,
        edgeCount: 0,
      },
    }

    writeFileSync(
      join(SYSTEM_ROOT, 'context-graph.json'),
      JSON.stringify(contextDb, null, 2),
    )
    success('Created: context-graph.json')

    // 5. Create sample context nodes
    step('\n5. Populating sample context...')

    const sampleNodes = [
      {
        id: 'ctx-multi-llm-overview',
        type: 'context',
        content:
          'Multi-LLM unified query system with context graphs, HA filtering, and semantic activation',
        metadata: {
          tags: ['multi-llm', 'system-design', 'context'],
          created: new Date().toISOString(),
        },
      },
      {
        id: 'ctx-permission-model',
        type: 'context',
        content: 'HA permission filter enforces per-LLM access controls and rate limits',
        metadata: {
          tags: ['ha-permissions', 'security'],
          created: new Date().toISOString(),
        },
      },
      {
        id: 'ctx-api-endpoints',
        type: 'context',
        content:
          'HTTP API provides RESTful access to context graph with standard CRUD operations',
        metadata: {
          tags: ['api', 'http'],
          created: new Date().toISOString(),
        },
      },
    ]

    contextDb.nodes = sampleNodes
    contextDb.metadata.nodeCount = sampleNodes.length
    writeFileSync(
      join(SYSTEM_ROOT, 'context-graph.json'),
      JSON.stringify(contextDb, null, 2),
    )
    success('Populated 3 sample context nodes')

    // 6. Create API configuration
    step('\n6. Creating API configuration...')

    const apiConfig = {
      server: {
        host: '127.0.0.1',
        port: 7777,
        timeout: 10000,
      },
      database: {
        path: join(SYSTEM_ROOT, 'context-graph.json'),
        autoSave: true,
      },
      cache: {
        enabled: true,
        maxSize: 1000,
        ttl: 3600000,
      },
      monitoring: {
        enabled: true,
        logPath: join(SYSTEM_ROOT, 'api.log'),
      },
    }

    writeFileSync(join(SYSTEM_ROOT, 'api-config.json'), JSON.stringify(apiConfig, null, 2))
    success('Created: api-config.json')

    // Summary
    step('\n7. INITIALIZATION COMPLETE')
    log(`\nSystem root: ${SYSTEM_ROOT}`)
    log(`Configuration: ${join(SYSTEM_ROOT, 'query-config.json')}`)
    log(`Permissions: ${join(SYSTEM_ROOT, 'permission-matrix.json')}`)
    log(`Context DB: ${join(SYSTEM_ROOT, 'context-graph.json')}`)

    log(`\nNext steps:`, colors.yellow)
    log(`  1. Start API server: node ${join(PROJECTS_ROOT, 'multi-llm-ha-chat/src/context-graph-api.mjs')}`)
    log(`  2. Start MCP daemon: node ${join(SYSTEM_ROOT, 'mcp-server-daemon.mjs')} start`)
    log(`  3. Run tests: node ${join(PROJECTS_ROOT, 'multi-llm-ha-chat/test/run-all-tests.mjs')}`)
    log(`  4. Verify system: node ${join(SYSTEM_ROOT, 'verify-query-system.mjs')}`)

    return true
  } catch (err) {
    error(`Initialization failed: ${err.message}`)
    console.error(err)
    process.exit(1)
  }
}

initSystem()
