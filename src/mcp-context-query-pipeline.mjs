#!/usr/bin/env node
/**
 * mcp-context-query-pipeline.mjs
 * MCP server for context-aware query processing
 *
 * Provides:
 * - Context graph builder and navigator
 * - Query pipeline with semantic enrichment
 * - Cross-LLM context propagation
 * - Real-time query streaming
 *
 * Runs as: node mcp-context-query-pipeline.mjs
 */

import { EventEmitter } from 'node:events'
import { writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = homedir()
const CONTEXT_DB = join(HOME, '.grok', 'hard-allow', 'context-graph.json')
const QUERY_LOG = join(HOME, '.grok', 'hard-allow', 'query-log.jsonl')

// ─────────────────────────────────────────────────────────────
// Context Graph Builder
// ─────────────────────────────────────────────────────────────

class ContextGraphBuilder extends EventEmitter {
  constructor() {
    super()
    this.nodes = new Map()
    this.edges = new Map()
    this.metadata = {
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      version: '1.0.0',
      nodeCount: 0,
      edgeCount: 0,
    }
    this.loadGraph()
  }

  loadGraph() {
    if (existsSync(CONTEXT_DB)) {
      try {
        const data = JSON.parse(readFileSync(CONTEXT_DB, 'utf8'))
        data.nodes?.forEach((n) => this.nodes.set(n.id, n))
        data.edges?.forEach((e) => this.edges.set(`${e.from}-${e.to}`, e))
        this.metadata = data.metadata || this.metadata
      } catch (e) {
        console.error('Failed to load context graph:', e.message)
      }
    }
  }

  saveGraph() {
    const graph = {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      metadata: {
        ...this.metadata,
        updated: new Date().toISOString(),
        nodeCount: this.nodes.size,
        edgeCount: this.edges.size,
      },
    }
    writeFileSync(CONTEXT_DB, JSON.stringify(graph, null, 2))
  }

  addNode(id, data) {
    const node = {
      id,
      type: data.type || 'context',
      content: data.content || '',
      metadata: data.metadata || {},
      embeddings: data.embeddings || [],
      created: new Date().toISOString(),
      accessed: new Date().toISOString(),
      relevanceScore: data.relevanceScore || 1.0,
      llmContext: data.llmContext || {},
    }
    this.nodes.set(id, node)
    this.emit('nodeAdded', node)
    return node
  }

  addEdge(from, to, relation, weight = 1.0) {
    const edgeId = `${from}-${to}`
    const edge = {
      from,
      to,
      relation,
      weight,
      created: new Date().toISOString(),
      metadata: {},
    }
    this.edges.set(edgeId, edge)
    this.emit('edgeAdded', edge)
    return edge
  }

  getNode(id) {
    return this.nodes.get(id)
  }

  getRelated(nodeId, depth = 1) {
    const related = []
    const visited = new Set()
    const queue = [{ id: nodeId, depth: 0 }]

    while (queue.length > 0) {
      const { id, depth: currentDepth } = queue.shift()
      if (visited.has(id) || currentDepth > depth) continue

      visited.add(id)
      const node = this.getNode(id)
      if (node) related.push(node)

      const outgoing = Array.from(this.edges.values()).filter((e) => e.from === id)
      outgoing.forEach((e) => {
        if (!visited.has(e.to)) {
          queue.push({ id: e.to, depth: currentDepth + 1 })
        }
      })
    }

    return related
  }

  updateAccess(nodeId) {
    const node = this.getNode(nodeId)
    if (node) {
      node.accessed = new Date().toISOString()
      node.accessCount = (node.accessCount || 0) + 1
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Query Pipeline
// ─────────────────────────────────────────────────────────────

class QueryPipeline extends EventEmitter {
  constructor(contextGraph) {
    super()
    this.graph = contextGraph
    this.queryCache = new Map()
    this.stats = {
      totalQueries: 0,
      totalCacheHits: 0,
      totalLatency: 0,
      avgLatency: 0,
    }
  }

  async process(query, options = {}) {
    const queryId = `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const startTime = Date.now()

    try {
      // Log query
      this.logQuery(queryId, query, options)

      // Check cache
      const cacheKey = this.getCacheKey(query, options)
      if (this.queryCache.has(cacheKey)) {
        this.stats.totalCacheHits++
        return {
          queryId,
          cached: true,
          result: this.queryCache.get(cacheKey),
          duration: Date.now() - startTime,
        }
      }

      // Pipeline stages
      const enriched = this.enrichQuery(query, options)
      const contextRelevant = this.findRelevantContext(enriched)
      const ranked = this.rankResults(contextRelevant, enriched)
      const formatted = this.formatResults(ranked)

      // Cache and return
      this.queryCache.set(cacheKey, formatted)
      const duration = Date.now() - startTime

      this.stats.totalQueries++
      this.stats.totalLatency += duration
      this.stats.avgLatency = this.stats.totalLatency / this.stats.totalQueries

      const result = {
        queryId,
        cached: false,
        query: enriched,
        results: formatted,
        duration,
        contextUsed: contextRelevant.length,
      }

      this.emit('queryCompleted', result)
      return result
    } catch (error) {
      this.emit('queryError', { queryId, error: error.message })
      return {
        queryId,
        error: error.message,
        duration: Date.now() - startTime,
      }
    }
  }

  enrichQuery(query, options) {
    return {
      original: query,
      normalized: query.toLowerCase().trim(),
      llmContext: options.llmContext || {},
      userId: options.userId || 'anonymous',
      sessionId: options.sessionId || 'default',
      timestamp: new Date().toISOString(),
      tags: options.tags || [],
    }
  }

  findRelevantContext(enrichedQuery) {
    const results = []
    const threshold = 0.3

    for (const node of this.graph.nodes.values()) {
      const score = this.calculateRelevance(enrichedQuery, node)
      if (score >= threshold) {
        results.push({
          node,
          score,
          relatedNodes: this.graph.getRelated(node.id, 1),
        })
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 10)
  }

  calculateRelevance(query, node) {
    let score = 0

    if (node.content.toLowerCase().includes(query.normalized)) score += 0.5
    if (query.tags?.length > 0) {
      const commonTags = query.tags.filter((t) => node.metadata.tags?.includes(t))
      score += (commonTags.length / query.tags.length) * 0.3
    }
    if (query.llmContext?.llmId && node.llmContext?.[query.llmContext.llmId]) {
      score += 0.2
    }

    return Math.min(score, 1.0)
  }

  rankResults(results, query) {
    return results.map((r) => ({
      ...r,
      rankScore: this.calculateRankScore(r, query),
    })).sort((a, b) => b.rankScore - a.rankScore)
  }

  calculateRankScore(result, query) {
    let score = result.score * 0.6
    const daysSinceAccess = (Date.now() - new Date(result.node.accessed).getTime()) / (1000 * 60 * 60 * 24)
    score += Math.max(0, 0.3 - daysSinceAccess * 0.01)
    score += Math.min(0.1, (result.node.accessCount || 0) * 0.001)
    return Math.min(score, 1.0)
  }

  formatResults(rankedResults) {
    return rankedResults.map((r, index) => ({
      rank: index + 1,
      nodeId: r.node.id,
      content: r.node.content,
      relevance: (r.score * 100).toFixed(1),
      ranking: (r.rankScore * 100).toFixed(1),
      relatedCount: r.relatedNodes.length,
      metadata: r.node.metadata,
    }))
  }

  getCacheKey(query, options) {
    return JSON.stringify({
      query: query.toLowerCase(),
      llmId: options.llmContext?.llmId,
      userId: options.userId,
    })
  }

  logQuery(queryId, query, options) {
    const entry = {
      queryId,
      timestamp: new Date().toISOString(),
      query,
      llmId: options.llmContext?.llmId,
      userId: options.userId,
    }
    try {
      const line = JSON.stringify(entry) + '\n'
      appendFileSync(QUERY_LOG, line)
    } catch (e) {
      // Ignore logging errors
    }
  }

  getStats() {
    return { ...this.stats }
  }

  clearCache() {
    this.queryCache.clear()
  }
}

// ─────────────────────────────────────────────────────────────
// MCP Server
// ─────────────────────────────────────────────────────────────

class MCPContextServer {
  constructor() {
    this.graph = new ContextGraphBuilder()
    this.pipeline = new QueryPipeline(this.graph)
    this.tools = this.defineMCPTools()
  }

  defineMCPTools() {
    return [
      {
        name: 'add_context_node',
        description: 'Add a context node to the graph',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique node ID' },
            content: { type: 'string', description: 'Node content' },
            type: { type: 'string', enum: ['context', 'query', 'result', 'memory'] },
            metadata: { type: 'object', description: 'Node metadata' },
          },
          required: ['id', 'content'],
        },
      },
      {
        name: 'query_context',
        description: 'Query the context graph with semantic search',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Query text' },
            llmId: { type: 'string', description: 'LLM identifier' },
            sessionId: { type: 'string', description: 'Session ID' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_related_context',
        description: 'Get context nodes related to a given node',
        inputSchema: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'Node ID' },
            depth: { type: 'number', description: 'Relation depth (1-3)' },
          },
          required: ['nodeId'],
        },
      },
      {
        name: 'link_context_nodes',
        description: 'Create a relationship between two context nodes',
        inputSchema: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Source node ID' },
            to: { type: 'string', description: 'Target node ID' },
            relation: { type: 'string', description: 'Relation type' },
            weight: { type: 'number', description: 'Relation weight (0-1)' },
          },
          required: ['from', 'to', 'relation'],
        },
      },
      {
        name: 'get_context_stats',
        description: 'Get context graph statistics',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ]
  }

  async handleTool(toolName, input) {
    switch (toolName) {
      case 'add_context_node':
        return this.addContextNode(input)
      case 'query_context':
        return this.queryContext(input)
      case 'get_related_context':
        return this.getRelatedContext(input)
      case 'link_context_nodes':
        return this.linkContextNodes(input)
      case 'get_context_stats':
        return this.getContextStats(input)
      default:
        return { error: 'Unknown tool' }
    }
  }

  addContextNode(input) {
    try {
      const node = this.graph.addNode(input.id, {
        type: input.type || 'context',
        content: input.content,
        metadata: input.metadata || {},
      })
      this.graph.saveGraph()
      return {
        success: true,
        node: {
          id: node.id,
          type: node.type,
          created: node.created,
        },
      }
    } catch (error) {
      return { error: error.message }
    }
  }

  async queryContext(input) {
    try {
      const result = await this.pipeline.process(input.query, {
        llmContext: { llmId: input.llmId },
        sessionId: input.sessionId,
      })
      return {
        success: !result.error,
        queryId: result.queryId,
        cached: result.cached,
        resultCount: result.results?.length || 0,
        results: result.results || [],
        duration: result.duration,
      }
    } catch (error) {
      return { error: error.message }
    }
  }

  getRelatedContext(input) {
    try {
      const related = this.graph.getRelated(input.nodeId, input.depth || 1)
      this.graph.updateAccess(input.nodeId)
      return {
        success: true,
        nodeId: input.nodeId,
        relatedCount: related.length,
        related: related.slice(0, 20).map((n) => ({
          id: n.id,
          type: n.type,
          content: n.content.substring(0, 100),
        })),
      }
    } catch (error) {
      return { error: error.message }
    }
  }

  linkContextNodes(input) {
    try {
      const edge = this.graph.addEdge(input.from, input.to, input.relation, input.weight || 1.0)
      this.graph.saveGraph()
      return {
        success: true,
        edge: {
          from: edge.from,
          to: edge.to,
          relation: edge.relation,
          weight: edge.weight,
        },
      }
    } catch (error) {
      return { error: error.message }
    }
  }

  getContextStats(input) {
    const pipelineStats = this.pipeline.getStats()
    return {
      success: true,
      contextGraph: {
        nodes: this.graph.nodes.size,
        edges: this.graph.edges.size,
        version: this.graph.metadata.version,
      },
      queryPipeline: pipelineStats,
    }
  }
}

export { MCPContextServer, ContextGraphBuilder, QueryPipeline }

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MCPContextServer()
  console.log('MCP Context Query Pipeline Started')
  console.log('Tools:', server.tools.length)
  server.tools.forEach((t) => console.log(`  - ${t.name}`))
}
