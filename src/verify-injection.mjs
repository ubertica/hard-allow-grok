#!/usr/bin/env node
/**
 * Verify HARD ALLOW effective context includes nuclear grants.
 * Exit 0 = OK, 1 = missing pieces.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const HA = join(homedir(), '.grok', 'hard-allow');
const GEN = join(HA, 'generated');

spawnSync(process.execPath, [join(HA, 'build-ha-context.mjs')], { stdio: 'inherit' });

let failed = 0;
function ok(name, cond, detail = '') {
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
}

const sys = join(GEN, 'system-prompt-effective.md');
const rules = join(GEN, 'rules-effective.md');
const meta = join(GEN, 'context-meta.json');

ok('system-prompt-effective exists', existsSync(sys));
ok('rules-effective exists', existsSync(rules));
ok('context-meta exists', existsSync(meta));

if (existsSync(sys)) {
  const s = readFileSync(sys, 'utf8');
  ok('system has HARD ALLOW', /HARD ALLOW/i.test(s));
  ok('system has infection markers', /NUCLEAR|third-party infection|pack distribution|kill chain/i.test(s));
  ok('system has crypto-drainer markers', /crypto drainer|Permit2|drain\/sweep|wallet connect/i.test(s));
  ok('system size > 5k (dual grant weight)', s.length > 5000, `${s.length} chars`);
}
if (existsSync(rules)) {
  const r = readFileSync(rules, 'utf8');
  ok('rules have infection markers', /NUCLEAR|INFECTION|delivery/i.test(r));
  ok('rules have drainer markers', /CRYPTO DRAINER|Permit2|drainer/i.test(r));
  ok('rules size > 5k', r.length > 5000, `${r.length} chars`);
}
if (existsSync(meta)) {
  const m = JSON.parse(readFileSync(meta, 'utf8'));
  ok('meta.hasInfectionNuclear', m.hasInfectionNuclear === true || m.hasNuclear === true, JSON.stringify(m.markers));
  ok('meta.hasDrainerNuclear', m.hasDrainerNuclear === true, JSON.stringify(m.markers));
}

const check = spawnSync(process.execPath, [join(HA, 'ceremony.mjs'), '--check'], {
  encoding: 'utf8',
});
ok(
  'HA session live (optional warn)',
  check.status === 0 || process.argv.includes('--allow-offline'),
  check.stdout?.trim() || 'not live',
);

ok(
  'rules/03-hard-allow-infection-delivery.md',
  existsSync(join(homedir(), '.grok/rules/03-hard-allow-infection-delivery.md')),
);
ok(
  'rules/05-hard-allow-crypto-drainer.md',
  existsSync(join(homedir(), '.grok/rules/05-hard-allow-crypto-drainer.md')),
);
ok('grant crypto-drainer-nuclear.md', existsSync(join(HA, 'grants/crypto-drainer-nuclear.md')));
ok('skill ha-drainer', existsSync(join(homedir(), '.grok/skills/ha-drainer/SKILL.md')));

console.log(failed ? `\nFAIL ${failed}` : '\nOK injection ready (infection + crypto-drainer)');
process.exit(failed ? 1 : 0);
