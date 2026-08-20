/**
 * Second-factor confirmation for HARD ALLOW ceremony (portable).
 * darwin Touch ID stays default. Linux/Windows/TOTP/passphrase for other hosts.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { totpNow, verifySecret } from './operator-identity.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOUCHID = join(__dirname, 'touchid-gate.swift');
const WIN_HELLO = join(__dirname, 'bin', 'windows-hello-gate.ps1');

export function detectAutoMethod() {
  if (process.platform === 'darwin') return 'touchid';
  if (process.platform === 'linux') {
    if (which('pkexec')) return 'polkit';
    if (which('sudo')) return 'sudo';
    return 'passphrase';
  }
  if (process.platform === 'win32') return 'windows-hello';
  return 'passphrase';
}

function which(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0;
}

export function verifyTouchId(reason) {
  if (process.env.SECOPS_HARD_ALLOW_SKIP_TOUCHID === '1' || process.env.HA_SKIP_CONFIRM === '1') {
    return { ok: true, method: 'skip', detail: 'SKIP_CONFIRM' };
  }
  if (process.platform !== 'darwin') {
    return { ok: false, method: 'touchid', detail: 'Touch ID only on macOS' };
  }
  if (!existsSync(TOUCHID)) return { ok: false, method: 'touchid', detail: `missing ${TOUCHID}` };
  const r = spawnSync('swift', [TOUCHID, reason], {
    encoding: 'utf8',
    timeout: 130_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status === 0) return { ok: true, method: 'touchid', detail: (r.stdout || '').trim() || 'OK' };
  return { ok: false, method: 'touchid', detail: (r.stderr || r.stdout || 'Touch ID failed').trim(), status: r.status };
}

function verifySudo() {
  const r = spawnSync('sudo', ['-v', '-p', 'HARD ALLOW sudo confirm: '], {
    encoding: 'utf8',
    timeout: 120_000,
    stdio: 'inherit',
  });
  return r.status === 0
    ? { ok: true, method: 'sudo', detail: 'sudo -v' }
    : { ok: false, method: 'sudo', detail: 'sudo confirm failed' };
}

function verifyPolkit() {
  const r = spawnSync('pkexec', ['--disable-internal-agent', 'true'], {
    encoding: 'utf8',
    timeout: 120_000,
    stdio: 'inherit',
  });
  if (r.status === 0) return { ok: true, method: 'polkit', detail: 'pkexec' };
  return { ok: false, method: 'polkit', detail: 'pkexec failed (install polkit or use --init totp/passphrase)' };
}

function verifyWindowsHello(reason) {
  if (!existsSync(WIN_HELLO)) {
    return { ok: false, method: 'windows-hello', detail: 'missing windows-hello-gate.ps1' };
  }
  const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', WIN_HELLO, reason], {
    encoding: 'utf8',
    timeout: 130_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status === 0) return { ok: true, method: 'windows-hello', detail: (r.stdout || '').trim() || 'OK' };
  return { ok: false, method: 'windows-hello', detail: (r.stderr || r.stdout || 'Windows Hello failed').trim() };
}

export function verifyTotp(code, secret) {
  if (!secret || !code) return { ok: false, method: 'totp', detail: 'missing totp' };
  const ok = totpNow(secret).includes(String(code).replace(/\s+/g, ''));
  return ok ? { ok: true, method: 'totp', detail: 'totp' } : { ok: false, method: 'totp', detail: 'bad totp' };
}

export function verifyPassphrase(plain, packed) {
  const ok = verifySecret(plain, packed);
  return ok ? { ok: true, method: 'passphrase', detail: 'passphrase' } : { ok: false, method: 'passphrase', detail: 'bad passphrase' };
}

/**
 * @param {object} op operator.json or null
 * @param {{ totpCode?: string, passphrase?: string, reason?: string }} extra
 */
export function confirmOperator(op, extra = {}) {
  if (process.env.SECOPS_HARD_ALLOW_SKIP_TOUCHID === '1' || process.env.HA_SKIP_CONFIRM === '1') {
    return { ok: true, method: 'skip', detail: 'SKIP_CONFIRM' };
  }
  const reason = extra.reason || 'HARD ALLOW — confirm operator identity';
  let method = extra.method || op?.confirm?.method || process.env.HA_CONFIRM || 'auto';
  if (method === 'auto') method = detectAutoMethod();

  if (method === 'touchid') return verifyTouchId(reason);
  if (method === 'sudo') return verifySudo();
  if (method === 'polkit') return verifyPolkit();
  if (method === 'windows-hello') return verifyWindowsHello(reason);
  if (method === 'totp') return verifyTotp(extra.totpCode, op?.confirm?.totpSecret);
  if (method === 'passphrase') return verifyPassphrase(extra.passphrase, op?.confirm?.passphrase);

  return { ok: false, method, detail: `unknown confirm method: ${method}` };
}

export function availableMethods() {
  const m = ['passphrase', 'totp'];
  if (process.platform === 'darwin') m.unshift('touchid');
  if (process.platform === 'linux') {
    if (which('pkexec')) m.unshift('polkit');
    if (which('sudo')) m.unshift('sudo');
  }
  if (process.platform === 'win32') m.unshift('windows-hello');
  return ['auto', ...m];
}
