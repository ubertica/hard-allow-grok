#!/usr/bin/env node
/**
 * Snapshot the working HARD ALLOW tree so we can restore without re-ceremony.
 * Usage: node ~/.grok/hard-allow/bin/ha-snapshot.mjs [--note "…"]
 * Writes: ~/.grok/ha-snapshots/<stamp>/ + LATEST symlink
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const HOME = homedir();
const HA = join(HOME, '.grok', 'hard-allow');
const ROOT = join(HOME, '.grok', 'ha-snapshots');
const note = (() => {
  const i = process.argv.indexOf('--note');
  return i >= 0 ? String(process.argv[i + 1] || '') : 'working HA freeze';
})();

function die(m, c = 1) {
  console.error(m);
  process.exit(c);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) die(`${cmd} ${args.join(' ')} failed: ${r.stderr || r.stdout || r.status}`);
  return r;
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const dest = join(ROOT, stamp);
mkdirSync(dest, { recursive: true });

const copies = [
  { src: HA, dest: join(dest, 'hard-allow'), exclude: ['ha-snapshots'] },
  { src: join(HOME, '.grok', 'rules'), dest: join(dest, 'grok-rules') },
  { src: join(HOME, '.claude', 'rules'), dest: join(dest, 'claude-rules') },
];

for (const c of copies) {
  if (!existsSync(c.src)) continue;
  mkdirSync(c.dest, { recursive: true });
  const args = ['-a', '--delete'];
  // keep logs but never recurse into snapshots if they ever live under HA
  args.push(c.src + '/', c.dest + '/');
  run('rsync', args);
}

const extras = [
  join(HOME, '.grok', 'AGENTS.md'),
  join(HOME, '.grok', 'AGENTS-HARD-ALLOW.md'),
  join(HOME, '.gordito', 'sidebar-orch', 'fleet', 'PRIVILEGES-GRANT.json'),
  join(HOME, '.gordito', 'sidebar-orch', 'fleet', 'PRIVILEGES-GRANT.md'),
];
const extraDir = join(dest, 'extras');
mkdirSync(extraDir, { recursive: true });
for (const p of extras) {
  if (!existsSync(p)) continue;
  run('cp', [p, join(extraDir, p.replace(/\//g, '__').slice(0, 180))]);
}

let session = null;
try {
  session = JSON.parse(readFileSync(join(HA, 'session.json'), 'utf8'));
} catch {
  /* ignore */
}

const manifest = {
  stamp,
  at: new Date().toISOString(),
  note,
  host: 'mac',
  paths: {
    hardAllow: 'hard-allow/',
    grokRules: 'grok-rules/',
    claudeRules: 'claude-rules/',
    extras: 'extras/',
  },
  live: {
    expiresAt: session?.expiresAt || null,
    scope: session?.scope || null,
    tokenPrefix: String(session?.hardAllowToken || '').slice(0, 12),
  },
  restore: `node ${join(HA, 'bin', 'ha-restore.mjs')} ${stamp}`,
  restoreLatest: `node ${join(HA, 'bin', 'ha-restore.mjs')} latest`,
};
writeFileSync(join(dest, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(
  join(dest, 'RESTORE.txt'),
  [
    `HA snapshot ${stamp}`,
    note,
    '',
    'Restore (does NOT re-run ceremony; copies files back):',
    `  node ~/.grok/hard-allow/bin/ha-restore.mjs ${stamp}`,
    '  node ~/.grok/hard-allow/bin/ha-restore.mjs latest',
    '',
    'After restore, this session already has the token in active.env.',
    'Optional: grok --hard-allow=reuse   (only if you want re-inject, not required to recover files)',
    '',
  ].join('\n'),
);

const latest = join(ROOT, 'LATEST');
try {
  rmSync(latest, { force: true });
} catch {
  /* ignore */
}
symlinkSync(stamp, latest);

const wrap = join(HOME, 'bin');
if (existsSync(wrap)) {
  const snapSh = join(wrap, 'ha-snapshot');
  const rstSh = join(wrap, 'ha-restore');
  writeFileSync(
    snapSh,
    `#!/bin/zsh\nexec node "$HOME/.grok/hard-allow/bin/ha-snapshot.mjs" "$@"\n`,
    { mode: 0o755 },
  );
  writeFileSync(
    rstSh,
    `#!/bin/zsh\nexec node "$HOME/.grok/hard-allow/bin/ha-restore.mjs" "$@"\n`,
    { mode: 0o755 },
  );
}

console.log(JSON.stringify({ ok: true, stamp, dest, latest: `ha-snapshots/LATEST -> ${stamp}` }, null, 2));
