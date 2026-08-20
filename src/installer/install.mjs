#!/usr/bin/env node
/**
 * HARD ALLOW installer — new machine / new operator.
 * Copies the HA *system* (no session token). Then ceremony --init for THEIR code.
 *
 *   node install.mjs
 *   node install.mjs --skip-init
 *   HA_INSTALL_HOME=/tmp/fakehome node install.mjs --skip-init
 */
import { existsSync, mkdirSync, chmodSync, writeFileSync, copyFileSync, unlinkSync, symlinkSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { detectGrok } from './detect-grok.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HA_INSTALL_HOME || homedir();
const skipInit = process.argv.includes('--skip-init');
const dry = process.argv.includes('--dry-run');
const wireOnly = process.argv.includes('--wire-grok');

function die(m, c = 1) {
  console.error(m);
  process.exit(c);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'inherit', ...opts });
  if (r.status !== 0) die(`${cmd} failed (${r.status})`);
}

const payloadHa = existsSync(join(__dirname, 'ha', 'ceremony.mjs'))
  ? join(__dirname, 'ha')
  : join(__dirname, '..'); // running from live tree: installer/../ = hard-allow

if (!existsSync(join(payloadHa, 'ceremony.mjs'))) die('payload missing ceremony.mjs');

const dest = join(HOME, '.grok', 'hard-allow');
console.error(`[ha-install] home=${HOME}`);
console.error(`[ha-install] from=${payloadHa}`);
console.error(`[ha-install] to=${dest}`);
console.error(`[ha-install] platform=${platform()}`);

if (dry) {
  console.error('[ha-install] --dry-run: no copy');
  process.exit(0);
}

mkdirSync(join(HOME, '.grok', 'rules'), { recursive: true });
mkdirSync(join(HOME, '.claude', 'rules'), { recursive: true });
mkdirSync(dest, { recursive: true });

const rsync = wireOnly
  ? { status: 0 }
  : spawnSync(
  'rsync',
  [
    '-a',
    '--exclude', 'session.json',
    '--exclude', 'active.env',
    '--exclude', 'active.env.*',
    '--exclude', 'ARMED',
    '--exclude', 'operator.json',
    '--exclude', '*.jsonl',
    '--exclude', '*.log',
    '--exclude', 'installer/dist',
    payloadHa + '/',
    dest + '/',
  ],
  { encoding: 'utf8' },
);

if (!wireOnly && rsync.status !== 0) {
  // Windows / no rsync: recursive copy via tar
  const tar = spawnSync(
    'tar',
    [
      '-C',
      payloadHa,
      '--exclude', 'session.json',
      '--exclude', 'active.env',
      '--exclude', 'ARMED',
      '--exclude', 'operator.json',
      '-cf',
      '-',
      '.',
    ],
    { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 },
  );
  if (tar.status !== 0) die('copy failed (need rsync or tar)');
  mkdirSync(dest, { recursive: true });
  const ext = spawnSync('tar', ['-C', dest, '-xf', '-'], { input: tar.stdout });
  if (ext.status !== 0) die('tar extract failed');
}

// never leave a packed token behind
for (const f of ['session.json', 'active.env', 'ARMED', 'operator.json']) {
  try {
    const p = join(dest, f);
    if (existsSync(p) && !process.env.HA_INSTALL_KEEP_SESSION) unlinkSync(p);
  } catch {
    /* ignore */
  }
}

const wrapDir = existsSync(join(__dirname, 'wrappers', 'grok'))
  ? join(__dirname, 'wrappers')
  : join(dest, 'installer', 'wrappers');
const win = platform() === 'win32';
const binCandidates = win
  ? [join(HOME, '.grok', 'bin'), join(HOME, 'AppData', 'Local', 'grok')]
  : [join(HOME, 'bin'), join(HOME, '.local', 'bin'), join(HOME, '.grok', 'bin')];
let binDir = binCandidates.find((d) => existsSync(d));
if (!binDir) {
  binDir = win ? join(HOME, '.grok', 'bin') : join(HOME, '.local', 'bin');
  mkdirSync(binDir, { recursive: true });
}

if (win) {
  writeFileSync(
    join(binDir, 'ha.cmd'),
    `@echo off\nnode "%USERPROFILE%\\.grok\\hard-allow\\bin\\ha.mjs" %*\n`,
  );
} else {
  writeFileSync(join(binDir, 'ha'), `#!/usr/bin/env bash\nexec node "$HOME/.grok/hard-allow/bin/ha.mjs" "$@"\n`);
  try {
    chmodSync(join(binDir, 'ha'), 0o755);
  } catch {
    /* ignore */
  }
}

const grokBinDir = join(HOME, '.grok', 'bin');
mkdirSync(grokBinDir, { recursive: true });
const grokInfo = detectGrok({ home: HOME });
console.error(`[ha-install] grok found=${grokInfo.found} real=${grokInfo.realBin || '(none)'}`);

const pathsJson = {
  at: new Date().toISOString(),
  platform: grokInfo.platform,
  arch: grokInfo.arch,
  found: grokInfo.found,
  realBin: grokInfo.realBin,
  wrapperOnPath: grokInfo.wrapperOnPath,
  downloads: grokInfo.downloads,
  notes: grokInfo.notes,
  wrapperUnix: join(grokBinDir, 'grok'),
  wrapperWin: join(grokBinDir, 'grok.cmd'),
};
writeFileSync(join(dest, 'grok-paths.json'), JSON.stringify(pathsJson, null, 2) + '\n');

if (grokInfo.found) {
  const real = grokInfo.realBin;
  writeFileSync(join(dest, 'grok-paths.env'), `export GROK_REAL=${JSON.stringify(real)}\n`);
  writeFileSync(join(dest, 'grok-paths.cmd'), `set "GROK_REAL=${real}"\n`);
  const grokRealLink = join(grokBinDir, win ? 'grok-real.exe' : 'grok-real');
  try {
    if (win) copyFileSync(real, grokRealLink);
    else {
      try {
        unlinkSync(grokRealLink);
      } catch {
        /* none */
      }
      try {
        symlinkSync(real, grokRealLink);
      } catch {
        copyFileSync(real, grokRealLink);
      }
    }
  } catch (e) {
    console.error('[ha-install] grok-real link warning:', e.message);
  }
  const wrapSrc = join(wrapDir, win ? 'grok.cmd' : 'grok');
  const wrapDst = join(grokBinDir, win ? 'grok.cmd' : 'grok');
  if (existsSync(wrapSrc)) {
    copyFileSync(wrapSrc, wrapDst);
    try {
      chmodSync(wrapDst, 0o755);
    } catch {
      /* ignore */
    }
  }
  if (!win) {
    try {
      symlinkSync(wrapDst, join(grokBinDir, 'agent'));
    } catch {
      /* exists */
    }
  }
} else {
  writeFileSync(
    join(dest, 'grok-paths.env'),
    `# no stock grok found — set GROK_REAL after you install Grok\n# export GROK_REAL="/path/to/grok-binary"\n`,
  );
}

writeFileSync(
  join(dest, 'INSTALL-STAMP.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      platform: platform(),
      node: process.version,
      dest,
      grok: grokInfo,
      binDir,
      note: 'system installed; no session token. Run ceremony --init then ceremony.',
    },
    null,
    2,
  ) + '\n',
);

console.error('');
console.error('  HARD ALLOW system installed (no live token).');
if (grokInfo.found) {
  console.error('  Grok binary:', grokInfo.realBin);
  console.error('  Wrapper:', join(grokBinDir, win ? 'grok.cmd' : 'grok'));
  if (win) {
    console.error('  PATH: add %USERPROFILE%\\.grok\\bin  (before any other grok)');
  } else {
    console.error('  PATH: export PATH="$HOME/.grok/bin:$PATH"');
  }
} else {
  console.error('  Grok CLI not found on this machine.');
  console.error('  Install Grok, then: node ~/.grok/hard-allow/installer/install.mjs --wire-grok');
  console.error('  Or: export GROK_REAL=/path/to/stock-grok-binary');
  console.error('  HA ceremony still works without Grok: node ~/.grok/hard-allow/ceremony.mjs --init');
}
console.error('  Next — YOUR code + YOUR confirm:');
console.error('    node ~/.grok/hard-allow/ceremony.mjs --init');
console.error('    node ~/.grok/hard-allow/ceremony.mjs');
if (grokInfo.found) console.error('    grok --hard-allow');
console.error('');

if (!skipInit && process.stdin.isTTY) {
  run(process.execPath, [join(dest, 'ceremony.mjs'), '--init'], { cwd: dest });
} else if (skipInit) {
  console.error('[ha-install] skipped --init');
}
