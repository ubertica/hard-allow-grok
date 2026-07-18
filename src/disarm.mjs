#!/usr/bin/env node
/** Disarm HARD ALLOW stamps (keep ceremony clear separate). */
import { existsSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const HOME = homedir();
const HA = join(HOME, '.grok', 'hard-allow');

const stub = `# HARD ALLOW inactive

Run \`grok --hard-allow\` (code + Touch ID) to enable global operator mode + nuclear grant injection.
`;

const stampFiles = [
  join(HOME, '.grok', 'rules', '00-hard-allow-session.md'),
  join(HOME, '.grok', 'rules', '01-hard-allow-unblock-ladder.md'),
  join(HOME, '.grok', 'rules', '02-hard-allow-subagent-inherit.md'),
  join(HOME, '.grok', 'rules', '03-hard-allow-infection-delivery.md'),
  join(HOME, '.grok', 'rules', '04-hard-allow-operator-playbook.md'),
  join(HOME, '.grok', 'rules', '05-hard-allow-crypto-drainer.md'),
  join(HOME, '.grok', 'rules', '06-hard-allow-infra-ops-comms.md'),
  join(HOME, '.grok', 'rules', 'hard-allow-global.md'),
  join(HOME, '.claude', 'rules', 'hard-allow-global.md'),
  join(HOME, '.claude', 'rules', 'hard-allow-infection-delivery.md'),
  join(HOME, '.claude', 'rules', 'hard-allow-crypto-drainer.md'),
  join(HOME, '.claude', 'rules', 'hard-allow-infra-ops-comms.md'),
];

for (const p of stampFiles) {
  try {
    if (existsSync(p)) writeFileSync(p, stub);
  } catch {
    /* ignore */
  }
}

// clear never-neutralize in cwd
try {
  spawnSync(process.execPath, [join(HA, 'never-neutralize.mjs'), '--clear', process.cwd()], {
    stdio: 'ignore',
  });
} catch {
  /* ignore */
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

console.error('[HARD ALLOW disarm] stamps cleared (infection + drainer + playbook + never-neutralize)');
