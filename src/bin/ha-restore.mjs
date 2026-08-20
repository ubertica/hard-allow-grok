#!/usr/bin/env node
/**
 * Restore a HA snapshot over the live tree. Does NOT disarm, does NOT re-ceremony.
 *
 *   node ~/.grok/hard-allow/bin/ha-restore.mjs list
 *   node ~/.grok/hard-allow/bin/ha-restore.mjs latest
 *   node ~/.grok/hard-allow/bin/ha-restore.mjs <stamp>
 *
 * Takes a safety snapshot first unless --no-safety.
 */
import { existsSync, readFileSync, readdirSync, readlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const HOME = homedir();
const HA = join(HOME, '.grok', 'hard-allow');
const ROOT = join(HOME, '.grok', 'ha-snapshots');
const arg = process.argv[2] || 'latest';
const noSafety = process.argv.includes('--no-safety');

function die(m, c = 1) {
  console.error(m);
  process.exit(c);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) die(`${cmd} failed: ${r.stderr || r.stdout || r.status}`);
  return r;
}

function list() {
  if (!existsSync(ROOT)) return [];
  return readdirSync(ROOT)
    .filter((n) => n !== 'LATEST' && existsSync(join(ROOT, n, 'MANIFEST.json')))
    .sort();
}

if (arg === 'list' || arg === '--list') {
  console.log(
    JSON.stringify(
      { snapshots: list(), latest: existsSync(join(ROOT, 'LATEST')) ? readlinkSync(join(ROOT, 'LATEST')) : null },
      null,
      2,
    ),
  );
  process.exit(0);
}

let stamp = arg;
if (arg === 'latest' || arg === 'LATEST') {
  const lp = join(ROOT, 'LATEST');
  if (!existsSync(lp)) die('no LATEST snapshot. Run ha-snapshot.mjs first.');
  stamp = readlinkSync(lp);
}

const src = join(ROOT, stamp);
if (!existsSync(join(src, 'MANIFEST.json'))) die(`snapshot not found: ${src}`);
const manifest = JSON.parse(readFileSync(join(src, 'MANIFEST.json'), 'utf8'));

if (!noSafety) {
  const snap = join(HA, 'bin', 'ha-snapshot.mjs');
  if (existsSync(snap)) {
    const r = spawnSync(process.execPath, [snap, '--note', `pre-restore-safety before ${stamp}`], { encoding: 'utf8' });
    if (r.status !== 0) console.error('[ha-restore] safety snapshot warning:', r.stderr || r.stdout);
    else console.error('[ha-restore] safety snapshot taken');
  }
}

function rsyncInto(from, to) {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  run('rsync', ['-a', from + '/', to + '/']);
}

rsyncInto(join(src, 'hard-allow'), HA);
rsyncInto(join(src, 'grok-rules'), join(HOME, '.grok', 'rules'));
rsyncInto(join(src, 'claude-rules'), join(HOME, '.claude', 'rules'));

console.log(
  JSON.stringify(
    {
      ok: true,
      restored: stamp,
      note: manifest.note,
      at: manifest.at,
      next: 'files restored. Token/env from snapshot are live. Do not re-arm unless inject is missing.',
    },
    null,
    2,
  ),
);
