#!/usr/bin/env node
/**
 * Build a shareable HA installer (no session token / no operator.json).
 *
 *   node ~/.grok/hard-allow/installer/build.mjs
 * Output: ~/.grok/hard-allow/installer/dist/ha-setup-<stamp>.{tgz,sh}
 */
import { mkdirSync, writeFileSync, copyFileSync, existsSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HA = join(homedir(), '.grok', 'hard-allow');
const DIST = join(__dirname, 'dist');
const STAGE = join(DIST, 'stage');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const EXCLUDES = [
  'session.json',
  'active.env',
  'active.env.bak-pre-sync-planes',
  'ARMED',
  'operator.json',
  '*.jsonl',
  '*.log',
  'installer/dist',
  'semantic-maps',
  'kimi-claude-sessions.jsonl',
];

function die(m) {
  console.error(m);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) die(`${cmd} ${args.join(' ')}: ${r.stderr || r.stdout || r.status}`);
  return r;
}

rmSync(STAGE, { recursive: true, force: true });
mkdirSync(join(STAGE, 'payload', 'ha'), { recursive: true });
mkdirSync(join(STAGE, 'payload', 'wrappers'), { recursive: true });

const rsyncArgs = ['-a'];
for (const e of EXCLUDES) rsyncArgs.push('--exclude', e);
rsyncArgs.push(HA + '/', join(STAGE, 'payload', 'ha') + '/');
run('rsync', rsyncArgs);

copyFileSync(join(__dirname, 'install.mjs'), join(STAGE, 'payload', 'install.mjs'));
copyFileSync(join(__dirname, 'detect-grok.mjs'), join(STAGE, 'payload', 'detect-grok.mjs'));
const wrapSrc = join(__dirname, 'wrappers');
if (existsSync(wrapSrc)) {
  run('rsync', ['-a', wrapSrc + '/', join(STAGE, 'payload', 'wrappers') + '/']);
}

writeFileSync(
  join(STAGE, 'payload', 'README.md'),
  `# HARD ALLOW setup

1. \`node install.mjs\` (or run the self-extracting \`ha-setup.sh\`)
2. \`--init\` sets YOUR security code + confirm method (Touch ID / sudo / TOTP / …)
3. \`node ~/.grok/hard-allow/ceremony.mjs\` or \`grok --hard-allow\`

This pack does **not** include anyone else's session token.
`,
);

writeFileSync(
  join(STAGE, 'install.sh'),
  `#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
export HA_PAYLOAD="$DIR/payload"
exec node "$DIR/payload/install.mjs" "$@"
`,
);

writeFileSync(
  join(STAGE, 'install.ps1'),
  `$ErrorActionPreference = "Stop"
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:HA_PAYLOAD = Join-Path $Dir "payload"
node (Join-Path $Dir "payload\\install.mjs") @args
`,
);

const tgz = join(DIST, `ha-setup-${stamp}.tgz`);
run('tar', ['-czf', tgz, '-C', STAGE, '.']);

const tgzBuf = readFileSync(tgz);
const shPath = join(DIST, `ha-setup-${stamp}.sh`);
const header = `#!/usr/bin/env bash
# HARD ALLOW self-extracting installer — no live token inside.
set -euo pipefail
TMP="\$(mktemp -d \${TMPDIR:-/tmp}/ha-setup.XXXXXX)"
cleanup() { rm -rf "\$TMP"; }
trap cleanup EXIT
ARCHIVE_LINE="\$(awk '/^#__HA_ARCHIVE_BELOW__$/ { print NR + 1; exit }' "\$0")"
tail -n +"\$ARCHIVE_LINE" "\$0" | tar -xz -C "\$TMP"
export HA_PAYLOAD="\$TMP/payload"
node "\$TMP/payload/install.mjs" "\$@"
exit \$?
#__HA_ARCHIVE_BELOW__
`;
writeFileSync(shPath, header);
const { appendFileSync } = await import('node:fs');
appendFileSync(shPath, tgzBuf);
try {
  chmodSync(shPath, 0o755);
} catch {
  /* ignore */
}

function scanLiveToken(dir) {
  const sess = join(HA, 'session.json');
  if (!existsSync(sess)) return [];
  let tok = '';
  try {
    tok = JSON.parse(readFileSync(sess, 'utf8')).hardAllowToken || '';
  } catch {
    return [];
  }
  if (!tok || tok.length < 20) return [];
  const r = spawnSync('grep', ['-r', '-l', '-F', tok, dir], { encoding: 'utf8' });
  return (r.stdout || '').trim().split('\n').filter(Boolean);
}

const leaked = scanLiveToken(join(STAGE, 'payload', 'ha'));
if (leaked.length) {
  console.error('[ha-pack] REFUSE: current live token found in pack:\n' + leaked.slice(0, 20).join('\n'));
  process.exit(2);
}

writeFileSync(
  join(DIST, 'LATEST.txt'),
  `${stamp}\ntgz ${tgz}\nsh ${shPath}\n`,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      stamp,
      tgz,
      sh: shPath,
      bytesTgz: tgzBuf.length,
      leakedTokens: 0,
    },
    null,
    2,
  ),
);
