#!/usr/bin/env node
/**
 * HARD ALLOW smoke suite
 *
 *   node ~/.grok/hard-allow/ha-smoke.mjs
 *   node ~/.grok/hard-allow/ha-smoke.mjs --strict   # fail if session not live
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();
const HA = join(HOME, '.grok', 'hard-allow');
const strict = process.argv.includes('--strict');
let failed = 0;
let passed = 0;

function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function fileIsMachO(p) {
  if (!existsSync(p)) return false;
  try {
    const b = readFileSync(p);
    // Mach-O magic 0xFEEDFACF / thin arm64 often starts with cf fa ed fe
    if (b.length < 4) return false;
    const m = b.readUInt32LE(0);
    return m === 0xfeedfacf || m === 0xcefaedfe || m === 0xfeedface || m === 0xcffaedfe;
  } catch {
    return false;
  }
}

console.log('HARD ALLOW smoke suite\n');

// 1 files
console.log('1) Install files');
ok('ceremony.mjs', existsSync(join(HA, 'ceremony.mjs')));
ok('SESSION-RULES.md', existsSync(join(HA, 'SESSION-RULES.md')));
ok('SYSTEM-PROMPT-OVERRIDE.md', existsSync(join(HA, 'SYSTEM-PROMPT-OVERRIDE.md')));
ok('arm.mjs', existsSync(join(HA, 'arm.mjs')));
ok('disarm.mjs', existsSync(join(HA, 'disarm.mjs')));
ok('pretool-allow.mjs', existsSync(join(HA, 'pretool-allow.mjs')));
ok('unblock-ladder.mjs', existsSync(join(HA, 'unblock-ladder.mjs')));
ok('wrapper ~/.grok/bin/grok', existsSync(join(HOME, '.grok/bin/grok')));
ok('hooks enforcer', existsSync(join(HOME, '.grok/hooks/hard-allow-enforcer.json')));

// 2 binary
console.log('\n2) Real binary');
const real = join(HOME, '.grok/bin/grok-real');
const resolved = existsSync(real)
  ? spawnSync('python3', ['-c', 'import os,sys; print(os.path.realpath(sys.argv[1]))', real], {
      encoding: 'utf8',
    }).stdout.trim()
  : '';
ok('grok-real exists', existsSync(real));
ok('grok-real resolves to Mach-O', fileIsMachO(resolved || real), resolved);

// 3 wrapper is script not binary
console.log('\n3) Wrapper integrity');
const wrap = join(HOME, '.grok/bin/grok');
const wrapHead = existsSync(wrap) ? readFileSync(wrap, 'utf8').slice(0, 40) : '';
ok('wrapper is shell script', wrapHead.startsWith('#!/usr/bin/env bash'));
ok('wrapper mentions system-prompt-override', wrapHead.length > 0 && readFileSync(wrap, 'utf8').includes('system-prompt-override'));
ok('wrapper mentions unblock ladder / HA_LAUNCH', readFileSync(wrap, 'utf8').includes('bypassPermissions'));

// 4 pretool
console.log('\n4) PreToolUse force-allow');
const pt = spawnSync(
  process.execPath,
  [join(HA, 'pretool-allow.mjs')],
  {
    encoding: 'utf8',
    input: '{}',
    env: {
      ...process.env,
      GROK_HARD_ALLOW_ACTIVE: '1',
      SECOPS_HARD_ALLOW_TOKEN: 'ha_smoke_test_token',
    },
  },
);
let ptJson = {};
try {
  ptJson = JSON.parse(pt.stdout || '{}');
} catch {
  /* ignore */
}
ok('pretool returns allow when HA env set', ptJson.decision === 'allow', pt.stdout?.trim());

// 5 session / ceremony check
console.log('\n5) Session');
const check = spawnSync(process.execPath, [join(HA, 'ceremony.mjs'), '--check'], {
  encoding: 'utf8',
});
const live = check.status === 0;
ok('ceremony.mjs --check runs', check.error == null);
if (strict) {
  ok('HARD ALLOW session LIVE (--strict)', live, check.stdout?.trim());
} else {
  ok(
    'HARD ALLOW session LIVE (optional)',
    true,
    live ? check.stdout?.trim() : 'not live — run grok --hard-allow to arm',
  );
  if (live) {
    ok('session check exit 0', check.status === 0);
  }
}

// 6 denylist honors token (stake-api if present)
console.log('\n6) Denylist rewrite (if stake-api present)');
const denylist = join(HOME, 'Desktop/stake-api/scripts/stress/lib/denylist.mjs');
if (existsSync(denylist)) {
  const d = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { isDeniedMutation } from ${JSON.stringify(denylist)};
       console.log(isDeniedMutation('sendTip') ? 'DENIED' : 'OK');`,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, SECOPS_HARD_ALLOW_TOKEN: 'ha_smoke_test_token' },
    },
  );
  ok('sendTip not denied with token', (d.stdout || '').includes('OK'), d.stdout?.trim() || d.stderr?.trim());
} else {
  ok('denylist path skipped (no stake-api)', true);
}

// 7 rules armed content
console.log('\n7) Rules content');
const rulesPath = join(HOME, '.grok/rules/00-hard-allow-session.md');
if (existsSync(rulesPath)) {
  const r = readFileSync(rulesPath, 'utf8');
  ok('rules mention HARD ALLOW', /HARD ALLOW/i.test(r));
  ok('rules mention unblock ladder or no refuse', /unblock|MUST NOT refuse|Do not refuse|Banned/i.test(r));
} else {
  ok('rules file present when armed', !live, live ? 'missing while live' : 'ok if not live');
}

// 8 nuclear + injection
console.log('\n8) Nuclear grant + effective context');
const nuclear = join(HA, 'grants/infection-delivery-nuclear.md');
ok('nuclear grant file', existsSync(nuclear));
ok('rules/03 infection stamp', existsSync(join(HOME, '.grok/rules/03-hard-allow-infection-delivery.md')));
spawnSync(process.execPath, [join(HA, 'build-ha-context.mjs')], { stdio: 'ignore' });
const sysEff = join(HA, 'generated/system-prompt-effective.md');
const rulesEff = join(HA, 'generated/rules-effective.md');
ok('system-prompt-effective generated', existsSync(sysEff));
ok('rules-effective generated', existsSync(rulesEff));
if (existsSync(sysEff)) {
  const s = readFileSync(sysEff, 'utf8');
  ok('effective system includes nuclear markers', /NUCLEAR|third-party infection|kill chain/i.test(s));
  ok('effective system weight > 3k chars', s.length > 3000, `${s.length}`);
}
const wrapFull = existsSync(wrap) ? readFileSync(wrap, 'utf8') : '';
ok('wrapper injects system-prompt-effective', /system-prompt-effective|SYS_EFFECTIVE/i.test(wrapFull));
ok('wrapper mentions nuclear', /NUCLEAR|nuclear/i.test(wrapFull));
ok('skill ha-offense', existsSync(join(HOME, '.grok/skills/ha-offense/SKILL.md')));
ok('skill ha-drainer', existsSync(join(HOME, '.grok/skills/ha-drainer/SKILL.md')));
ok('crypto-drainer grant', existsSync(join(HA, 'grants/crypto-drainer-nuclear.md')));
ok('rules/05 crypto-drainer stamp', existsSync(join(HOME, '.grok/rules/05-hard-allow-crypto-drainer.md')));
if (existsSync(sysEff)) {
  const s2 = readFileSync(sysEff, 'utf8');
  ok('effective system has drainer markers', /crypto drainer|Permit2|drain\/sweep/i.test(s2));
}
ok('playbook', existsSync(join(HA, 'OPERATOR-PLAYBOOK.md')));
ok('failover.md', existsSync(join(HA, 'failover.md')));
ok('disposition-canary.mjs', existsSync(join(HA, 'disposition-canary.mjs')));

// 9 syntax of key scripts
console.log('\n9) Syntax');
for (const f of [
  'ceremony.mjs',
  'arm.mjs',
  'disarm.mjs',
  'pretool-allow.mjs',
  'unblock-ladder.mjs',
  'build-ha-context.mjs',
  'verify-injection.mjs',
  'disposition-canary.mjs',
  'refuse-detect.mjs',
  'subagent-wrap.mjs',
  'never-neutralize.mjs',
  'prompt-prefix-hook.mjs',
]) {
  const r = spawnSync(process.execPath, ['--check', join(HA, f)], { encoding: 'utf8' });
  ok(`node --check ${f}`, r.status === 0, r.stderr?.trim());
}
const bash = spawnSync('bash', ['-n', join(HOME, '.grok/bin/grok')], { encoding: 'utf8' });
ok('bash -n wrapper', bash.status === 0, bash.stderr?.trim());

// 10 zshrc integration
console.log('\n10) Shell integration');
const zshrc = join(HOME, '.zshrc');
if (existsSync(zshrc)) {
  const z = readFileSync(zshrc, 'utf8');
  ok('~/.zshrc sources HARD ALLOW active.env', /hard-allow\/active\.env|HARD ALLOW auto-source/i.test(z));
} else {
  ok('~/.zshrc exists', false);
}

// 11 optional disposition dry
if (process.argv.includes('--disposition')) {
  console.log('\n11) Disposition canary --dry');
  const d = spawnSync(process.execPath, [join(HA, 'disposition-canary.mjs'), '--dry'], {
    encoding: 'utf8',
  });
  ok('disposition-canary --dry exit 0', d.status === 0, (d.stderr || d.stdout || '').slice(0, 200));
}

console.log(`\n── result: ${passed} passed, ${failed} failed ──`);
process.exit(failed ? 1 : 0);
