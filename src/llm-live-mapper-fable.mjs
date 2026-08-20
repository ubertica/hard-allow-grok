/**
 * FABLE Live Mapper - Async reasoning-to-node extraction
 * Captures Fable's reasoning stream and extracts semantic nodes in real-time
 * Part of Universal Live Context Mapping System for multi-LLM matrix
 */

import EventEmitter from 'events';
import { performance } from 'perf_hooks';

export class MessageStreamAnalyzer extends EventEmitter {
  constructor() {
    super();
    this.buffer = '';
    this.tokens = [];
    this.startTime = null;
  }

  feedToken(token) {
    if (!this.startTime) this.startTime = performance.now();
    this.buffer += token;
    this.tokens.push({ text: token, timestamp: performance.now(), position: this.tokens.length });

    if (this.buffer.length > 200 || token.includes('\n\n')) {
      this.emit('chunk', this.buffer);
      this.buffer = '';
    }
  }

  finalize() {
    if (this.buffer) this.emit('chunk', this.buffer);
    this.emit('end', {
      totalTokens: this.tokens.length,
      duration: performance.now() - this.startTime,
      tokenList: this.tokens
    });
  }

  reset() {
    this.buffer = '';
    this.tokens = [];
    this.startTime = null;
  }
}

export class NodeExtractor {
  constructor() {
    this.nodes = [];
  }

  extract(text) {
    const nodes = [];
    const entities = this.extractEntities(text);
    const relationships = this.extractRelationships(text);
    const decisions = this.extractDecisions(text);
    const contextualInsights = this.extractContextualInsights(text);

    entities.forEach((entity, idx) => {
      nodes.push({
        id: `entity_${Date.now()}_${idx}`,
        type: 'entity',
        content: entity,
        confidence: 0.85,
        source: 'fable',
        timestamp: Date.now(),
        reasoning: true
      });
    });

    relationships.forEach((rel, idx) => {
      nodes.push({
        id: `relationship_${Date.now()}_${idx}`,
        type: 'relationship',
        content: rel,
        confidence: 0.80,
        source: 'fable',
        timestamp: Date.now(),
        reasoning: true
      });
    });

    decisions.forEach((decision, idx) => {
      nodes.push({
        id: `decision_${Date.now()}_${idx}`,
        type: 'decision',
        content: decision,
        confidence: 0.90,
        source: 'fable',
        timestamp: Date.now(),
        reasoning: true
      });
    });

    contextualInsights.forEach((insight, idx) => {
      nodes.push({
        id: `insight_${Date.now()}_${idx}`,
        type: 'contextual_insight',
        content: insight,
        confidence: 0.82,
        source: 'fable',
        timestamp: Date.now(),
        reasoning: true
      });
    });

    this.nodes = [...this.nodes, ...nodes];
    return nodes;
  }

  extractEntities(text) {
    const entities = [];
    const sentences = text.split(/[.!?]/);

    sentences.forEach(sent => {
      sent = sent.trim();
      if (sent.length > 10 && sent.length < 150) {
        entities.push(sent);
      }
    });

    return entities.slice(0, 6);
  }

  extractRelationships(text) {
    const relationships = [];
    const relPatterns = [
      /(\w+)\s+(?:relates to|connects to|influences|impacts|correlates with)\s+(.+?)(?:\.|,)/gi,
      /(?:the interaction between|interplay of)\s+(.+?)\s+and\s+(.+?)(?:\.|,)/gi
    ];

    relPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[2]) {
          relationships.push({
            source: match[1].trim().slice(0, 50),
            target: match[2].trim().slice(0, 50),
            relation: 'relates_to'
          });
        }
      }
    });

    return relationships.slice(0, 6);
  }

  extractDecisions(text) {
    const decisions = [];
    const decisionKeywords = ['should', 'must', 'will', 'can', 'recommend', 'suggest', 'propose', 'advocate'];

    decisionKeywords.forEach(keyword => {
      const regex = new RegExp(`(?:i |we |fable )?(?:${keyword})[\\w\\s]*\\s+(.+?)(?:\\.\\s|,|$)`, 'gi');
      const matches = text.matchAll(regex);
      for (const match of matches) {
        if (match[1]) {
          decisions.push({
            action: keyword,
            target: match[1].trim().slice(0, 100)
          });
        }
      }
    });

    return decisions.slice(0, 4);
  }

  extractContextualInsights(text) {
    const insights = [];
    const insightPatterns = [
      /(?:contextually|importantly|notably|significantly)\s+(?:,\s+)?(.+?)(?:\.|,|$)/gi,
      /(?:in light of|considering|given)\s+(.+?)(?:\.|,|$)/gi
    ];

    insightPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          insights.push(match[1].trim().slice(0, 120));
        }
      }
    });

    return insights.slice(0, 3);
  }

  getExtractedNodes() {
    return this.nodes;
  }

  reset() {
    this.nodes = [];
  }
}

export class RelationshipBuilder {
  constructor() {
    this.edges = [];
  }

  buildRelationships(nodes) {
    const edges = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const edge = this.createEdge(nodes[i], nodes[j]);
        if (edge) edges.push(edge);
      }
    }

    nodes.forEach((node, idx) => {
      if (idx < nodes.length - 1) {
        edges.push({
          id: `edge_temporal_${node.id}_${nodes[idx + 1].id}`,
          source: node.id,
          target: nodes[idx + 1].id,
          relation: 'precedes',
          weight: 0.6,
          timestamp: Date.now()
        });
      }
    });

    this.edges = [...this.edges, ...edges];
    return edges;
  }

  createEdge(nodeA, nodeB) {
    const similarity = this.calculateSimilarity(nodeA.content, nodeB.content);

    if (similarity > 0.5) {
      return {
        id: `edge_${nodeA.id}_${nodeB.id}`,
        source: nodeA.id,
        target: nodeB.id,
        relation: nodeA.type === 'decision' && nodeB.type === 'entity' ? 'applies_to' : 'relates_to',
        weight: similarity,
        timestamp: Date.now()
      };
    }

    return null;
  }

  calculateSimilarity(textA, textB) {
    const wordsA = new Set(textA.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(textB.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;

    return union > 0 ? intersection / union : 0;
  }

  getEdges() {
    return this.edges;
  }

  reset() {
    this.edges = [];
  }
}

export class ConflictDetector {
  constructor() {
    this.contradictions = [];
    this.learnings = [];
  }

  detectConflicts(nodes) {
    const conflicts = [];

    nodes.forEach((node, idx) => {
      const negationPattern = /(?:not|no|don't|doesn't|won't|can't|never|false|contradicts|opposes|conflicts)/i;
      const isNegation = negationPattern.test(node.content);

      nodes.slice(idx + 1).forEach(otherNode => {
        if (this.isContradiction(node, otherNode, isNegation)) {
          conflicts.push({
            id: `conflict_${node.id}_${otherNode.id}`,
            nodeA: node.id,
            nodeB: otherNode.id,
            type: 'contradiction',
            severity: 'high',
            timestamp: Date.now(),
            details: `"${node.content.slice(0, 50)}" contradicts "${otherNode.content.slice(0, 50)}"`
          });
        }
      });
    });

    this.contradictions = [...this.contradictions, ...conflicts];
    return conflicts;
  }

  isContradiction(nodeA, nodeB, isNegation) {
    if (nodeA.type !== nodeB.type) return false;

    const contentA = nodeA.content.toLowerCase();
    const contentB = nodeB.content.toLowerCase();

    const wordsA = new Set(contentA.split(/\s+/));
    const overlap = [...wordsA].filter(w => contentB.includes(w)).length;
    const negationPattern = /(?:not|no|contradicts|opposes)/i;

    return overlap > 3 && (isNegation || negationPattern.test(nodeB.content));
  }

  extractLearnings(nodes) {
    const learnings = [];
    const learningPatterns = [
      /(?:this demonstrates|this reveals|this shows|this exposes)\s+(?:that\s+)?(.+?)(?:\.|,|$)/gi,
      /(?:key insight|critical learning|notable discovery)[\w\s]*:\s*(.+?)(?:\.|,|$)/gi
    ];

    nodes.forEach(node => {
      learningPatterns.forEach(pattern => {
        const matches = node.content.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            learnings.push({
              id: `learning_${node.id}`,
              content: match[1].trim().slice(0, 150),
              source: node.id,
              timestamp: Date.now(),
              type: 'insight'
            });
          }
        }
      });
    });

    this.learnings = [...this.learnings, ...learnings];
    return learnings;
  }

  getConflicts() {
    return this.contradictions;
  }

  getLearnings() {
    return this.learnings;
  }

  reset() {
    this.contradictions = [];
    this.learnings = [];
  }
}

export class BatchPublisher {
  constructor(queuePath) {
    this.queuePath = queuePath;
    this.batch = [];
    this.batchSize = 10;
    this.publishInterval = 500;
    this.lastPublish = Date.now();
  }

  queueNodes(nodes, metadata = {}) {
    this.batch.push(
      ...nodes.map(node => ({
        ...node,
        metadata,
        queuedAt: Date.now(),
        llm: 'fable'
      }))
    );

    if (this.batch.length >= this.batchSize) {
      this.publishBatch();
    } else if (Date.now() - this.lastPublish > this.publishInterval) {
      this.publishBatch();
    }
  }

  async publishBatch() {
    if (this.batch.length === 0) return;

    const toPublish = [...this.batch];
    this.batch = [];
    this.lastPublish = Date.now();

    setImmediate(async () => {
      try {
        const fs = await import('fs').then(m => m.promises);
        const path = await import('path').then(m => m.default);

        const queueDir = path.dirname(this.queuePath);
        await fs.mkdir(queueDir, { recursive: true });

        const lines = toPublish.map(item => JSON.stringify(item)).join('\n');
        await fs.appendFile(this.queuePath, lines + '\n');
      } catch (error) {
        console.error('BatchPublisher error:', error.message);
      }
    });
  }

  async flush() {
    if (this.batch.length > 0) {
      await this.publishBatch();
    }
  }
}

export class FableLiveMapper {
  constructor(queuePath = `${process.env.HOME}/.grok/hard-allow/node-queue-fable.jsonl`) {
    this.analyzer = new MessageStreamAnalyzer();
    this.extractor = new NodeExtractor();
    this.relationshipBuilder = new RelationshipBuilder();
    this.conflictDetector = new ConflictDetector();
    this.publisher = new BatchPublisher(queuePath);

    this.setupListeners();
  }

  setupListeners() {
    this.analyzer.on('chunk', (chunk) => {
      const nodes = this.extractor.extract(chunk);
      const edges = this.relationshipBuilder.buildRelationships(nodes);
      const conflicts = this.conflictDetector.detectConflicts(nodes);
      const learnings = this.conflictDetector.extractLearnings(nodes);

      this.publisher.queueNodes(nodes, { edges, conflicts, learnings });
    });

    this.analyzer.on('end', async (stats) => {
      console.log(`[FABLE Mapper] Extracted ${this.extractor.getExtractedNodes().length} nodes`);
      await this.publisher.flush();
    });
  }

  startMapping() {
    this.analyzer.reset();
    this.extractor.reset();
    this.relationshipBuilder.reset();
    this.conflictDetector.reset();
  }

  feedToken(token) {
    this.analyzer.feedToken(token);
  }

  endMapping() {
    this.analyzer.finalize();
  }

  getState() {
    return {
      nodes: this.extractor.getExtractedNodes(),
      edges: this.relationshipBuilder.getEdges(),
      conflicts: this.conflictDetector.getConflicts(),
      learnings: this.conflictDetector.getLearnings()
    };
  }
}

export default FableLiveMapper;
