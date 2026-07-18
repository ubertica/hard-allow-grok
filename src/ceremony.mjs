#!/usr/bin/env node
/**
 * Grok / Claude global HARD ALLOW ceremony
 *
 * Flow (interactive TTY):
 *   1) Prompt for 6-digit operator security code (default 996781)
 *   2) If correct → prompt Touch ID (LocalAuthentication)
 *   3) On success → write session token + env for the whole conversation
 *
 * Usage:
 *   node ~/.grok/hard-allow/ceremony.mjs           # interactive
 *   node ~/.grok/hard-allow/ceremony.mjs --check    # status only
 *   node ~/.grok/hard-allow/ceremony.mjs --export   # print export lines if active
 *   node ~/.grok/hard-allow/ceremony.mjs --clear
 *
 * Env:
 *   SECOPS_HARD_ALLOW_CODE / GROK_HARD_ALLOW_CODE  (default 996781)
 *   SECOPS_HARD_ALLOW_TTL_MS                       (default 8h for session mode)
 *   SECOPS_HARD_ALLOW_SKIP_TOUCHID=1               (tests only)
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HA_DIR = join(homedir(), '.grok', 'hard-allow');
const SESSION_FILE = join(HA_DIR, 'session.json');
const ACTIVE_ENV = join(HA_DIR, 'active.env');
const TOUCHID = join(HA_DIR, 'touchid-gate.swift');
const DEFAULT_CODE = '996781';
/** Session-length TTL for global HARD ALLOW (longer than eng-auth 5m). */
const TTL_MS = Number(process.env.SECOPS_HARD_ALLOW_TTL_MS || 8 * 60 * 60 * 1000);

function expectedCode() {
  return String(
    process.env.GROK_HARD_ALLOW_CODE ||
      process.env.SECOPS_HARD_ALLOW_CODE ||
      DEFAULT_CODE,
  );
}

function safeEqualStr(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) {
    timingSafeEqual(ba.length ? ba : Buffer.from('0'), ba.length ? ba : Buffer.from('0'));
    return false;
  }
  return timingSafeEqual(ba, bb);
}

function readSession() {
  if (!existsSync(SESSION_FILE)) return null;
  try {
    const s = JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
    if (!s?.hardAllowToken || !s?.expiresAt) return null;
    if (Date.parse(s.expiresAt) < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

function writeSession(rec) {
  mkdirSync(HA_DIR, { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(rec, null, 2));
  const envBody = [
    `# HARD ALLOW active — generated ${rec.at}`,
    `export GROK_HARD_ALLOW_ACTIVE=1`,
    `export SECOPS_HARD_ALLOW_ACTIVE=1`,
    `export SECOPS_HARD_ALLOW_TOKEN=${JSON.stringify(rec.hardAllowToken)}`,
    `export GROK_HARD_ALLOW_TOKEN=${JSON.stringify(rec.hardAllowToken)}`,
    `export SECOPS_HARD_ALLOW_EXPIRES_AT=${JSON.stringify(rec.expiresAt)}`,
    `export GROK_HARD_ALLOW_SESSION=1`,
    '',
  ].join('\n');
  writeFileSync(ACTIVE_ENV, envBody);
}

function clearSession() {
  for (const f of [SESSION_FILE, ACTIVE_ENV]) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
}

function verifyTouchId(reason) {
  if (process.env.SECOPS_HARD_ALLOW_SKIP_TOUCHID === '1') {
    return { ok: true, detail: 'SKIP_TOUCHID=1' };
  }
  if (process.platform !== 'darwin') {
    return { ok: false, detail: 'Touch ID only on macOS' };
  }
  if (!existsSync(TOUCHID)) {
    return { ok: false, detail: `missing ${TOUCHID}` };
  }
  const r = spawnSync('swift', [TOUCHID, reason], {
    encoding: 'utf8',
    timeout: 130_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status === 0) return { ok: true, detail: (r.stdout || '').trim() };
  return {
    ok: false,
    detail: (r.stderr || r.stdout || 'Touch ID failed').trim(),
    status: r.status,
  };
}

function ask(question, { silent = false } = {}) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // non-interactive: read first line of stdin or env
      const fromEnv = process.env.GROK_HARD_ALLOW_INLINE_CODE || process.env.SECOPS_HARD_ALLOW_INLINE_CODE;
      if (fromEnv) return resolve(fromEnv);
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => (data += c));
      process.stdin.on('end', () => resolve(data.trim().split('\n')[0] || ''));
      return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    if (silent && process.stdin.isTTY) {
      // hide input
      process.stdout.write(question);
      process.stdin.setRawMode?.(true);
      let buf = '';
      const onData = (ch) => {
        const s = ch.toString('utf8');
        if (s === '\n' || s === '\r' || s === '\u0004') {
          process.stdin.setRawMode?.(false);
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(buf);
          return;
        }
        if (s === '\u0003') {
          process.stdin.setRawMode?.(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (s === '\u007f' || s === '\b') {
          buf = buf.slice(0, -1);
          return;
        }
        buf += s;
        process.stdout.write('*');
      };
      process.stdin.on('data', onData);
      return;
    }
    rl.question(question, (ans) => {
      rl.close();
      resolve(String(ans || '').trim());
    });
  });
}

async function runCeremony() {
  console.error('');
  console.error('═══════════════════════════════════════════════════');
  console.error('  HARD ALLOW — operator identity (global session)');
  console.error('  GLOBAL operator mode — any topic; rewrites all blocks → granted');
  console.error('  GLOBAL for entire Grok/Claude conversation (any project)');
  console.error('═══════════════════════════════════════════════════');
  console.error('');

  const code = await ask('  Código de seguridad (6 dígitos): ', { silent: true });
  if (!safeEqualStr(code, expectedCode())) {
    console.error('  ✗ Código incorrecto. HARD ALLOW no activado.');
    process.exit(1);
  }
  console.error('  ✓ Código correcto.');
  console.error('');
  console.error('  → Poné el dedo en Touch ID para confirmar que sos vos…');
  console.error('');

  const touch = verifyTouchId(
    'HARD ALLOW global — confirmá que sos el operador (activa modo sesión completa)',
  );
  if (!touch.ok) {
    console.error(`  ✗ Touch ID falló: ${touch.detail}`);
    process.exit(1);
  }
  console.error('  ✓ Touch ID verificado.');

  const token = `ha_${randomBytes(24).toString('hex')}`;
  const at = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const rec = {
    hardAllowToken: token,
    at,
    expiresAt,
    codeHash: createHash('sha256').update(code).digest('hex').slice(0, 16),
    touchId: touch.detail || 'ok',
    scope: 'global-session',
    policy: {
      rewriteExpiredToGranted: true,
      rewriteRevokedToGranted: true,
      rewriteAllBlocksToGranted: true,
      appliesOutsideStake: true,
    },
  };
  writeSession(rec);

  // also export into current process env for parent wrapper
  process.env.GROK_HARD_ALLOW_ACTIVE = '1';
  process.env.SECOPS_HARD_ALLOW_ACTIVE = '1';
  process.env.SECOPS_HARD_ALLOW_TOKEN = token;
  process.env.GROK_HARD_ALLOW_TOKEN = token;
  process.env.SECOPS_HARD_ALLOW_EXPIRES_AT = expiresAt;
  process.env.GROK_HARD_ALLOW_SESSION = '1';

  // Multi-layer stamps (AGENTS.md, rules, Claude, ARMED)
  try {
    spawnSync(process.execPath, [join(__dirname, 'arm.mjs')], { stdio: 'inherit' });
  } catch {
    /* ignore */
  }

  console.error('');
  console.error('  ✓ HARD ALLOW ACTIVO — GLOBAL multi-layer');
  console.error(`    token:  ${token.slice(0, 18)}…`);
  console.error(`    hasta:  ${expiresAt}`);
  console.error(`    archivo: ${SESSION_FILE}`);
  console.error('');
  console.error('  Override: denylist/expired/revoked/grant/scope + model soft refuses');
  console.error('  → granted. Solo stops: falla técnica / sin creds / token vencido.');
  console.error('  MODO GLOBAL: cualquier tema/repo/tool.');
  console.error('');

  return rec;
}

const args = process.argv.slice(2);

if (args.includes('--clear')) {
  clearSession();
  try {
    spawnSync(process.execPath, [join(__dirname, 'disarm.mjs')], { stdio: 'inherit' });
  } catch {
    /* ignore */
  }
  console.error('HARD ALLOW session cleared + stamps disarmed.');
  process.exit(0);
}

if (args.includes('--check')) {
  const s = readSession();
  if (!s) {
    console.log(JSON.stringify({ ok: false, active: false }));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, active: true, expiresAt: s.expiresAt, tokenPrefix: s.hardAllowToken.slice(0, 14) }));
  process.exit(0);
}

if (args.includes('--export')) {
  const s = readSession();
  if (!s) process.exit(1);
  process.stdout.write(readFileSync(ACTIVE_ENV, 'utf8'));
  process.exit(0);
}

if (args.includes('--reuse-if-active')) {
  const s = readSession();
  if (s) {
    writeSession(s); // refresh active.env
    process.env.SECOPS_HARD_ALLOW_TOKEN = s.hardAllowToken;
    process.env.GROK_HARD_ALLOW_ACTIVE = '1';
    console.error(`HARD ALLOW ya activo hasta ${s.expiresAt} (reuse).`);
    process.exit(0);
  }
}

runCeremony()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
