#!/usr/bin/env node
/**
 * unified-context-query.mjs
 * Unified query orchestrator for multi-LLM context system
 *
 * Coordinates:
 * - MCP pipeline
 * - HTTP API
 * - HA permission filtering
 * - Semantic activation
 * - Cross-LLM propagation
 *
 * Usage:
 * const orchestrator = new UnifiedQueryOrchestrator()
 * await orchestrator.initialize()
 * const result = await orchestrator.query(llmId, queryText)
 */

import { HAPermissionFilter } from './ha-permission-filter.mjs'
import { EventEmitter } from 'node:events'

class UnifiedQueryOrchestrator extends EventEmitter {
  constructor() {
    super()
    this.permissionFilter = new HAPermissionFilter()
    this.contextGraph = new Map()
    this.queryCache = new Map()
    this.semanticIndex = new Map()
    this.llmSessions = new Map()
  }

  async initialize() {
    console.log('Initializing unified query orchestrator...')

    // Initialize components
    this.registerDefaultLLMs()
    this.loadSemanticIndex()

    this.emit('initialized')
    console.log('Orchestrator ready')
  }

  registerDefaultLLMs() {
    const llms = ['claude', 'grok', 'kimi']
    llms.forEach((llmId) => {
      this.llmSessions.set(llmId, {
        id: llmId,
        registered: new Date().toISOString(),
        status: 'active',
        queryCount: 0,
      })
    })
  }

  loadSemanticIndex() {
    // Initialize semantic index with default topics
    const topics = [
      'context-queries',
      'ha-permissions',
      'multi-llm',
      'graph-navigation',
      'semantic-search',
    ]
    topics.forEach((topic) => {
      this.semanticIndex.set(topic, {
        topic,
        references: [],
        relevance: 0,
      })
    })
  }

  async query(llmId, queryText, options = {}) {
    const queryId = `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    try {
      // 1. Permission check
      const permissionCheck = this.permissionFilter.checkPermission(llmId, 'query_context')
      if (!permissionCheck.allowed) {
        this.emit('queryDenied', {
          queryId,
          llmId,
          reason: permissionCheck.reason,
        })
        return {
          success: false,
          error: permissionCheck.reason,
          queryId,
        }
      }

      // 2. Check cache
      const cacheKey = this.getCacheKey(llmId, queryText, options)
      if (this.queryCache.has(cacheKey)) {
        this.emit('cacheHit', { queryId, llmId })
        return {
          success: true,
          cached: true,
          result: this.queryCache.get(cacheKey),
          queryId,
        }
      }

      // 3. Semantic enrichment
      const enriched = this.enrichQueryWithSemantics(queryText)

      // 4. Graph search
      const graphResults = this.searchContextGraph(enriched, llmId)

      // 5. Rank and filter results
      const ranked = this.rankResults(graphResults, enriched, llmId)

      // 6. Format response
      const response = {
        success: true,
        cached: false,
        queryId,
        llmId,
        query: queryText,
        resultCount: ranked.length,
        results: ranked.slice(0, 20),
        timestamp: new Date().toISOString(),
      }

      // 7. Cache and log
      this.queryCache.set(cacheKey, response)
      this.logQuery(queryId, llmId, queryText, ranked.length)

      const session = this.llmSessions.get(llmId)
      if (session) session.queryCount++

      this.emit('queryCompleted', { queryId, llmId, resultCount: ranked.length })

      return response
    } catch (error) {
      this.emit('queryError', { queryId, llmId, error: error.message })
      return {
        success: false,
        error: error.message,
        queryId,
      }
    }
  }

  enrichQueryWithSemantics(queryText) {
    return {
      original: queryText,
      normalized: queryText.toLowerCase().trim(),
      words: queryText.toLowerCase().split(/\s+/),
      timestamp: new Date().toISOString(),
      semanticTags: this.extractSemanticTags(queryText),
    }
  }

  extractSemanticTags(text) {
    const tags = []
    const lowerText = text.toLowerCase()

    if (lowerText.includes('context')) tags.push('context-queries')
    if (lowerText.includes('permission') || lowerText.includes('access'))
      tags.push('ha-permissions')
    if (lowerText.includes('llm') || lowerText.includes('multi')) tags.push('multi-llm')
    if (lowerText.includes('graph') || lowerText.includes('relate'))
      tags.push('graph-navigation')
    if (lowerText.includes('semantic') || lowerText.includes('search'))
      tags.push('semantic-search')

    return tags
  }

  searchContextGraph(enriched, llmId) {
    // Placeholder: would search actual graph
    const results = []

    for (const [nodeId, node] of this.contextGraph.entries()) {
      let score = 0

      // Word matches
      enriched.words.forEach((word) => {
        if (node.content?.toLowerCase().includes(word)) {
          score += 0.2
        }
      })

      // Semantic tag matches
      if (node.tags) {
        enriched.semanticTags.forEach((tag) => {
          if (node.tags.includes(tag)) {
            score += 0.3
          }
        })
      }

      if (score > 0) {
        results.push({
          nodeId,
          node,
          score: Math.min(score, 1.0),
        })
      }
    }

    return results
  }

  rankResults(results, enriched, llmId) {
    return results
      .map((r) => ({
        ...r,
        rankScore: this.calculateRankScore(r, enriched, llmId),
      }))
      .sort((a, b) => b.rankScore - a.rankScore)
  }

  calculateRankScore(result, enriched, llmId) {
    let score = result.score * 0.5

    // Semantic bonus
    if (enriched.semanticTags) {
      const commonTags = enriched.semanticTags.filter((t) => result.node.tags?.includes(t))
      score += (commonTags.length / enriched.semanticTags.length) * 0.3
    }

    // Recency bonus
    const ageMs = Date.now() - new Date(result.node.created || 0).getTime()
    const ageDays = ageMs / (1000 * 60 * 60 * 24)
    score += Math.max(0, 0.2 - ageDays * 0.001)

    return Math.min(score, 1.0)
  }

  getCacheKey(llmId, query, options) {
    return JSON.stringify({ llmId, query: query.toLowerCase(), options })
  }

  logQuery(queryId, llmId, query, resultCount) {
    this.emit('queryLogged', {
      queryId,
      llmId,
      query,
      resultCount,
      timestamp: new Date().toISOString(),
    })
  }

  addContextNode(id, content, metadata = {}) {
    this.contextGraph.set(id, {
      id,
      content,
      metadata,
      tags: metadata.tags || [],
      created: new Date().toISOString(),
    })
    this.queryCache.clear()
  }

  getSessionInfo(llmId) {
    return this.llmSessions.get(llmId)
  }

  getStats() {
    const sessions = Array.from(this.llmSessions.values())
    const totalQueries = sessions.reduce((sum, s) => sum + s.queryCount, 0)

    return {
      orchestrator: {
        initialized: true,
        timestamp: new Date().toISOString(),
      },
      contextGraph: {
        nodeCount: this.contextGraph.size,
      },
      cache: {
        entries: this.queryCache.size,
      },
      llms: sessions.map((s) => ({
        id: s.id,
        status: s.status,
        queryCount: s.queryCount,
      })),
      permissions: this.permissionFilter.getStats(),
      totalQueries,
    }
  }
}

export { UnifiedQueryOrchestrator }
