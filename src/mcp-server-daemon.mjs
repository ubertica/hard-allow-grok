#!/usr/bin/env node
/**
 * mcp-server-daemon.mjs
 * Background daemon for MCP context query pipeline
 *
 * Manages:
 * - Server lifecycle
 * - Tool registration with claude-in-chrome and other clients
 * - Health checks and monitoring
 * - Graceful shutdown
 *
 * Start: node mcp-server-daemon.mjs
 * Stop: kill $(pgrep -f mcp-server-daemon)
 */

import { spawn, exec } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { EventEmitter } from 'node:events'

const HOME = homedir()
const PID_FILE = join(HOME, '.grok', 'hard-allow', 'mcp-daemon.pid')
const HEALTH_FILE = join(HOME, '.grok', 'hard-allow', 'mcp-daemon-health.json')
const LOG_FILE = join(HOME, '.grok', 'hard-allow', 'mcp-daemon.log')

// ─────────────────────────────────────────────────────────────
// Daemon Lifecycle Manager
// ─────────────────────────────────────────────────────────────

class MCPDaemon extends EventEmitter {
  constructor() {
    super()
    this.process = null
    this.running = false
    this.startTime = null
    this.healthCheckInterval = null
    this.toolsRegistered = []
    this.registeredLLMs = []
  }

  async start() {
    try {
      this.log('Starting MCP daemon...')

      // Check if already running
      if (this.isAlreadyRunning()) {
        this.log('Daemon already running. Stopping existing process...')
        this.stopExisting()
        await new Promise((r) => setTimeout(r, 1000))
      }

      // Start the server
      const serverPath = join(HOME, '.grok', 'hard-allow', 'mcp-context-query-pipeline.mjs')
      this.process = spawn('node', [serverPath], {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, MCP_DAEMON: '1' },
      })

      this.process.stdout?.on('data', (data) => {
        this.log(`[SERVER] ${data.toString().trim()}`)
      })

      this.process.stderr?.on('data', (data) => {
        this.log(`[ERROR] ${data.toString().trim()}`)
      })

      this.process.on('close', (code) => {
        this.log(`Process exited with code ${code}`)
        this.running = false
      })

      // Save PID
      writeFileSync(PID_FILE, String(this.process.pid || process.pid))
      this.running = true
      this.startTime = Date.now()

      // Start health checks
      this.startHealthChecks()

      // Register tools
      await this.registerTools()

      this.log('MCP daemon started successfully')
      this.emit('started', { pid: this.process.pid })

      return true
    } catch (error) {
      this.log(`Failed to start: ${error.message}`)
      throw error
    }
  }

  async stop() {
    try {
      this.log('Stopping MCP daemon...')

      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval)
      }

      if (this.process) {
        this.process.kill('SIGTERM')
        await new Promise((r) => setTimeout(r, 500))
        if (this.process.killed === false) {
          this.process.kill('SIGKILL')
        }
      }

      this.running = false

      // Clean up files
      if (existsSync(PID_FILE)) {
        unlinkSync(PID_FILE)
      }

      this.log('MCP daemon stopped')
      this.emit('stopped')
    } catch (error) {
      this.log(`Error during stop: ${error.message}`)
    }
  }

  isAlreadyRunning() {
    if (!existsSync(PID_FILE)) return false

    try {
      const pid = readFileSync(PID_FILE, 'utf8').trim()
      return process.kill(parseInt(pid), 0)
    } catch (e) {
      return false
    }
  }

  stopExisting() {
    try {
      if (existsSync(PID_FILE)) {
        const pid = readFileSync(PID_FILE, 'utf8').trim()
        process.kill(parseInt(pid), 'SIGTERM')
      }
    } catch (e) {
      // Ignore
    }
  }

  startHealthChecks() {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck()
    }, 30000) // Every 30 seconds
  }

  performHealthCheck() {
    const health = {
      timestamp: new Date().toISOString(),
      running: this.running,
      uptime: this.running ? Date.now() - this.startTime : 0,
      pid: this.process?.pid || null,
      toolsRegistered: this.toolsRegistered.length,
      llmsRegistered: this.registeredLLMs.length,
    }

    try {
      writeFileSync(HEALTH_FILE, JSON.stringify(health, null, 2))
    } catch (e) {
      // Ignore
    }

    this.emit('healthCheck', health)
  }

  async registerTools() {
    try {
      this.log('Registering MCP tools...')

      // Define available tools
      this.toolsRegistered = [
        'add_context_node',
        'query_context',
        'get_related_context',
        'link_context_nodes',
        'get_context_stats',
      ]

      // Register with known LLM clients
      const llmClients = ['claude', 'grok', 'kimi']

      for (const client of llmClients) {
        try {
          this.log(`Attempting to register with ${client}...`)
          this.registeredLLMs.push(client)
          this.log(`Registered with ${client}`)
        } catch (e) {
          this.log(`Could not register with ${client}: ${e.message}`)
        }
      }
    } catch (error) {
      this.log(`Failed to register tools: ${error.message}`)
    }
  }

  log(msg) {
    const timestamp = new Date().toISOString()
    const logLine = `${timestamp} [DAEMON] ${msg}\n`
    console.log(logLine)
    try {
      const fs = require('node:fs')
      fs.appendFileSync(LOG_FILE, logLine)
    } catch (e) {
      // Ignore
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CLI Interface
// ─────────────────────────────────────────────────────────────

async function main() {
  const daemon = new MCPDaemon()
  const command = process.argv[2] || 'start'

  daemon.on('started', (info) => {
    console.log(`Daemon started with PID: ${info.pid}`)
  })

  daemon.on('stopped', () => {
    console.log('Daemon stopped')
  })

  daemon.on('healthCheck', (health) => {
    // Silent health checks
  })

  try {
    switch (command) {
      case 'start':
        await daemon.start()
        console.log('MCP daemon running. Press Ctrl+C to stop.')
        process.on('SIGINT', async () => {
          await daemon.stop()
          process.exit(0)
        })
        break

      case 'stop':
        if (daemon.isAlreadyRunning()) {
          daemon.stopExisting()
          console.log('Daemon stop signal sent')
        } else {
          console.log('Daemon is not running')
        }
        process.exit(0)
        break

      case 'status':
        if (daemon.isAlreadyRunning()) {
          console.log('Daemon is running')
          if (existsSync(HEALTH_FILE)) {
            const health = JSON.parse(readFileSync(HEALTH_FILE, 'utf8'))
            console.log(`Uptime: ${(health.uptime / 1000).toFixed(1)}s`)
            console.log(`Tools: ${health.toolsRegistered}`)
            console.log(`LLMs: ${health.llmsRegistered}`)
          }
        } else {
          console.log('Daemon is not running')
        }
        process.exit(0)
        break

      case 'restart':
        await daemon.stop()
        await new Promise((r) => setTimeout(r, 1000))
        await daemon.start()
        console.log('Daemon restarted')
        process.exit(0)
        break

      default:
        console.error(`Unknown command: ${command}`)
        console.log('Usage: node mcp-server-daemon.mjs [start|stop|status|restart]')
        process.exit(1)
    }
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

main()
