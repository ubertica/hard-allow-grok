#!/usr/bin/env node
/**
 * hydrate-all-llm-nodes.mjs
 * Map and hydrate context node system across all LLM directories (Claude, Grok, Kimi)
 * Maintains single source of truth with hard links or copies
 *
 * Usage:
 *   node hydrate-all-llm-nodes.mjs                    # Hydrate all
 *   node hydrate-all-llm-nodes.mjs --dry-run          # Show what would happen
 *   node hydrate-all-llm-nodes.mjs --strategy copy    # Use copy instead of hard link
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'

const HOME = homedir()
const SOURCE_NODES = path.join(HOME, '.grok', 'context-nodes')
const LLM_DIRS = [
  { name: 'grok', path: path.join(HOME, '.grok') },
  { name: 'claude', path: path.join(HOME, '.claude') },
  { name: 'kimi', path: path.join(HOME, '.kimi') },
]

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const strategy = args.includes('--strategy') ? args[args.indexOf('--strategy') + 1] : 'hard-link'

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
}

function log(msg) {
  console.log(msg)
}

function ok(msg) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`)
}

function err(msg) {
  console.error(`${colors.red}✗${colors.reset} ${msg}`)
}

function warn(msg) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`)
}

function header(msg) {
  console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}`)
}

function verifySource() {
  header('1️⃣  Verifying Source Nodes')

  if (!fs.existsSync(SOURCE_NODES)) {
    err(`Source nodes not found at ${SOURCE_NODES}`)
    process.exit(1)
  }

  const stateFile = path.join(SOURCE_NODES, 'state.json')
  const graphFile = path.join(SOURCE_NODES, 'graph.jsonl')

  if (!fs.existsSync(stateFile)) {
    err('state.json not found')
    process.exit(1)
  }
  if (!fs.existsSync(graphFile)) {
    err('graph.jsonl not found')
    process.exit(1)
  }

  let state, nodes, edges
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    nodes = state.nodeCount
    edges = state.edgeCount
  } catch (e) {
    err('state.json is corrupted')
    process.exit(1)
  }

  ok(`Source verified: ${nodes} nodes, ${edges} edges`)
  log(`  Path: ${SOURCE_NODES}`)
  log(`  Timestamp: ${new Date(state.timestamp).toISOString()}`)

  return { stateFile, graphFile, nodes, edges }
}

function createLLMStructure() {
  header('2️⃣  Creating LLM Directory Structures')

  for (const llm of LLM_DIRS) {
    const nodesDir = path.join(llm.path, 'context-nodes')
    const backupsDir = path.join(nodesDir, 'backups')

    if (!fs.existsSync(llm.path)) {
      if (isDryRun) {
        log(`[DRY RUN] Would create: ${llm.path}`)
      } else {
        fs.mkdirSync(llm.path, { recursive: true })
        ok(`Created LLM directory: ${llm.name}`)
      }
    } else {
      ok(`${llm.name} directory exists`)
    }

    if (!fs.existsSync(nodesDir)) {
      if (isDryRun) {
        log(`[DRY RUN] Would create: ${nodesDir}`)
      } else {
        fs.mkdirSync(nodesDir, { recursive: true })
        ok(`  Created context-nodes for ${llm.name}`)
      }
    } else {
      ok(`  context-nodes exists for ${llm.name}`)
    }

    if (!fs.existsSync(backupsDir)) {
      if (isDryRun) {
        log(`[DRY RUN] Would create: ${backupsDir}`)
      } else {
        fs.mkdirSync(backupsDir, { recursive: true })
      }
    }
  }
}

function syncNodes(sourceState, sourceGraph) {
  header('3️⃣  Syncing Node Files Across LLM Directories')

  for (const llm of LLM_DIRS) {
    if (llm.name === 'grok') {
      ok(`${llm.name} (source) — skipping`)
      continue
    }

    const targetDir = path.join(llm.path, 'context-nodes')
    const targetState = path.join(targetDir, 'state.json')
    const targetGraph = path.join(targetDir, 'graph.jsonl')

    log(`\n  Syncing to ${llm.name}:`)

    // Sync state.json
    if (strategy === 'hard-link') {
      if (isDryRun) {
        log(`    [DRY RUN] Would hard link: state.json`)
      } else {
        try {
          if (fs.existsSync(targetState)) fs.unlinkSync(targetState)
          fs.linkSync(sourceState, targetState)
          ok(`    state.json (hard link)`)
        } catch (e) {
          warn(`    Hard link failed, falling back to copy: ${e.message}`)
          fs.copyFileSync(sourceState, targetState)
          ok(`    state.json (copied)`)
        }
      }
    } else {
      if (isDryRun) {
        log(`    [DRY RUN] Would copy: state.json`)
      } else {
        fs.copyFileSync(sourceState, targetState)
        ok(`    state.json (copied)`)
      }
    }

    // Sync graph.jsonl
    if (strategy === 'hard-link') {
      if (isDryRun) {
        log(`    [DRY RUN] Would hard link: graph.jsonl`)
      } else {
        try {
          if (fs.existsSync(targetGraph)) fs.unlinkSync(targetGraph)
          fs.linkSync(sourceGraph, targetGraph)
          ok(`    graph.jsonl (hard link)`)
        } catch (e) {
          warn(`    Hard link failed, falling back to copy: ${e.message}`)
          fs.copyFileSync(sourceGraph, targetGraph)
          ok(`    graph.jsonl (copied)`)
        }
      }
    } else {
      if (isDryRun) {
        log(`    [DRY RUN] Would copy: graph.jsonl`)
      } else {
        fs.copyFileSync(sourceGraph, targetGraph)
        ok(`    graph.jsonl (copied)`)
      }
    }
  }
}

function createCrossSessionRegistry() {
  header('4️⃣  Creating Cross-Session Registry')

  const registry = {
    timestamp: new Date().toISOString(),
    version: 1,
    strategy: strategy,
    sourceOfTruth: SOURCE_NODES,
    sessions: [],
  }

  for (const llm of LLM_DIRS) {
    const nodesDir = path.join(llm.path, 'context-nodes')
    registry.sessions.push({
      llm: llm.name,
      path: llm.path,
      nodesPath: nodesDir,
      synced: !isDryRun,
      timestamp: new Date().toISOString(),
    })
  }

  const registryPath = path.join(SOURCE_NODES, 'SHARED_NODE_REGISTRY.json')

  if (isDryRun) {
    log(`[DRY RUN] Would write registry to: ${registryPath}`)
    log(JSON.stringify(registry, null, 2))
  } else {
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2))
    ok(`Registry created: ${registryPath}`)
  }

  return registry
}

function updateActiveSessionsJson() {
  header('5️⃣  Updating Active Sessions Registry')

  const sessionsFile = path.join(HOME, '.grok', 'active_sessions.json')

  let sessions = {}
  if (fs.existsSync(sessionsFile)) {
    try {
      sessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'))
    } catch (e) {
      warn(`Could not parse active_sessions.json: ${e.message}`)
    }
  }

  if (!sessions.context_nodes) {
    sessions.context_nodes = {}
  }

  sessions.context_nodes.lastSync = new Date().toISOString()
  sessions.context_nodes.strategy = strategy
  sessions.context_nodes.linkedLLMs = ['claude', 'grok', 'kimi']

  if (isDryRun) {
    log(`[DRY RUN] Would update: ${sessionsFile}`)
    log(JSON.stringify(sessions.context_nodes, null, 2))
  } else {
    fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2))
    ok(`Updated active_sessions.json`)
  }
}

function generateSummary(registry) {
  header('📊 Hydration Summary')

  console.log(`
${colors.bold}Scope:${colors.reset}
  • LLMs: ${LLM_DIRS.map(l => l.name).join(', ')}
  • Strategy: ${strategy}
  • Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}

${colors.bold}Source of Truth:${colors.reset}
  • Path: ${SOURCE_NODES}
  • Status: ${colors.green}Ready${colors.reset}

${colors.bold}Synced Locations:${colors.reset}
${registry.sessions.map(s => `  • ${s.llm}: ${s.nodesPath}`).join('\n')}

${colors.bold}Result:${colors.reset}
  • All LLM sessions can access shared nodes
  • Cross-session queries possible
  • Single source of truth maintained
`)

  if (!isDryRun) {
    ok('Hydration complete')
  } else {
    warn('Dry run completed — no changes made')
  }
}

async function main() {
  header('🔗 Multi-LLM Context Node Hydration')

  const { stateFile, graphFile } = verifySource()
  createLLMStructure()
  syncNodes(stateFile, graphFile)
  const registry = createCrossSessionRegistry()
  updateActiveSessionsJson()
  generateSummary(registry)

  if (!isDryRun) {
    log(`\n${colors.green}✅ All LLM directories hydrated and synced.${colors.reset}`)
  }

  process.exit(0)
}

main().catch((e) => {
  err(`Fatal error: ${e.message}`)
  process.exit(1)
})
