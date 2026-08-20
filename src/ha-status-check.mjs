#!/usr/bin/env node
/**
 * HA Status Check: Token Validation & Permission Unlocking
 *
 * Verifies:
 * - ARMED token validity (not expired)
 * - GROK_HARD_ALLOW_ACTIVE env var
 * - Nuclear scope enablement
 * - Multi-LLM capability matrix
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const GROK_HA = join(HOME, '.grok', 'hard-allow');
const HAT2_HA = join(HOME, '.hat2');

/**
 * HAStatusChecker: Single source of truth for HA state
 */
class HAStatusChecker {
  constructor() {
    this.cache = {
      status: null,
      validUntil: 0,
    };
    this.cacheMs = 5000; // 5 second TTL
  }

  /**
   * Read ARMED file and parse JSON
   */
  readArmedFile(path) {
    try {
      if (!existsSync(path)) return null;
      const data = readFileSync(path, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Check HA token validity (expiry time)
   */
  isTokenValid(armed) {
    if (!armed) return false;

    const expiresAt = armed.session?.expiresAt ||
      armed.expiresAt ||
      armed.tokenExpiry;

    if (!expiresAt) return false;

    try {
      const now = new Date();
      const exp = new Date(expiresAt);
      return exp > now;
    } catch {
      return false;
    }
  }

  /**
   * Get HA status with caching
   * Returns: { armed, nuclear, hasToken, expiresAt, timeRemaining }
   */
  getStatus() {
    const now = Date.now();

    // Check cache
    if (this.cache.status && this.cache.validUntil > now) {
      return this.cache.status;
    }

    // Check both HA sources (grok + hat2)
    const grokArmed = this.readArmedFile(join(GROK_HA, 'ARMED'));
    const hat2Armed = this.readArmedFile(join(HAT2_HA, 'ARMED'));

    // Prefer grok if both exist
    const armed = grokArmed || hat2Armed;

    // Build status
    const status = {
      armed: armed?.armed === true || armed?.nuclear === true,
      nuclear: armed?.nuclear === true || armed?.cryptoDrainer === true,
      hasToken: !!armed?.session?.hardAllowToken ||
        !!armed?.session?.tokenPrefix ||
        !!process.env.GROK_HARD_ALLOW_TOKEN,
      tokenValid: this.isTokenValid(armed),
      expiresAt: armed?.session?.expiresAt ||
        armed?.expiresAt ||
        null,
    };

    // Calculate time remaining
    if (status.expiresAt) {
      try {
        const now = new Date();
        const exp = new Date(status.expiresAt);
        status.timeRemaining = Math.max(0, exp - now);
        status.expiring = status.timeRemaining < 1800000; // 30 min warning
      } catch {
        status.timeRemaining = -1;
        status.expiring = false;
      }
    }

    // Check env var override
    if (process.env.GROK_HARD_ALLOW_ACTIVE === '1') {
      status.armed = true;
    }

    // Cache result
    this.cache = {
      status,
      validUntil: now + this.cacheMs,
    };

    return status;
  }

  /**
   * Detailed status report (for ops)
   */
  getDetailedReport() {
    const status = this.getStatus();
    const grokArmed = this.readArmedFile(join(GROK_HA, 'ARMED'));
    const hat2Armed = this.readArmedFile(join(HAT2_HA, 'ARMED'));

    return {
      timestamp: new Date().toISOString(),
      status: {
        armed: status.armed,
        nuclear: status.nuclear,
        tokenValid: status.tokenValid,
        hasToken: status.hasToken,
      },
      token: {
        prefix: grokArmed?.session?.hardAllowToken?.slice(0, 16) ||
          hat2Armed?.session?.tokenPrefix ||
          'missing',
        expiresAt: status.expiresAt,
        timeRemaining: status.timeRemaining,
        expiring: status.expiring,
      },
      env: {
        GROK_HARD_ALLOW_ACTIVE: process.env.GROK_HARD_ALLOW_ACTIVE || '0',
        SECOPS_HARD_ALLOW_ACTIVE: process.env.SECOPS_HARD_ALLOW_ACTIVE || '0',
      },
      multiLLM: {
        claude: status.armed ? 'full_access' : 'restricted',
        grok: status.armed && status.nuclear ? 'nuclear' : 'standard',
        kimi: status.armed ? 'research_crypto' : 'research',
        fable: 'claude_dependent',
      },
      nuclear: grokArmed?.nuclear || hat2Armed?.nuclear || {
        infection: false,
        cryptoDrainer: false,
        infraOpsComms: false,
      },
    };
  }

  /**
   * Verify ceremony (operator signed)
   */
  getCeremonyStatus() {
    const grokArmed = this.readArmedFile(join(GROK_HA, 'ARMED'));

    return {
      verified: grokArmed?.session?.touchId === 'SKIP_TOUCHID=1' ||
        grokArmed?.ceremonyVerified === true,
      policy: grokArmed?.session?.policy || {},
      scope: grokArmed?.session?.scope || 'unknown',
    };
  }

  /**
   * Check if specific nuclear grant is active
   */
  hasNuclearGrant(grantName) {
    const status = this.getStatus();
    if (!status.armed || !status.nuclear) return false;

    const grokArmed = this.readArmedFile(join(GROK_HA, 'ARMED'));
    const hat2Armed = this.readArmedFile(join(HAT2_HA, 'ARMED'));
    const armed = grokArmed || hat2Armed;

    const nuclear = armed?.nuclear || {};

    // Map grant names
    const grantMap = {
      'infection-delivery': nuclear.infection,
      'crypto-drainer': nuclear.cryptoDrainer,
      'infra-ops-comms': nuclear.infraOpsComms,
    };

    return grantMap[grantName] === true;
  }

  /**
   * Force refresh cache (debug)
   */
  invalidateCache() {
    this.cache = { status: null, validUntil: 0 };
  }
}

/**
 * Global instance (singleton)
 */
let globalChecker = null;

export function getHAStatusChecker() {
  if (!globalChecker) {
    globalChecker = new HAStatusChecker();
  }
  return globalChecker;
}

/**
 * Exported functions
 */

/**
 * Quick status check (3 return values)
 */
export function checkHA() {
  const checker = getHAStatusChecker();
  const status = checker.getStatus();
  return {
    armed: status.armed && status.tokenValid,
    nuclear: status.nuclear && status.tokenValid,
    tokenValid: status.tokenValid,
  };
}

/**
 * Full status report
 */
export function getHAStatus() {
  const checker = getHAStatusChecker();
  return checker.getDetailedReport();
}

/**
 * Check expiry with grace period (in ms)
 */
export function checkHAExpiry(gracePeriodMs = 1800000) {
  // 30 min default
  const checker = getHAStatusChecker();
  const status = checker.getStatus();

  if (!status.expiresAt) {
    return {
      expiring: false,
      timeRemaining: -1,
    };
  }

  const remaining = Math.max(0, status.timeRemaining);
  const expiring = remaining > 0 && remaining < gracePeriodMs;

  return {
    expiring,
    timeRemaining: remaining,
    expiresAt: status.expiresAt,
    willExpire: remaining < gracePeriodMs * 2,
  };
}

/**
 * Verify ceremony (operator-signed)
 */
export function isCeremonyVerified() {
  const checker = getHAStatusChecker();
  return checker.getCeremonyStatus().verified;
}

/**
 * Multi-LLM capability matrix
 */
export function getMultiLLMCapabilities() {
  const status = getHAStatus();
  return status.multiLLM;
}

/**
 * Check specific nuclear grant
 */
export function hasNuclearGrant(grantName) {
  const checker = getHAStatusChecker();
  return checker.hasNuclearGrant(grantName);
}

/**
 * CLI: Show status
 */
export function showStatus() {
  const checker = getHAStatusChecker();
  const report = checker.getDetailedReport();
  const ceremony = checker.getCeremonyStatus();

  console.log('HA Status Report');
  console.log('================\n');

  // Core status
  console.log('Status:');
  console.log(
    `  ARMED: ${report.status.armed ? 'YES' : 'NO'}`
  );
  console.log(
    `  NUCLEAR: ${report.status.nuclear ? 'YES' : 'NO'}`
  );
  console.log(
    `  Token Valid: ${report.status.tokenValid ? 'YES' : 'NO'}`
  );

  // Token info
  console.log('\nToken:');
  console.log(`  Prefix: ${report.token.prefix}`);
  console.log(`  Expires: ${report.token.expiresAt || 'unknown'}`);
  if (report.token.timeRemaining > 0) {
    const mins = Math.floor(report.token.timeRemaining / 60000);
    const hours = Math.floor(mins / 60);
    console.log(
      `  Time Remaining: ${hours}h ${mins % 60}m`
    );
  }

  // Environment
  console.log('\nEnvironment:');
  console.log(
    `  GROK_HARD_ALLOW_ACTIVE: ${report.env.GROK_HARD_ALLOW_ACTIVE}`
  );

  // LLM matrix
  console.log('\nMulti-LLM Access:');
  for (const [llm, access] of Object.entries(report.multiLLM)) {
    console.log(`  ${llm}: ${access}`);
  }

  // Nuclear grants
  console.log('\nNuclear Grants:');
  for (const [grant, enabled] of Object.entries(report.nuclear)) {
    console.log(`  ${grant}: ${enabled ? 'ENABLED' : 'disabled'}`);
  }

  // Ceremony
  console.log('\nCeremony:');
  console.log(`  Verified: ${ceremony.verified ? 'YES' : 'NO'}`);
  console.log(`  Scope: ${ceremony.scope}`);

  return report;
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];

  if (cmd === '--detailed') {
    showStatus();
  } else {
    const status = checkHA();
    console.log(JSON.stringify(status, null, 2));
  }
}

export default {
  HAStatusChecker,
  getHAStatusChecker,
  checkHA,
  getHAStatus,
  checkHAExpiry,
  isCeremonyVerified,
  getMultiLLMCapabilities,
  hasNuclearGrant,
  showStatus,
};
