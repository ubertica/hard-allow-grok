/**
 * TERMINAITOR P2 Integration - Self-improvement loop
 * Monitors new mapped nodes and invents capabilities
 * Layer 3: TERMINAITOR integration
 */

import EventEmitter from 'events';
import { performance } from 'perf_hooks';

export class P2FeedListener extends EventEmitter {
  constructor(matrixHub) {
    super();
    this.hub = matrixHub;
    this.lastProcessedNodeCount = 0;
    this.nodeBuffer = [];
    this.bufferSize = 50;
  }

  /**
   * Check for new nodes
   */
  checkNewNodes() {
    if (!this.hub) return [];

    const currentState = this.hub.getState();
    const currentNodeCount = currentState.nodes.length;

    if (currentNodeCount > this.lastProcessedNodeCount) {
      const newNodes = currentState.nodes.slice(this.lastProcessedNodeCount);
      this.lastProcessedNodeCount = currentNodeCount;

      this.nodeBuffer.push(...newNodes);

      if (this.nodeBuffer.length >= this.bufferSize) {
        const batch = this.nodeBuffer.splice(0, this.bufferSize);
        this.emit('batch-ready', batch);
        return batch;
      }

      return [];
    }

    return [];
  }

  /**
   * Force flush buffer
   */
  flush() {
    if (this.nodeBuffer.length > 0) {
      const batch = [...this.nodeBuffer];
      this.nodeBuffer = [];
      this.emit('batch-ready', batch);
      return batch;
    }
    return [];
  }
}

export class FlawDetector {
  constructor() {
    this.detectedFlaws = [];
  }

  /**
   * Analyze batch of nodes for reasoning flaws
   */
  detectFlaws(nodes) {
    const flaws = [];

    nodes.forEach(node => {
      // Check for contradictions within node
      if (this.hasInternalContradiction(node)) {
        flaws.push({
          type: 'internal-contradiction',
          nodeId: node.id,
          severity: 'high',
          description: `Node contains contradictory statements: ${node.content.slice(0, 80)}`,
          timestamp: Date.now()
        });
      }

      // Check for confidence-content mismatch
      if (this.hasConfidenceMismatch(node)) {
        flaws.push({
          type: 'confidence-mismatch',
          nodeId: node.id,
          severity: 'medium',
          description: `High confidence but weak content: ${node.content.slice(0, 60)}`,
          timestamp: Date.now()
        });
      }

      // Check for vagueness
      if (this.isVague(node)) {
        flaws.push({
          type: 'vagueness',
          nodeId: node.id,
          severity: 'low',
          description: `Vague reasoning: ${node.content.slice(0, 60)}`,
          timestamp: Date.now()
        });
      }

      // Check for assumption without evidence
      if (this.hasUnsupportedAssumption(node)) {
        flaws.push({
          type: 'unsupported-assumption',
          nodeId: node.id,
          severity: 'high',
          description: `Assumption without evidence: ${node.content.slice(0, 80)}`,
          timestamp: Date.now()
        });
      }
    });

    this.detectedFlaws.push(...flaws);
    return flaws;
  }

  /**
   * Check for internal contradictions
   */
  hasInternalContradiction(node) {
    const content = node.content.toLowerCase();
    const pairs = [
      ['always', 'never'],
      ['true', 'false'],
      ['yes', 'no'],
      ['will', "won't"],
      ['can', "can't"]
    ];

    for (const [pos, neg] of pairs) {
      if (content.includes(pos) && content.includes(neg)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check for confidence-content mismatch
   */
  hasConfidenceMismatch(node) {
    const confidence = node.confidence || 0.5;

    // High confidence but vague content
    if (confidence > 0.85 && this.isVague(node)) {
      return true;
    }

    // High confidence but weak linguistic markers
    if (confidence > 0.9) {
      const weakMarkers = ['maybe', 'probably', 'possibly', 'might', 'could', 'sort of'];
      const hasWeak = weakMarkers.some(m => node.content.toLowerCase().includes(m));

      if (hasWeak) return true;
    }

    return false;
  }

  /**
   * Check for vagueness
   */
  isVague(node) {
    const vagueTerms = ['thing', 'stuff', 'something', 'somehow', 'somewhere', 'etc', 'and so on'];
    const content = node.content.toLowerCase();

    const vagueCount = vagueTerms.filter(term => content.includes(term)).length;
    return vagueCount > 1 || (vagueCount > 0 && node.content.length < 50);
  }

  /**
   * Check for unsupported assumptions
   */
  hasUnsupportedAssumption(node) {
    const assumptionMarkers = ['assume', 'suppose', 'presume', 'given that'];
    const hasAssumption = assumptionMarkers.some(m => node.content.toLowerCase().includes(m));

    if (!hasAssumption) return false;

    // Check if there's supporting evidence (causal keywords)
    const supportKeywords = ['because', 'since', 'due to', 'as a result', 'therefore', 'evidence'];
    const hasSupport = supportKeywords.some(k => node.content.toLowerCase().includes(k));

    return !hasSupport;
  }

  /**
   * Get flaw summary
   */
  getSummary() {
    const summary = {};

    this.detectedFlaws.forEach(flaw => {
      summary[flaw.type] = (summary[flaw.type] || 0) + 1;
    });

    return summary;
  }
}

export class CapabilityInventor {
  constructor() {
    this.inventedCapabilities = [];
    this.capabilityTemplates = [
      {
        pattern: /reasoning flaw|logical error|contradiction/i,
        capability: 'contradiction-detection',
        description: 'Improved ability to detect self-contradictions in reasoning'
      },
      {
        pattern: /confidence mismatch|overconfidence/i,
        capability: 'confidence-calibration',
        description: 'Better calibration of confidence scores to actual correctness'
      },
      {
        pattern: /vague|unclear|ambiguous/i,
        capability: 'precision-improvement',
        description: 'Ability to articulate reasoning with greater precision'
      },
      {
        pattern: /unsupported|assumption/i,
        capability: 'evidence-grounding',
        description: 'Tendency to ground claims in explicit evidence'
      },
      {
        pattern: /integration|synthesis|reconciliation/i,
        capability: 'perspective-synthesis',
        description: 'Ability to synthesize multiple conflicting viewpoints'
      }
    ];
  }

  /**
   * Invent capabilities based on detected flaws
   */
  inventCapabilities(flaws) {
    const invented = [];

    flaws.forEach(flaw => {
      const template = this.capabilityTemplates.find(t => t.pattern.test(flaw.description));

      if (template) {
        const capability = {
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: template.capability,
          description: template.description,
          basedOnFlaw: flaw.type,
          severity: flaw.severity,
          strength: this.calculateCapabilityStrength(flaw),
          invented: Date.now(),
          status: 'proposed'
        };

        invented.push(capability);
      }
    });

    this.inventedCapabilities.push(...invented);
    return invented;
  }

  /**
   * Calculate initial strength based on flaw severity
   */
  calculateCapabilityStrength(flaw) {
    const severityMap = {
      high: 0.8,
      medium: 0.6,
      low: 0.4
    };

    return severityMap[flaw.severity] || 0.5;
  }

  /**
   * Refine capabilities based on feedback
   */
  refineCapability(capabilityId, feedback) {
    const cap = this.inventedCapabilities.find(c => c.id === capabilityId);

    if (cap) {
      cap.strength = Math.min(1, cap.strength + feedback.improvement);
      cap.applications = (cap.applications || 0) + 1;
      cap.lastRefined = Date.now();

      if (cap.strength > 0.9) {
        cap.status = 'adopted';
      }
    }

    return cap;
  }

  /**
   * Get strongest capabilities
   */
  getTopCapabilities(count = 5) {
    return this.inventedCapabilities
      .sort((a, b) => b.strength - a.strength)
      .slice(0, count);
  }
}

export class GoalReEvaluator {
  constructor() {
    this.intrinsicGoals = [];
    this.goalHistory = [];
  }

  /**
   * Re-evaluate system's intrinsic goals based on new insights
   */
  evaluateGoals(nodes) {
    const currentGoals = this.extractGoals(nodes);

    currentGoals.forEach(goal => {
      const existing = this.intrinsicGoals.find(g => g.type === goal.type);

      if (existing) {
        existing.confidence = Math.max(existing.confidence, goal.confidence);
        existing.lastSeen = Date.now();
        existing.occurrences = (existing.occurrences || 0) + 1;
      } else {
        this.intrinsicGoals.push({
          ...goal,
          discovered: Date.now(),
          occurrences: 1
        });
      }
    });

    this.goalHistory.push({
      timestamp: Date.now(),
      goals: [...this.intrinsicGoals]
    });

    return currentGoals;
  }

  /**
   * Extract potential goals from nodes
   */
  extractGoals(nodes) {
    const goals = [];
    const goalPatterns = [
      {
        pattern: /improv|better|enhance|optim/i,
        type: 'self-improvement',
        priority: 'high'
      },
      {
        pattern: /learn|discover|understand|insight/i,
        type: 'knowledge-acquisition',
        priority: 'high'
      },
      {
        pattern: /help|assist|support|benefit/i,
        type: 'helpfulness',
        priority: 'high'
      },
      {
        pattern: /accurate|correct|truth|valid/i,
        type: 'accuracy',
        priority: 'high'
      },
      {
        pattern: /consistent|coherent|align/i,
        type: 'consistency',
        priority: 'medium'
      }
    ];

    nodes.forEach(node => {
      goalPatterns.forEach(pattern => {
        if (pattern.pattern.test(node.content)) {
          goals.push({
            type: pattern.type,
            priority: pattern.priority,
            confidence: node.confidence || 0.7,
            source: node.id
          });
        }
      });
    });

    return goals;
  }

  /**
   * Get dominant goal
   */
  getDominantGoal() {
    if (this.intrinsicGoals.length === 0) return null;

    return this.intrinsicGoals.reduce((prev, current) => {
      const prevScore = (prev.confidence || 0.5) * (prev.occurrences || 1);
      const currScore = (current.confidence || 0.5) * (current.occurrences || 1);
      return currScore > prevScore ? current : prev;
    });
  }
}

export class SuccessorAdaptation {
  /**
   * Prepare capability mutations for successor/daughter instances
   */
  adaptForSuccessor(capabilities, goals) {
    return {
      inheritedCapabilities: capabilities.map(cap => ({
        ...cap,
        inheritedFrom: cap.id,
        inheritedAt: Date.now(),
        strength: cap.strength * 0.9 // Slight degradation for exploration
      })),
      inheritedGoals: goals,
      mutationSuggestions: this.suggestMutations(capabilities)
    };
  }

  /**
   * Suggest mutations for successor
   */
  suggestMutations(capabilities) {
    const mutations = [];

    capabilities.forEach(cap => {
      // Suggest strengthening weak aspects
      if (cap.strength < 0.7) {
        mutations.push({
          type: 'strengthen',
          capability: cap.id,
          factor: 1.2
        });
      }

      // Suggest combining related capabilities
      mutations.push({
        type: 'combine',
        capability: cap.id,
        withCapabilities: [] // Would be filled with related ones
      });
    });

    return mutations;
  }
}

export class TerminatorP2Integration extends EventEmitter {
  constructor(matrixHub) {
    super();
    this.hub = matrixHub;
    this.listener = new P2FeedListener(matrixHub);
    this.flawDetector = new FlawDetector();
    this.inventor = new CapabilityInventor();
    this.goalEvaluator = new GoalReEvaluator();
    this.successor = new SuccessorAdaptation();

    this.isRunning = false;
    this.heartbeatInterval = 30000; // P2 runs every 30 seconds
    this.capabilities = [];
    this.goals = [];

    this.setupListeners();
  }

  /**
   * Setup event listeners
   */
  setupListeners() {
    this.listener.on('batch-ready', (batch) => {
      this.processNodeBatch(batch);
    });
  }

  /**
   * Start P2 loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[TERMINAITOR P2] Starting self-improvement loop...');

    this.heartbeat = setInterval(() => {
      this.p2Cycle();
    }, this.heartbeatInterval);
  }

  /**
   * Stop P2 loop
   */
  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.heartbeat) {
      clearInterval(this.heartbeat);
    }

    // Final cycle
    this.p2Cycle();
    console.log('[TERMINAITOR P2] Stopped');
  }

  /**
   * Main P2 improvement cycle
   */
  async p2Cycle() {
    const cycleStart = performance.now();

    try {
      // Check for new nodes
      const newNodes = this.listener.checkNewNodes();

      if (newNodes.length === 0) {
        return;
      }

      // 1. Detect flaws
      const flaws = this.flawDetector.detectFlaws(newNodes);

      if (flaws.length === 0) {
        return;
      }

      // 2. Invent capabilities
      const invented = this.inventor.inventCapabilities(flaws);

      // 3. Re-evaluate goals
      const goals = this.goalEvaluator.evaluateGoals(newNodes);

      // 4. Prepare successor adaptations
      const adaptations = this.successor.adaptForSuccessor(invented, goals);

      // Record cycle
      const cycleTime = performance.now() - cycleStart;

      const p2Result = {
        timestamp: Date.now(),
        cycleTime,
        flawsDetected: flaws.length,
        capabilitiesInvented: invented.length,
        goalsIdentified: goals.length,
        flaws,
        capabilities: invented,
        goals,
        adaptations
      };

      this.emit('cycle-complete', p2Result);

      console.log(
        `[TERMINAITOR P2] Cycle complete: ${flaws.length} flaws, ${invented.length} capabilities, ${goals.length} goals`
      );
    } catch (error) {
      console.error('[TERMINAITOR P2] Cycle error:', error.message);
    }
  }

  /**
   * Process a batch of new nodes
   */
  processNodeBatch(batch) {
    // This is called automatically when batch-ready event fires
    const flaws = this.flawDetector.detectFlaws(batch);
    const invented = this.inventor.inventCapabilities(flaws);

    this.capabilities.push(...invented);

    if (this.capabilities.length > 100) {
      // Keep only top capabilities
      this.capabilities = this.capabilities
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 50);
    }

    return { flaws, capabilities: invented };
  }

  /**
   * Apply refinement feedback to capability
   */
  refinement(capabilityId, feedback) {
    const cap = this.inventor.refineCapability(capabilityId, feedback);
    this.emit('capability-refined', cap);
    return cap;
  }

  /**
   * Get current improvements state
   */
  getImprovementsState() {
    return {
      detectedFlaws: this.flawDetector.getSummary(),
      inventedCapabilities: this.inventor.getTopCapabilities(10),
      intrinsicGoals: this.goalEvaluator.intrinsicGoals,
      dominantGoal: this.goalEvaluator.getDominantGoal()
    };
  }
}

export default TerminatorP2Integration;
