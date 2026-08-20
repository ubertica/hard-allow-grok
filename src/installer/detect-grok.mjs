/**
 * Find a stock Grok binary on darwin / linux / win32.
 * Distinguishes HA bash/cmd wrapper from the real executable.
 */
import { existsSync, readdirSync, readFileSync, statSync, lstatSync, realpathSync } from 'node:fs';
import { homedir, platform, arch as osArch } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';

export function plat() {
  return platform(); // darwin | linux | win32
}

export function archTags() {
  const a = osArch(); // arm64 | x64 | ia32
  if (a === 'arm64') return ['aarch64', 'arm64'];
  if (a === 'x64') return ['x86_64', 'x64', 'amd64'];
  return [a];
}

export function osTags() {
  const p = plat();
  if (p === 'darwin') return ['macos', 'darwin', 'osx'];
  if (p === 'linux') return ['linux'];
  if (p === 'win32') return ['windows', 'win32', 'win'];
  return [p];
}

export function isWrapperScript(p) {
  if (!p || !existsSync(p)) return false;
  try {
    const st = statSync(p);
    if (st.size > 2_000_000) return false; // real grok is ~100MB+
    const buf = readFileSync(p, { encoding: 'utf8' }).slice(0, 80);
    return buf.startsWith('#!') || buf.includes('@echo off') || buf.includes('HARD ALLOW');
  } catch {
    return false;
  }
}

export function isNativeBinary(p) {
  if (!p || !existsSync(p)) return false;
  try {
    const fd = readFileSync(p, { encoding: null }).subarray(0, 4);
    const b = Buffer.from(fd);
    if (b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) return true; // ELF
    if (b[0] === 0xcf && b[1] === 0xfa && b[2] === 0xed && b[3] === 0xfe) return true; // Mach-O LE
    if (b[0] === 0xfe && b[1] === 0xed && b[2] === 0xfa && b[3] === 0xcf) return true;
    if (b[0] === 0xca && b[1] === 0xfe && b[2] === 0xba && b[3] === 0xbe) return true; // fat
    if (b[0] === 0x4d && b[1] === 0x5a) return true; // MZ
    return false;
  } catch {
    return false;
  }
}

function whichAll(name) {
  const cmd = plat() === 'win32' ? 'where' : 'which';
  const args = plat() === 'win32' ? [name] : ['-a', name];
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) return [];
  return (r.stdout || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pathCandidates(home) {
  const names =
    plat() === 'win32'
      ? ['grok.exe', 'grok-real.exe', 'grok']
      : ['grok-real', 'grok'];
  const dirs = [
    join(home, '.grok', 'bin'),
    join(home, '.local', 'bin'),
    join(home, 'bin'),
    '/usr/local/bin',
    '/opt/grok/bin',
    join(home, 'AppData', 'Local', 'grok'),
    join(home, 'AppData', 'Local', 'Programs', 'grok'),
  ];
  const out = [];
  for (const d of dirs) {
    for (const n of names) out.push(join(d, n));
  }
  return out;
}

function downloadCandidates(home) {
  const dir = join(home, '.grok', 'downloads');
  if (!existsSync(dir)) return [];
  const ost = osTags();
  const at = archTags();
  const files = [];
  for (const name of readdirSync(dir)) {
    const low = name.toLowerCase();
    if (!low.startsWith('grok')) continue;
    if (low.endsWith('.tmp') || low.endsWith('.sha256')) continue;
    const osOk = ost.some((t) => low.includes(t));
    const archOk = at.some((t) => low.includes(t));
    // allow grok-macos-aarch64 and grok-1.0.5-macos-aarch64
    if (!osOk && plat() !== 'darwin') continue;
    if (plat() === 'darwin' && !osOk && !low.includes('macos')) continue;
    if (!archOk && !/grok-macos-aarch64$/.test(low) && plat() === 'darwin' && osArch() === 'arm64') {
      if (!low.includes('aarch64') && !low.includes('arm64')) continue;
    }
    const p = join(dir, name);
    try {
      const st = statSync(p);
      if (!st.isFile() || st.size < 1_000_000) continue;
      files.push({ path: p, mtime: st.mtimeMs, size: st.size });
    } catch {
      /* ignore */
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files.map((f) => f.path);
}

function resolveMaybeLink(p) {
  try {
    if (existsSync(p) && lstatSync(p).isSymbolicLink()) return realpathSync(p);
  } catch {
    /* ignore */
  }
  return p;
}

/**
 * @param {{ home?: string, preferNewest?: boolean }} opts
 * @returns {{ found: boolean, realBin: string|null, wrapperOnPath: string|null, downloads: string[], notes: string[] }}
 */
export function detectGrok(opts = {}) {
  const machineHome = homedir();
  const home = opts.home || machineHome;
  const notes = [];
  const downloads = [
    ...downloadCandidates(home),
    ...(home !== machineHome ? downloadCandidates(machineHome) : []),
  ];
  let realBin = process.env.GROK_REAL || null;
  if (realBin && !existsSync(realBin)) {
    notes.push(`GROK_REAL set but missing: ${realBin}`);
    realBin = null;
  }

  const onPath = [
    ...whichAll(plat() === 'win32' ? 'grok.exe' : 'grok'),
    ...whichAll('grok'),
    ...whichAll(plat() === 'win32' ? 'grok-real.exe' : 'grok-real'),
    ...whichAll('grok-real'),
  ];
  let wrapperOnPath = null;

  for (const p of onPath) {
    const rp = resolveMaybeLink(p);
    if (isWrapperScript(p) || isWrapperScript(rp)) {
      wrapperOnPath = p;
      notes.push(`PATH grok is HA wrapper: ${p}`);
      continue;
    }
    if (isNativeBinary(rp) || isNativeBinary(p)) {
      if (!realBin) realBin = rp;
      notes.push(`PATH native grok: ${rp}`);
    }
  }

  for (const h of [home, machineHome]) {
    const grokReal = join(h, '.grok', 'bin', plat() === 'win32' ? 'grok-real.exe' : 'grok-real');
    if (!realBin && existsSync(grokReal)) {
      const rp = resolveMaybeLink(grokReal);
      if (isNativeBinary(rp) || statSync(rp).size > 1_000_000) {
        realBin = rp;
        notes.push(`grok-real: ${rp}`);
      }
    }
  }

  if (!realBin) {
    for (const p of [...pathCandidates(home), ...pathCandidates(machineHome)]) {
      const rp = resolveMaybeLink(p);
      if (isWrapperScript(p)) continue;
      if (existsSync(rp) && (isNativeBinary(rp) || (statSync(rp).size > 1_000_000 && !isWrapperScript(rp)))) {
        realBin = rp;
        notes.push(`candidate: ${rp}`);
        break;
      }
    }
  }

  if (!realBin && downloads[0]) {
    realBin = downloads[0];
    notes.push(`newest download: ${realBin}`);
  }

  if (opts.preferNewest && downloads[0] && downloads[0] !== realBin) {
    notes.push(`prefer newest download over ${realBin}: ${downloads[0]}`);
    realBin = downloads[0];
  }

  return {
    found: Boolean(realBin && existsSync(realBin)),
    realBin: realBin || null,
    wrapperOnPath,
    downloads: downloads.slice(0, 8),
    platform: plat(),
    arch: osArch(),
    notes,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(detectGrok(), null, 2));
}
