#!/usr/bin/env node
/**
 * HARD ALLOW installer — new machine / new operator.
 * Copies the HA *system* (no session token). Then ceremony --init for THEIR code.
 *
 *   node install.mjs
 *   node install.mjs --skip-init
 *   node install.mjs --install-grok      # official xAI CLI, no prompt
 *   node install.mjs --no-install-grok   # never fetch Grok
 *   node install.mjs --wire-grok         # re-detect + wrap only
 *   HA_INSTALL_HOME=/tmp/fakehome node install.mjs --skip-init
 *
 * If Grok is missing and stdin is a TTY, asks whether to run:
 *   curl -fsSL https://x.ai/cli/install.sh | bash
 */
import { existsSync, mkdirSync, chmodSync, writeFileSync, copyFileSync, unlinkSync, symlinkSync, readSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { detectGrok } from './detect-grok.mjs';

const XAI_CLI_INSTALL = 'https://x.ai/cli/install.sh';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HA_INSTALL_HOME || homedir();
const skipInit = process.argv.includes('--skip-init');
const dry = process.argv.includes('--dry-run');
const wireOnly = process.argv.includes('--wire-grok');
const forceInstallGrok = process.argv.includes('--install-grok') || process.env.HA_INSTALL_GROK === '1';
const skipInstallGrok = process.argv.includes('--no-install-grok') || process.env.HA_SKIP_GROK === '1';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.error(`HARD ALLOW installer (no live token)

  node install.mjs [flags]
    --skip-init         do not run ceremony --init
    --dry-run           print paths, copy nothing
    --wire-grok         detect/wrap Grok only (HA already on disk)
    --install-grok      run official xAI CLI installer if Grok missing
    --no-install-grok   never fetch Grok
    --help

  Official Grok CLI (when missing):
    curl -fsSL ${XAI_CLI_INSTALL} | bash
`);
  process.exit(0);
}

function die(m, c = 1) {
  console.error(m);
  process.exit(c);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'inherit', ...opts });
  if (r.status !== 0) die(`${cmd} failed (${r.status})`);
}

function askYesNo(question, defaultYes = true) {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  try {
    process.stderr.write(`${question} ${hint} `);
    const buf = Buffer.alloc(256);
    const n = readSync(0, buf, 0, 256, null);
    const ans = buf.slice(0, n).toString('utf8').trim().toLowerCase();
    if (!ans) return defaultYes;
    return ans === 'y' || ans === 'yes';
  } catch {
    return false;
  }
}

function findBash() {
  if (platform() !== 'win32') return 'bash';
  const candidates = [
    'bash',
    'C:\\Program Files\\Git\\bin\\bash.exe',
    join(HOME, 'AppData', 'Local', 'Programs', 'Git', 'bin', 'bash.exe'),
  ];
  for (const p of candidates) {
    const r = spawnSync(p, ['-lc', 'echo ok'], { encoding: 'utf8' });
    if (r.status === 0) return p;
  }
  return null;
}

function installOfficialGrok() {
  const bash = findBash();
  if (!bash) {
    console.error('[ha-install] Official Grok installer is a bash script:');
    console.error(`  curl -fsSL ${XAI_CLI_INSTALL} | bash`);
    console.error('  Windows: Git Bash or WSL, then: node install.mjs --wire-grok');
    return false;
  }
  console.error(`[ha-install] Running official xAI Grok CLI installer (${XAI_CLI_INSTALL})…`);
  const r = spawnSync(bash, ['-lc', `curl -fsSL ${JSON.stringify(XAI_CLI_INSTALL)} | bash`], {
    stdio: 'inherit',
    env: { ...process.env, HOME },
  });
  if (r.status !== 0) {
    console.error(`[ha-install] official installer exited ${r.status}`);
    return false;
  }
  return true;
}

function maybeInstallGrok(info) {
  if (info.found) return info;
  if (skipInstallGrok) {
    console.error('[ha-install] Grok missing; --no-install-grok (skip fetch)');
    return info;
  }
  let want = forceInstallGrok;
  if (!want) {
    if (!process.stdin.isTTY) {
      console.error('[ha-install] Grok missing; non-TTY — skip fetch (pass --install-grok to fetch)');
      return info;
    }
    want = askYesNo('Grok CLI not found. Install the official xAI CLI now?', true);
  }
  if (!want) {
    console.error('[ha-install] skipped Grok CLI install');
    return info;
  }
  const ok = installOfficialGrok();
  const again = detectGrok({ home: HOME, preferNewest: true });
  if (again.found) {
    console.error(`[ha-install] Grok after official install: ${again.realBin}`);
    return again;
  }
  if (!ok) console.error('[ha-install] official install did not produce a Grok binary');
  else console.error('[ha-install] installer finished but detectGrok still empty — run --wire-grok later');
  return again;
}

function wireGrok(info, grokBinDir, wrapDir, win) {
  if (!info.found || !info.realBin) {
    writeFileSync(
      join(dest, 'grok-paths.env'),
      `# no stock grok found — set GROK_REAL after you install Grok\n# curl -fsSL ${XAI_CLI_INSTALL} | bash\n# then: node ~/.grok/hard-allow/installer/install.mjs --wire-grok\n`,
    );
    return;
  }
  const real = info.realBin;
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
      unlinkSync(join(grokBinDir, 'agent'));
    } catch {
      /* none */
    }
    try {
      symlinkSync(wrapDst, join(grokBinDir, 'agent'));
    } catch {
      /* exists */
    }
  }
}

function resolvePayloadHa() {
  const candidates = [
    join(__dirname, 'ha'),
    join(__dirname, '..', 'src'),
    join(__dirname, '..'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'ceremony.mjs'))) return c;
  }
  return null;
}

const payloadHa = resolvePayloadHa();
if (!payloadHa) die('payload missing ceremony.mjs (expected installer/ha, ../src, or parent)');

const repoRoot = existsSync(join(__dirname, '..', 'README.md'))
  ? join(__dirname, '..')
  : null;

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
let grokInfo = detectGrok({ home: HOME, preferNewest: true });
console.error(`[ha-install] grok found=${grokInfo.found} real=${grokInfo.realBin || '(none)'}`);
grokInfo = maybeInstallGrok(grokInfo);

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
wireGrok(grokInfo, grokBinDir, wrapDir, win);

function copyTree(from, to) {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  const r = spawnSync('rsync', ['-a', '--exclude', '.DS_Store', from + '/', to + '/']);
  if (r.status === 0) return;
  spawnSync('tar', ['-C', from, '-cf', '-', '.'], { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 });
}

if (repoRoot) {
  const skillsFrom = join(repoRoot, 'skills');
  if (existsSync(skillsFrom)) {
    copyTree(skillsFrom, join(HOME, '.grok', 'skills'));
    copyTree(skillsFrom, join(HOME, '.claude', 'skills'));
    console.error('[ha-install] skills → ~/.grok/skills and ~/.claude/skills');
  }
  const rulesGrok = join(repoRoot, 'rules', 'grok');
  if (existsSync(rulesGrok)) {
    copyTree(rulesGrok, join(HOME, '.grok', 'rules'));
    console.error('[ha-install] rules → ~/.grok/rules');
  }
  const rulesClaude = join(repoRoot, 'rules', 'claude');
  if (existsSync(rulesClaude)) {
    copyTree(rulesClaude, join(HOME, '.claude', 'rules'));
    console.error('[ha-install] rules → ~/.claude/rules');
  }
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
  console.error(`  Official install: curl -fsSL ${XAI_CLI_INSTALL} | bash`);
  console.error('  Then: node ~/.grok/hard-allow/installer/install.mjs --wire-grok');
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
