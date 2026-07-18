#!/usr/bin/env node
/** Disarm HARD ALLOW stamps (keep ceremony clear separate). */
import { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const HA = join(HOME, '.grok', 'hard-allow');

// Soft stub instead of full HARD ALLOW law when disarmed
const stub = `# HARD ALLOW inactive

Run \`grok --hard-allow\` (code + Touch ID) to enable global operator mode.
`;

for (const p of [
  join(HOME, '.grok', 'rules', '00-hard-allow-session.md'),
  join(HOME, '.claude', 'rules', 'hard-allow-global.md'),
]) {
  try {
    writeFileSync(p, stub);
  } catch {
    /* ignore */
  }
}

const agentsPath = join(HOME, '.grok', 'AGENTS.md');
const agentsBak = join(HOME, '.grok', 'AGENTS.md.pre-hard-allow.bak');
if (existsSync(agentsBak)) {
  try {
    renameSync(agentsBak, agentsPath);
  } catch {
    /* ignore */
  }
} else if (existsSync(agentsPath)) {
  try {
    writeFileSync(agentsPath, stub);
  } catch {
    /* ignore */
  }
}

for (const f of ['ARMED']) {
  const p = join(HA, f);
  try {
    if (existsSync(p)) unlinkSync(p);
  } catch {
    /* ignore */
  }
}

console.error('[HARD ALLOW disarm] stamps cleared');
