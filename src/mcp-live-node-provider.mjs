/**
 * MCP Live Node Provider - Expose live-mapped nodes to LLMs
 * Integrates with context_query_pipeline for real-time node serving
 * Layer 4: MCP Integration
 */

import { performance } from 'perf_hooks';

export class LiveNodeProvider {
  constructor(matrixHub) {
    this.hub = matrixHub;
    this.sessionActivations = new Map(); // Track activations per session
    this.sessionStart = Date.now();
    this.contextCache = new Map(); // Cache query results
    this.cacheExpiry = 5000; // 5 seconds
  }

  /**
   * Query live nodes for context
   * Called by LLM's context_query_pipeline
   */
  async queryNodes(query, options = {}) {
    const cacheKey = `${query}_${JSON.stringify(options)}`;
    const cached = this.contextCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.result;
    }

    const result = this.executeQuery(query, options);
    this.contextCache.set(cacheKey, { result, timestamp: Date.now() });

    return result;
  }

  /**
   * Execute query against hub state
   */
  executeQuery(query, options) {
    if (!this.hub) return [];

    const state = this.hub.getState();
    const matches = [];

    // Text matching
    state.nodes.forEach(node => {
      const similarity = this.textSimilarity(query, node.content);

      if (similarity > 0.3) {
        const scored = this.scoreNode(node, similarity, options);
        matches.push(scored);
      }
    });

    // Sort by score
    matches.sort((a, b) => b.score - a.score);

    // Limit results
    const limit = options.limit || 10;
    return matches.slice(0, limit);
  }

  /**
   * Score a node based on query match and metadata
   */
  scoreNode(node, textSimilarity, options = {}) {
    const activation = this.hub.semanticPipeline
      ? this.hub.semanticPipeline.getActivation(node.id) || 0
      : 0;

    const recencyScore = this.getRecencyScore(node);
    const sessionBoost = this.getSessionBoost(node);

    // Scoring formula: text_match * 0.3 + recency * 0.4 + activation * 0.3
    const score =
      textSimilarity * 0.3 +
      recencyScore * 0.4 +
      activation * 0.3 +
      sessionBoost;

    return {
      ...node,
      score,
      matchDetails: {
        textSimilarity,
        recency: recencyScore,
        activation,
        sessionBoost
      }
    };
  }

  /**
   * Calculate recency score (nodes created recently score higher)
   */
  getRecencyScore(node) {
    const ageMs = Date.now() - node.timestamp;
    const ageSec = ageMs / 1000;

    // Half-life: 5 minutes (300 seconds)
    const halfLife = 300;
    const recency = Math.pow(0.5, ageSec / halfLife);

    return Math.max(0, Math.min(1, recency));
  }

  /**
   * Session-specific activation boost
   * Nodes created during current session get priority
   */
  getSessionBoost(node) {
    const sessionAge = Date.now() - this.sessionStart;
    const nodeAge = Date.now() - node.timestamp;

    // If node created during this session, boost it
    if (nodeAge < sessionAge) {
      const boost = 0.2 * (1 - nodeAge / sessionAge);
      return Math.min(0.2, boost);
    }

    return 0;
  }

  /**
   * Simple text similarity (word overlap)
   */
  textSimilarity(queryStr, contentStr) {
    const queryWords = new Set(
      queryStr.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    );
    const contentWords = new Set(
      contentStr.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    );

    const intersection = [...queryWords].filter(w => contentWords.has(w)).length;
    const union = new Set([...queryWords, ...contentWords]).size;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Get nodes by type
   */
  getNodesByType(type) {
    if (!this.hub) return [];

    return this.hub
      .getState()
      .nodes.filter(n => n.type === type)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get high-activation nodes
   */
  getHighActivationNodes(threshold = 0.7, limit = 10) {
    if (!this.hub) return [];

    const nodes = this.hub.getState().nodes;
    const activations = this.hub.semanticPipeline
      ? this.hub.semanticPipeline.exportActivations()
      : {};

    return nodes
      .map(node => ({
        ...node,
        activation: activations[node.id] || 0
      }))
      .filter(n => n.activation >= threshold)
      .sort((a, b) => b.activation - a.activation)
      .slice(0, limit);
  }

  /**
   * Get recent nodes
   */
  getRecentNodes(durationMs = 60000, limit = 20) {
    if (!this.hub) return [];

    const cutoff = Date.now() - durationMs;

    return this.hub
      .getState()
      .nodes.filter(n => n.timestamp > cutoff)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.contextCache.clear();
  }
}

export class PriorityRanking {
  /**
   * Advanced ranking with multiple factors
   */
  static rankNodes(nodes, query, options = {}) {
    return nodes
      .map(node => {
        const factors = {
          textMatch: this.scoreTextMatch(query, node),
          recency: this.scoreRecency(node),
          activation: node.activation || 0,
          confidence: node.confidence || 0.5,
          sessionRelevance: this.scoreSessionRelevance(node)
        };

        const weights = options.weights || {
          textMatch: 0.25,
          recency: 0.35,
          activation: 0.25,
          confidence: 0.1,
          sessionRelevance: 0.05
        };

        const score = Object.keys(factors).reduce((sum, key) => {
          return sum + factors[key] * (weights[key] || 0);
        }, 0);

        return { ...node, score, factors };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Score text match
   */
  static scoreTextMatch(query, node) {
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const contentWords = new Set(node.content.toLowerCase().split(/\s+/));

    const intersection = [...queryWords].filter(w => contentWords.has(w)).length;
    const union = new Set([...queryWords, ...contentWords]).size;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Score recency
   */
  static scoreRecency(node) {
    const ageMs = Date.now() - node.timestamp;
    const ageMin = ageMs / 60000;

    // Exponential decay: 1.0 at 0 min, 0.5 at 5 min, 0.25 at 10 min
    return Math.pow(0.5, ageMin / 5);
  }

  /**
   * Score session relevance
   */
  static scoreSessionRelevance(node) {
    // If node was created recently in context of current query, boost it
    if (node.reasoning) return 0.8;
    return 0.3;
  }
}

export class ContextGating {
  /**
   * Apply LLM-specific permissions to returned nodes
   */
  static applyGating(nodes, llm) {
    const gateRules = {
      grok: {
        allowedTypes: ['all'],
        maxNodes: 100,
        minConfidence: 0.5
      },
      claude: {
        allowedTypes: ['entity', 'relationship', 'decision'],
        maxNodes: 50,
        minConfidence: 0.6,
        excludeConflicts: true
      },
      kimi: {
        allowedTypes: ['entity', 'decision'],
        maxNodes: 30,
        minConfidence: 0.65,
        excludeConflicts: true
      },
      fable: {
        allowedTypes: ['entity', 'relationship', 'decision', 'contextual_insight'],
        maxNodes: 40,
        minConfidence: 0.55
      }
    };

    const rules = gateRules[llm] || gateRules.claude;

    // Filter by type
    let filtered = nodes;
    if (rules.allowedTypes[0] !== 'all') {
      filtered = nodes.filter(n => rules.allowedTypes.includes(n.type));
    }

    // Filter by confidence
    filtered = filtered.filter(n => (n.confidence || 0.5) >= rules.minConfidence);

    // Exclude conflicts if needed
    if (rules.excludeConflicts) {
      filtered = filtered.filter(n => !n.resolution || n.resolution.status !== 'conflict');
    }

    // Limit count
    return filtered.slice(0, rules.maxNodes);
  }
}

export class ActivationBoosting {
  /**
   * Boost activation for nodes created in current session
   */
  static boostSessionNodes(nodes, sessionStart) {
    const sessionDuration = Date.now() - sessionStart;

    return nodes.map(node => {
      const nodeAge = Date.now() - node.timestamp;

      // If created during this session, boost activation
      if (nodeAge < sessionDuration) {
        const boostFactor = 1.5; // 50% boost
        return {
          ...node,
          activation: (node.activation || 0.5) * boostFactor,
          boosted: true
        };
      }

      return node;
    });
  }

  /**
   * Boost decision nodes
   */
  static boostDecisionNodes(nodes) {
    return nodes.map(node => {
      if (node.type === 'decision') {
        return {
          ...node,
          activation: Math.min(1, (node.activation || 0.5) * 1.3),
          boosted: true
        };
      }
      return node;
    });
  }

  /**
   * Boost learning/insight nodes
   */
  static boostLearningNodes(nodes) {
    return nodes.map(node => {
      if (node.type === 'insight' || node.type === 'learning') {
        return {
          ...node,
          activation: Math.min(1, (node.activation || 0.5) * 1.25),
          boosted: true
        };
      }
      return node;
    });
  }
}

export class MCPLiveNodeIntegration {
  constructor(matrixHub) {
    this.provider = new LiveNodeProvider(matrixHub);
    this.hub = matrixHub;
  }

  /**
   * Main MCP integration point
   * Called by context_query_pipeline
   */
  async provideContext(query, llm, options = {}) {
    // Query live nodes
    const nodes = await this.provider.queryNodes(query, options);

    // Rank by priority
    const ranked = PriorityRanking.rankNodes(nodes, query, options);

    // Apply LLM-specific gating
    const gated = ContextGating.applyGating(ranked, llm);

    // Boost session/decision/learning nodes
    let boosted = ActivationBoosting.boostSessionNodes(gated, this.provider.sessionStart);
    boosted = ActivationBoosting.boostDecisionNodes(boosted);
    boosted = ActivationBoosting.boostLearningNodes(boosted);

    // Re-rank after boosting
    const final = PriorityRanking.rankNodes(boosted, query, options);

    return {
      nodes: final,
      metadata: {
        queryTime: Date.now(),
        llm,
        count: final.length,
        availableTotal: nodes.length,
        gated: gated.length
      }
    };
  }

  /**
   * Get context for current conversation
   */
  async getConversationContext(llm) {
    // Get recent high-activation nodes
    const recentHighActivation = this.provider.getHighActivationNodes(0.6, 15);
    const recent = this.provider.getRecentNodes(300000, 20); // 5 min

    const combined = [...new Set([...recentHighActivation, ...recent])];
    const gated = ContextGating.applyGating(combined, llm);

    return {
      context: gated,
      metadata: {
        llm,
        timestamp: Date.now(),
        recentNodes: recent.length,
        highActivationNodes: recentHighActivation.length
      }
    };
  }

  /**
   * Clear caches
   */
  clearCaches() {
    this.provider.clearCache();
  }
}

export default MCPLiveNodeIntegration;
