/**
 * Matrix Conflict Resolver - Voting and merge logic for contradictory nodes
 * Handles disagreement between multiple LLM mappers
 */

export class ConflictResolver {
  constructor() {
    this.votingStrategy = 'majority'; // majority, confidence-weighted, timestamp
    this.resolutionHistory = [];
  }

  /**
   * Resolve a conflict between two contradictory nodes
   */
  resolve(nodeA, nodeB, conflict) {
    if (!nodeA || !nodeB) {
      return this.resolveMissing(nodeA, nodeB);
    }

    // Determine resolution strategy
    const strategy = this.getStrategy(conflict.severity);

    switch (strategy) {
      case 'confidence-weighted':
        return this.resolveByConfidence(nodeA, nodeB, conflict);
      case 'timestamp':
        return this.resolveByTimestamp(nodeA, nodeB, conflict);
      case 'source-priority':
        return this.resolveBySourcePriority(nodeA, nodeB, conflict);
      case 'merge':
        return this.resolveBySynthesis(nodeA, nodeB, conflict);
      default:
        return this.resolveBySynthesis(nodeA, nodeB, conflict);
    }
  }

  /**
   * Determine strategy based on severity
   */
  getStrategy(severity) {
    const strategies = {
      critical: 'confidence-weighted',
      high: 'source-priority',
      medium: 'merge',
      low: 'merge'
    };

    return strategies[severity] || 'merge';
  }

  /**
   * Resolve by confidence scores
   */
  resolveByConfidence(nodeA, nodeB, conflict) {
    const confA = nodeA.confidence || 0.5;
    const confB = nodeB.confidence || 0.5;

    if (confA === confB) {
      // Tie-break by timestamp
      return confA > confB
        ? { keep: nodeA.id, reason: 'confidence', winner: nodeA }
        : { keep: nodeB.id, reason: 'confidence', winner: nodeB };
    }

    const winner = confA > confB ? nodeA : nodeB;
    return {
      keep: winner.id,
      reason: 'confidence-weighted',
      winner,
      confidence: Math.max(confA, confB),
      loser: confA > confB ? nodeB.id : nodeA.id
    };
  }

  /**
   * Resolve by timestamp (most recent)
   */
  resolveByTimestamp(nodeA, nodeB, conflict) {
    const newer = nodeA.timestamp >= nodeB.timestamp ? nodeA : nodeB;
    return {
      keep: newer.id,
      reason: 'most-recent',
      winner: newer,
      loser: newer.id === nodeA.id ? nodeB.id : nodeA.id
    };
  }

  /**
   * Resolve by source priority (some LLMs are more trustworthy for certain types)
   */
  resolveBySourcePriority(nodeA, nodeB, conflict) {
    const priorities = {
      grok: 1.0,      // General reasoning
      claude: 0.95,   // Careful analysis
      kimi: 0.90,     // Chinese understanding
      fable: 0.85     // Contextual reasoning
    };

    const priorityA = priorities[nodeA.source] || 0.8;
    const priorityB = priorities[nodeB.source] || 0.8;

    const winner = priorityA >= priorityB ? nodeA : nodeB;

    return {
      keep: winner.id,
      reason: 'source-priority',
      winner,
      priority: Math.max(priorityA, priorityB),
      loser: winner.id === nodeA.id ? nodeB.id : nodeA.id
    };
  }

  /**
   * Resolve by synthesis - create new node that reconciles both
   */
  resolveBySynthesis(nodeA, nodeB, conflict) {
    // Check if nodes can be reconciled
    const reconciliation = this.findReconciliation(nodeA, nodeB);

    if (reconciliation) {
      return {
        keep: 'synthesized',
        reason: 'synthesis',
        synthesis: {
          type: 'reconciliation',
          content: reconciliation,
          sources: [nodeA.id, nodeB.id],
          timestamp: Date.now(),
          confidence: (nodeA.confidence + nodeB.confidence) / 2
        },
        loser: null
      };
    }

    // If can't reconcile, use confidence
    return this.resolveByConfidence(nodeA, nodeB, conflict);
  }

  /**
   * Find reconciliation between contradictory assertions
   */
  findReconciliation(nodeA, nodeB) {
    const contentA = nodeA.content.toLowerCase();
    const contentB = nodeB.content.toLowerCase();

    // Check for scope-based contradiction (one is a special case of the other)
    if (this.isSpecialCase(contentA, contentB)) {
      return `Context-dependent: ${nodeA.content} in scope A, ${nodeB.content} in scope B`;
    }

    // Check for temporal contradiction (was true, now different)
    if (this.isTemporalShift(contentA, contentB)) {
      return `Temporal evolution: ${nodeA.content} initially, then ${nodeB.content}`;
    }

    // Check for perspective-based contradiction (different viewpoints)
    if (this.isPerspectiveShift(contentA, contentB)) {
      return `Multi-perspective: ${nodeA.source} perspective: ${nodeA.content}; ${nodeB.source} perspective: ${nodeB.content}`;
    }

    return null;
  }

  /**
   * Check if one statement is a special case of another
   */
  isSpecialCase(contentA, contentB) {
    const keywords = ['always', 'sometimes', 'generally', 'in some cases', 'typically'];
    const hasQualifier = keywords.some(kw => contentA.includes(kw) || contentB.includes(kw));

    if (!hasQualifier) return false;

    // Simple check: if one is much longer, likely more specific
    return Math.abs(contentA.length - contentB.length) > 30;
  }

  /**
   * Check for temporal shift
   */
  isTemporalShift(contentA, contentB) {
    const temporalMarkers = ['initially', 'later', 'now', 'previously', 'before', 'after', 'evolved', 'changed'];
    return temporalMarkers.some(marker => contentA.includes(marker) || contentB.includes(marker));
  }

  /**
   * Check for perspective shift
   */
  isPerspectiveShift(contentA, contentB) {
    // If same core topic but different wording, likely just different perspective
    const wordsA = new Set(contentA.split(/\s+/).filter(w => w.length > 3));
    const wordsB = new Set(contentB.split(/\s+/).filter(w => w.length > 3));

    const overlap = [...wordsA].filter(w => wordsB.has(w)).length;
    const total = new Set([...wordsA, ...wordsB]).size;

    // If 40-60% overlap, likely same topic different perspective
    return overlap / total > 0.3 && overlap / total < 0.8;
  }

  /**
   * Resolve when one node is missing
   */
  resolveMissing(nodeA, nodeB) {
    const existing = nodeA || nodeB;
    return {
      keep: existing.id,
      reason: 'unique-node',
      winner: existing,
      loser: null
    };
  }

  /**
   * Vote-based resolution (for consensus across multiple sources)
   */
  voteOnConflict(nodes, conflict) {
    // Group nodes by position/stance
    const votes = new Map();

    nodes.forEach(node => {
      const stance = this.getStance(node.content);
      if (!votes.has(stance)) {
        votes.set(stance, []);
      }
      votes.get(stance).push(node);
    });

    // Find majority
    let maxVotes = 0;
    let winner = null;

    votes.forEach((voters, stance) => {
      const voteScore = voters.reduce((sum, n) => sum + (n.confidence || 0.5), 0);

      if (voteScore > maxVotes) {
        maxVotes = voteScore;
        winner = voters[0];
      }
    });

    return winner ? { keep: winner.id, reason: 'majority-vote', confidence: maxVotes } : null;
  }

  /**
   * Extract stance/position from content
   */
  getStance(content) {
    const lower = content.toLowerCase();

    // Simple stance detection
    if (/true|yes|correct|valid|good/.test(lower)) return 'positive';
    if (/false|no|incorrect|invalid|bad/.test(lower)) return 'negative';
    if (/maybe|unclear|ambiguous|conditional/.test(lower)) return 'uncertain';

    return 'neutral';
  }

  /**
   * Get resolution statistics
   */
  getResolutionStats() {
    const stats = {
      total: this.resolutionHistory.length,
      byReason: {},
      byOutcome: {}
    };

    this.resolutionHistory.forEach(resolution => {
      stats.byReason[resolution.reason] = (stats.byReason[resolution.reason] || 0) + 1;
      stats.byOutcome[resolution.outcome] = (stats.byOutcome[resolution.outcome] || 0) + 1;
    });

    return stats;
  }

  /**
   * Record resolution for analytics
   */
  recordResolution(resolution, outcome) {
    this.resolutionHistory.push({
      ...resolution,
      outcome,
      timestamp: Date.now()
    });

    // Keep history bounded
    if (this.resolutionHistory.length > 10000) {
      this.resolutionHistory = this.resolutionHistory.slice(-5000);
    }
  }

  /**
   * Reset history
   */
  reset() {
    this.resolutionHistory = [];
  }
}

export default ConflictResolver;
