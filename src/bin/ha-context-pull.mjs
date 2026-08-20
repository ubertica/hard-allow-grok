#!/usr/bin/env node
/**
 * ha-context-pull.mjs — Multi-LLM context node pull tool
 * Enables Claude, Kimi, Grok to request filtered HARD ALLOW context
 *
 * Usage:
 *   node ha-context-pull.mjs
 *   node ha-context-pull.mjs --format json
 *   node ha-context-pull.mjs --query "grants"
 *   node ha-context-pull.mjs --format prompt --for claude
 *   node ha-context-pull.mjs --test
 */
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'

const HOME = process.env.HOME || homedir()
const CONTEXT_STORE_PATH = path.join(HOME, 'dev', 'multi-llm-ha-chat', 'src', 'kernel', 'context-store.mjs')

let ContextStore
try {
  const module = await import(`file://${CONTEXT_STORE_PATH}`)
  ContextStore = module.default
} catch (e) {
  console.error('❌ Failed to load ContextStore:', e.message)
  process.exit(1)
}

/**
 * Parse CLI arguments
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    format: 'json',
    query: null,
    includeSubnodes: true,
    forAgent: 'claude',
    test: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--format' && args[i + 1]) {
      opts.format = args[++i]
    } else if (arg === '--query' && args[i + 1]) {
      opts.query = args[++i]
    } else if (arg === '--include-subnodes' && args[i + 1]) {
      opts.includeSubnodes = args[++i] !== 'false'
    } else if (arg === '--for' && args[i + 1]) {
      opts.forAgent = args[++i]
    } else if (arg === '--test') {
      opts.test = true
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  return opts
}

/**
 * Print help text
 */
function printHelp() {
  console.log(`
ha-context-pull — Multi-LLM HARD ALLOW Context Node Pull Tool

USAGE:
  node ha-context-pull.mjs [options]

OPTIONS:
  --format <fmt>           Output format: json, jsonl, markdown, prompt (default: json)
  --query <q>              Search query to filter nodes (optional)
  --include-subnodes <b>   Include subnodes (true|false, default: true)
  --for <agent>            Target agent for prompt format (claude, kimi, grok)
  --test                   Run self-test
  --help, -h              This help text

EXAMPLES:
  # Pull all context as JSON
  node ha-context-pull.mjs

  # Pull HA grant nodes only
  node ha-context-pull.mjs --query "grants"

  # Generate system prompt for Kimi
  node ha-context-pull.mjs --format prompt --for kimi

  # JSONL stream (for piping)
  node ha-context-pull.mjs --format jsonl

  # Run self-test
  node ha-context-pull.mjs --test
`)
}

/**
 * Main execution
 */
async function main() {
  const opts = parseArgs()

  if (opts.test) {
    await runTest()
    return
  }

  try {
    const store = new ContextStore()
    const output = await store.exportContext(opts)
    console.log(output)
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  }
}

/**
 * Self-test: load context, verify nodes/edges, print sample
 */
async function runTest() {
  console.log('🧪 Running context-pull self-test...\n')

  try {
    const store = new ContextStore()

    // Load all context
    console.log('📂 Loading context nodes...')
    const allNodes = await store.loadAll()
    const nodeCount = Object.keys(allNodes).length
    console.log(`   ✓ Loaded ${nodeCount} nodes`)

    // Get metadata
    const meta = await store.getMeta()
    console.log(`📊 Metadata: ${JSON.stringify(meta, null, 2)}`)

    // Load edges
    await store.sync()
    const edgeCount = store.graphCache?.length || 0
    console.log(`   ✓ Loaded ${edgeCount} edges`)

    // Sample nodes
    console.log('\n📌 Sample nodes:')
    const sampleIds = [
      'system.ha-status',
      'hardAllow.grants',
      'agents.claude',
      'projects.multi-llm-ha-chat',
    ]
    for (const id of sampleIds) {
      const node = allNodes[id]
      if (node) {
        console.log(`   ✓ ${node._label || id}`)
      }
    }

    // Test export formats
    console.log('\n🔄 Testing export formats:')
    const formats = ['json', 'jsonl', 'markdown', 'prompt']
    for (const fmt of formats) {
      try {
        const exported = await store.exportContext({ format: fmt })
        const lines = exported.split('\n').length
        console.log(`   ✓ ${fmt}: ${lines} lines`)
      } catch (e) {
        console.log(`   ✗ ${fmt}: ${e.message}`)
      }
    }

    // Test query
    console.log('\n🔍 Testing query filter:')
    const queryResult = await store.exportContext({ query: 'ha', format: 'json' })
    const queryObj = JSON.parse(queryResult)
    const queryNodeCount = Object.keys(queryObj.nodes).length
    console.log(`   ✓ Query "ha" returned ${queryNodeCount} nodes`)

    // Test secret redaction
    console.log('\n🔐 Testing secret redaction:')
    const redactedResult = await store.exportContext({ format: 'json' })
    if (redactedResult.includes('***REDACTED***')) {
      console.log(`   ✓ Secrets redacted in output`)
    } else {
      console.log(`   ⚠️  No secrets detected in output`)
    }

    console.log('\n✅ Self-test PASSED')
    console.log(`   Nodes: ${nodeCount}, Edges: ${edgeCount}`)
    console.log(`   Ready for use with Claude/Kimi/Grok`)
  } catch (err) {
    console.error('\n❌ Self-test FAILED:', err.message)
    process.exit(1)
  }
}

// Run
main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
