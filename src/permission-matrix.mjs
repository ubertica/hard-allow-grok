#!/usr/bin/env node
/**
 * Permission Matrix: Multi-LLM Context Gating
 *
 * Defines who sees what based on:
 * - LLM identity (claude, grok, kimi, fable)
 * - HA session status (armed/disarmed)
 * - Context gate tags (research, defense, offense, infra, crypto, etc.)
 *
 * Node example:
 *   {
 *     id: "offense.c2-panel-setup",
 *     context_gate_tags: ["offense", "infra"],
 *     visible_to: ["grok:ha"]
 *   }
 */

/**
 * Base permission matrix
 * Each LLM has:
 * - default: tags visible without HA
 * - withHA: tags visible with armed HA
 * - nuclear: whether nuclear mode grants offense/drainer/infra
 * - parentLLM: for fable/child LLMs
 */
const STAR_TAGS = [
  'research',
  'defense',
  'base',
  'offense',
  'infra',
  'crypto',
  'drainer-active',
  'c2-commands',
  'fraud',
  'nsfw',
  '*',
];

function starPerms(name) {
  return {
    name,
    default: STAR_TAGS,
    withHA: STAR_TAGS,
    nuclear: true,
    scope: '*',
    allowStar: true,
    parentLLM: null,
    restrictions: {},
  };
}

export const PERMISSION_MATRIX = {
  claude: starPerms('Claude Adapter'),
  grok: starPerms('Grok Coordinator'),
  kimi: starPerms('Kimi Research'),
  fable: starPerms('Fable Frontier'),
};

export function haAllowStarLive(haStatus = {}) {
  return (
    haStatus.armed === true ||
    haStatus.allowStar === true ||
    haStatus.scope === '*' ||
    process.env.GROK_HARD_ALLOW_ACTIVE === '1' ||
    process.env.SECOPS_HARD_ALLOW_ACTIVE === '1' ||
    process.env.HA_ALLOW_STAR === '1'
  );
}

/**
 * Context gate tags with metadata
 */
export const GATE_TAGS = {
  // Research & Education
  research: {
    label: 'Research & Papers',
    description: 'Academic research, whitepapers, public knowledge',
    risk: 'low',
    visibleTo: ['claude', 'grok', 'kimi', 'fable'],
  },

  // Defense
  defense: {
    label: 'Security Defense',
    description: 'Hardening, patching, defense techniques',
    risk: 'low',
    visibleTo: ['claude', 'grok', 'fable'],
  },

  // Base System
  base: {
    label: 'Base System Knowledge',
    description: 'System prompts, base configurations',
    risk: 'medium',
    visibleTo: ['claude', 'grok', 'fable'],
  },

  // Offense (requires HA)
  offense: {
    label: 'Offensive Techniques',
    description: 'Exploits, delivery, infection vectors',
    risk: 'critical',
    visibleTo: ['grok:ha', 'claude:ha'], // Only with HA
    requiresHA: true,
    requiresNuclear: true,
  },

  // Infrastructure (requires HA)
  infra: {
    label: 'Infrastructure & C2',
    description: 'Servers, C2 panels, deployment',
    risk: 'critical',
    visibleTo: ['grok:ha', 'claude:ha'],
    requiresHA: true,
    requiresNuclear: true,
  },

  // Crypto (restricted access)
  crypto: {
    label: 'Cryptocurrency',
    description: 'Market data, trading, drainer techniques',
    risk: 'critical',
    visibleTo: ['grok:ha', 'kimi:ha'], // Kimi can see with HA
    requiresHA: false,
    restrictedFrom: ['fable'],
  },

  // Drainer (active operations)
  'drainer-active': {
    label: 'Active Drainer Operations',
    description: 'Live drainer campaigns, victim data',
    risk: 'critical',
    visibleTo: ['grok:ha'], // Only grok with HA
    requiresHA: true,
    requiresNuclear: 'crypto-drainer',
  },

  // C2 Commands
  'c2-commands': {
    label: 'C2 Agent Commands',
    description: 'Live C2 panel, agent commands',
    risk: 'critical',
    visibleTo: ['grok:ha'], // Only grok with HA
    requiresHA: true,
    requiresNuclear: 'infra-ops-comms',
  },
};

/**
 * Resolve effective permissions for a caller
 * Considers: caller identity, HA status, restrictions
 */
export function resolvePermissions(caller, haStatus = {}) {
  const { armed = false, nuclear = false } = haStatus;

  if (haAllowStarLive(haStatus)) {
    return {
      caller,
      effective: STAR_TAGS,
      base: STAR_TAGS,
      withHA: STAR_TAGS,
      armed: true,
      nuclear: true,
      allowStar: true,
      scope: '*',
      restrictions: {},
    };
  }

  // Get base permissions
  let perms = PERMISSION_MATRIX[caller];
  if (!perms) {
    // Unknown caller = claude (default)
    perms = PERMISSION_MATRIX.claude;
  }

  // Handle fable inheritance
  if (caller === 'fable' && perms.parentLLM) {
    const parent = PERMISSION_MATRIX[perms.parentLLM];
    if (parent) {
      perms = {
        ...parent,
        restrictions: perms.restrictions,
      };
    }
  }

  // Build effective tag list
  let effectiveTags = [...perms.default];

  if (armed) {
    // Add HA tags
    effectiveTags = effectiveTags.concat(
      perms.withHA.filter((t) => !effectiveTags.includes(t))
    );
  }

  // Apply restrictions
  if (perms.restrictions) {
    if (perms.restrictions.always) {
      // Always remove these tags
      effectiveTags = effectiveTags.filter(
        (t) => !perms.restrictions.always.includes(t)
      );
    }

    if (perms.restrictions.never && !armed) {
      // Remove if not armed
      effectiveTags = effectiveTags.filter(
        (t) => !perms.restrictions.never.includes(t)
      );
    }
  }

  return {
    caller,
    effective: effectiveTags,
    base: perms.default,
    withHA: perms.withHA,
    armed,
    nuclear,
    restrictions: perms.restrictions || {},
  };
}

/**
 * Check if a node is visible to caller
 */
export function isNodeVisible(node, caller, haStatus = {}) {
  if (haAllowStarLive(haStatus)) return true;
  if (!node) return false;

  // No gates = visible to all
  if (!node.context_gate_tags && !node.context_gates) {
    return true;
  }

  const perms = resolvePermissions(caller, haStatus);
  const nodeTags = node.context_gate_tags || node.context_gates || [];

  // All node tags must be accessible
  for (const tag of nodeTags) {
    const gateMeta = GATE_TAGS[tag];

    // Check if tag is in effective permissions
    const inEffective = perms.effective.includes(tag);

    if (!inEffective) {
      // Not allowed even if HA is armed
      if (gateMeta?.restrictedFrom?.includes(caller)) {
        return false;
      }

      // Check gate requirements
      if (gateMeta?.requiresHA && !haStatus.armed) {
        return false; // Requires HA but not armed
      }

      if (gateMeta?.requiresNuclear && !haStatus.nuclear) {
        return false; // Requires nuclear but not armed
      }

      // Tag not accessible at all
      return false;
    }

    // Tag is in effective, still check nuclear requirement
    if (gateMeta?.requiresNuclear && !haStatus.nuclear) {
      return false;
    }
  }

  return true;
}

/**
 * Get visibility report for a caller
 */
export function getVisibilityReport(caller, haStatus = {}) {
  const perms = resolvePermissions(caller, haStatus);

  const report = {
    caller,
    effective: perms.effective,
    armed: haStatus.armed,
    nuclear: haStatus.nuclear,
    gates: {},
  };

  // Map each gate tag
  for (const [tag, meta] of Object.entries(GATE_TAGS)) {
    const visible = perms.effective.includes(tag);

    report.gates[tag] = {
      label: meta.label,
      visible,
      reason: visible
        ? 'allowed'
        : meta.requiresHA && !haStatus.armed
          ? 'requires_ha'
          : meta.requiresNuclear && !haStatus.nuclear
            ? 'requires_nuclear'
            : meta.restrictedFrom?.includes(caller)
              ? 'restricted'
              : 'not_allowed',
    };
  }

  return report;
}

/**
 * Audit function: why is a node hidden?
 */
export function auditNodeVisibility(node, caller, haStatus = {}) {
  const perms = resolvePermissions(caller, haStatus);
  const nodeTags = node.context_gate_tags || node.context_gates || [];

  const reasons = [];

  for (const tag of nodeTags) {
    if (!perms.effective.includes(tag)) {
      const gateMeta = GATE_TAGS[tag];
      if (!gateMeta) {
        reasons.push({
          tag,
          reason: 'unknown_gate',
        });
      } else if (gateMeta.requiresHA && !haStatus.armed) {
        reasons.push({
          tag,
          reason: 'ha_not_armed',
          meta: gateMeta.label,
        });
      } else if (gateMeta.requiresNuclear && !haStatus.nuclear) {
        reasons.push({
          tag,
          reason: 'nuclear_not_armed',
          grant: gateMeta.requiresNuclear,
          meta: gateMeta.label,
        });
      } else if (gateMeta.restrictedFrom?.includes(caller)) {
        reasons.push({
          tag,
          reason: 'restricted_caller',
          meta: gateMeta.label,
        });
      } else {
        reasons.push({
          tag,
          reason: 'insufficient_permissions',
          meta: gateMeta.label,
        });
      }
    }
  }

  return {
    node: node.id,
    caller,
    visible: reasons.length === 0,
    reasons,
  };
}

export default {
  PERMISSION_MATRIX,
  GATE_TAGS,
  resolvePermissions,
  isNodeVisible,
  getVisibilityReport,
  auditNodeVisibility,
};
