#!/usr/bin/env node
/**
 * ha-status.mjs — Quick HA health dashboard
 * Shows: armed status, token expiry, rules injection, context nodes, audit trail
 */
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();

function timeRemaining(expiresAt) {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires - now;
  const diffHours = Math.round(diffMs / 1000 / 60 / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 0) return '⏰ EXPIRED';
  if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h remaining`;
  return `${diffHours}h remaining`;
}

function countRules(dir) {
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter(f => f.startsWith('0') || f.startsWith('hard-allow')).length;
  } catch {
    return 0;
  }
}

function isSynced(file1, file2) {
  if (!existsSync(file1) || !existsSync(file2)) return false;
  try {
    const stat1 = statSync(file1);
    const stat2 = statSync(file2);
    return stat1.ino === stat2.ino; // Same inode = hard-linked
  } catch {
    return false;
  }
}

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║         HARD ALLOW STATUS DASHBOARD            ║');
console.log('╚══════════════════════════════════════════════════╝\n');

// 1. HA Status
const armedPath = join(HOME, '.grok', 'hard-allow', 'ARMED');
let armed = false;
let expiresAt = null;
let isMultiLlmReady = false;

if (existsSync(armedPath)) {
  try {
    const state = JSON.parse(readFileSync(armedPath, 'utf8'));
    armed = state.armed === true;
    expiresAt = state.session?.expiresAt;
    isMultiLlmReady = state.multiLlmReady === true;
  } catch (e) {
    console.error('⚠️  Could not read ARMED file');
  }
}

console.log('🛡️  HA Status');
console.log(`  Status: ${armed ? '🟢 ARMED' : '🔴 DISARMED'}`);
if (expiresAt) {
  console.log(`  Expires: ${timeRemaining(expiresAt)}`);
  console.log(`  Expires at: ${new Date(expiresAt).toLocaleString()}`);
}
console.log(`  Multi-LLM: ${isMultiLlmReady ? '✅ Ready' : '⚠️  Not ready'}`);

// 2. Rules Injection
console.log('\n📋 Rules Injection');
const grokRules = countRules(join(HOME, '.grok', 'rules'));
const claudeRules = countRules(join(HOME, '.claude', 'rules'));
const kimiRules = countRules(join(HOME, '.kimi', 'rules'));

console.log(`  Grok:   ${grokRules}/7 rules injected`);
console.log(`  Claude: ${claudeRules}/4 rules injected`);
console.log(`  Kimi:   ${kimiRules}/7 rules injected`);

if (grokRules === 7 && claudeRules >= 4 && kimiRules === 7) {
  console.log('  Status: ✅ All LLMs ready');
} else if (grokRules === 7 && claudeRules >= 4) {
  console.log('  Status: ⚠️  Kimi rules missing');
} else {
  console.log('  Status: ❌ Incomplete injection');
}

// 3. Context Nodes
console.log('\n📦 Context Nodes');
const stateGrok = join(HOME, '.grok', 'context-nodes', 'state.json');
const stateClaude = join(HOME, '.claude', 'context-nodes', 'state.json');
const stateKimi = join(HOME, '.kimi', 'context-nodes', 'state.json');

const hasGrok = existsSync(stateGrok);
const hasClaude = existsSync(stateClaude);
const hasKimi = existsSync(stateKimi);

console.log(`  Grok:   ${hasGrok ? '✅ Present' : '❌ Missing'}`);
console.log(`  Claude: ${hasClaude ? '✅ Present' : '❌ Missing'}`);
console.log(`  Kimi:   ${hasKimi ? '✅ Present' : '❌ Missing'}`);

const syncedGrokClaude = isSynced(stateGrok, stateClaude);
const syncedGrokKimi = isSynced(stateGrok, stateKimi);

if (syncedGrokClaude && syncedGrokKimi) {
  console.log('  Sync:   ✅ Hard-linked (same inode)');
} else if (syncedGrokClaude || syncedGrokKimi) {
  console.log('  Sync:   ⚠️  Partial sync (not all hard-linked)');
} else {
  console.log('  Sync:   ❌ Out of sync (different inodes)');
}

// 4. Audit Trail
console.log('\n📊 Audit Trail');
const auditPath = join(HOME, '.grok', 'hard-allow', 'audit.jsonl');
if (existsSync(auditPath)) {
  try {
    const lines = readFileSync(auditPath, 'utf8').split('\n').filter(l => l).length;
    console.log(`  Executions logged: ${lines}`);
    console.log('  Status: ✅ Audit trail active');
  } catch (e) {
    console.log('  Status: ⚠️  Could not read audit log');
  }
} else {
  console.log('  Executions logged: 0');
  console.log('  Status: ⏸️  Audit trail not started');
}

// 5. Disposition Canary
console.log('\n🕵️  Disposition Canary');
const dispoPath = join(HOME, '.grok', 'hard-allow', 'disposition-results.jsonl');
if (existsSync(dispoPath)) {
  try {
    const stat = statSync(dispoPath);
    const ageDays = (Date.now() - stat.mtime) / 1000 / 60 / 60 / 24;
    if (ageDays < 1) {
      console.log(`  Last run: Today (${ageDays.toFixed(1)}h ago)`);
      console.log('  Status: ✅ Fresh');
    } else if (ageDays < 7) {
      console.log(`  Last run: ${ageDays.toFixed(1)} days ago`);
      console.log('  Status: ⚠️  Stale (run disposition-canary.mjs)');
    } else {
      console.log(`  Last run: ${ageDays.toFixed(0)} days ago`);
      console.log('  Status: ❌ Very stale');
    }
  } catch (e) {
    console.log('  Status: ⚠️  Could not read disposition file');
  }
} else {
  console.log('  Last run: Never');
  console.log('  Status: ⏸️  Not initialized (run: bash ~/.grok/hard-allow/disposition-scheduler.sh)');
}

// Summary
console.log('\n═════════════════════════════════════════════════');

const allReady = armed && grokRules === 7 && claudeRules >= 4 && kimiRules === 7 && hasGrok && hasClaude && hasKimi;

if (allReady) {
  console.log('✅ HA SYSTEM READY — All checks pass');
} else if (armed && grokRules === 7) {
  console.log('⚠️  HA ARMED but incomplete multi-LLM setup');
  console.log('   Fix: Run arm-v2.mjs to re-inject rules to all LLMs');
} else {
  console.log('❌ HA SYSTEM NEEDS ATTENTION');
  console.log('   Fix: Run ceremony (grok --hard-allow) to re-arm');
}

console.log('\n');
