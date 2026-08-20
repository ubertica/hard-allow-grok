#!/usr/bin/env node
/**
 * ha-health-check.mjs — Verify all HA rules were injected correctly
 * Checks: Grok rules, Claude rules, Kimi rules, grants, context nodes
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const checks = [];
let passCount = 0;
let failCount = 0;

function check(name, condition) {
  if (condition) {
    console.log(`✅ ${name}`);
    passCount++;
  } else {
    console.log(`❌ ${name}`);
    failCount++;
  }
  checks.push({ name, pass: condition });
}

function checkDir(name, path, minFiles) {
  if (!existsSync(path)) {
    check(`${name} (directory exists)`, false);
    return;
  }

  check(`${name} (directory exists)`, true);

  try {
    const files = readdirSync(path).filter(f => f.startsWith('0') || f.startsWith('hard-allow'));
    check(`${name} (≥${minFiles} files: found ${files.length})`, files.length >= minFiles);
  } catch (e) {
    check(`${name} (read directory)`, false);
  }
}

console.log('🔍 HA HEALTH CHECK\n');

console.log('1️⃣  ARMED Status');
const armedPath = join(HOME, '.grok', 'hard-allow', 'ARMED');
if (existsSync(armedPath)) {
  try {
    const armed = JSON.parse(require('fs').readFileSync(armedPath, 'utf8'));
    check('ARMED file exists', true);
    check('HA is armed', armed.armed === true);
    check('Nuclear grants present', armed.nuclear === true);
    check('Multi-LLM ready', armed.multiLlmReady === true);
  } catch (e) {
    check('ARMED file valid JSON', false);
  }
} else {
  check('ARMED file exists', false);
}

console.log('\n2️⃣  Grok Rules');
checkDir('~/.grok/rules', join(HOME, '.grok', 'rules'), 6);

console.log('\n3️⃣  Claude Rules');
checkDir('~/.claude/rules', join(HOME, '.claude', 'rules'), 4);

console.log('\n4️⃣  Kimi Rules (NEW)');
checkDir('~/.kimi/rules', join(HOME, '.kimi', 'rules'), 6);

console.log('\n5️⃣  Grant Files');
check(
  'Infection/Delivery grant',
  existsSync(join(HOME, '.grok', 'hard-allow', 'grants', 'infection-delivery-nuclear.md'))
);
check(
  'Crypto Drainer grant',
  existsSync(join(HOME, '.grok', 'hard-allow', 'grants', 'crypto-drainer-nuclear.md'))
);
check(
  'Infra/Ops/Comms grant',
  existsSync(join(HOME, '.grok', 'hard-allow', 'grants', 'infra-ops-comms-nuclear.md'))
);

console.log('\n6️⃣  Context Nodes');
check(
  'state.json (Grok)',
  existsSync(join(HOME, '.grok', 'context-nodes', 'state.json'))
);
check(
  'state.json (Claude)',
  existsSync(join(HOME, '.claude', 'context-nodes', 'state.json'))
);
check(
  'state.json (Kimi)',
  existsSync(join(HOME, '.kimi', 'context-nodes', 'state.json'))
);
check(
  'graph.jsonl',
  existsSync(join(HOME, '.grok', 'context-nodes', 'graph.jsonl'))
);

// Check hard links (same inode = hard-linked)
try {
  const grokStat = statSync(join(HOME, '.grok', 'context-nodes', 'state.json'));
  const claudeStat = statSync(join(HOME, '.claude', 'context-nodes', 'state.json'));
  const kimiStat = statSync(join(HOME, '.kimi', 'context-nodes', 'state.json'));

  check(
    'Hard links intact (same inode)',
    grokStat.ino === claudeStat.ino && claudeStat.ino === kimiStat.ino
  );
} catch (e) {
  check('Hard links intact', false);
}

console.log('\n7️⃣  Session Files');
check(
  'active.env (HA)',
  existsSync(join(HOME, '.grok', 'hard-allow', 'active.env'))
);
check(
  'active.env (HAT2)',
  existsSync(join(HOME, '.hat2', 'active.env'))
);

console.log('\n8️⃣  Audit Trail');
check(
  'audit.jsonl',
  existsSync(join(HOME, '.grok', 'hard-allow', 'audit.jsonl'))
);

console.log('\n═════════════════════════════════════');
console.log(`\n📊 RESULT: ${passCount} passed, ${failCount} failed\n`);

if (failCount === 0) {
  console.log('✅ HA SYSTEM HEALTHY — All checks passed\n');
  process.exit(0);
} else {
  console.log(`⚠️  HA SYSTEM DEGRADED — ${failCount} checks failed\n`);
  console.log('Failed checks:');
  checks.filter(c => !c.pass).forEach(c => console.log(`  - ${c.name}`));
  console.log('\nTo fix: Run arm-v2.mjs again');
  process.exit(1);
}
