/**
 * Per-user HARD ALLOW identity: hashed security code + confirm config.
 * File: ~/.grok/hard-allow/operator.json (mode 0600). Never stores plaintext code.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const OPERATOR_FILE = join(homedir(), '.grok', 'hard-allow', 'operator.json');
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;

export function loadOperator() {
  if (!existsSync(OPERATOR_FILE)) return null;
  try {
    return JSON.parse(readFileSync(OPERATOR_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function hashSecret(plain, saltBuf) {
  const salt = saltBuf || randomBytes(16);
  const hash = scryptSync(String(plain), salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return { algo: 'scrypt', n: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, salt: salt.toString('hex'), hash: hash.toString('hex') };
}

export function verifySecret(plain, packed) {
  if (!packed?.salt || !packed?.hash) return false;
  const salt = Buffer.from(packed.salt, 'hex');
  const want = Buffer.from(packed.hash, 'hex');
  const got = scryptSync(String(plain), salt, want.length, {
    N: packed.n || SCRYPT_N,
    r: packed.r || SCRYPT_R,
    p: packed.p || SCRYPT_P,
  });
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

export function saveOperator(rec) {
  const dir = join(homedir(), '.grok', 'hard-allow');
  mkdirSync(dir, { recursive: true });
  const body = JSON.stringify({ ...rec, updatedAt: new Date().toISOString() }, null, 2) + '\n';
  writeFileSync(OPERATOR_FILE, body, { encoding: 'utf8' });
  try {
    chmodSync(OPERATOR_FILE, 0o600);
  } catch {
    /* win */
  }
  return OPERATOR_FILE;
}

export function publicOperatorView(op) {
  if (!op) {
    return { configured: false, confirm: 'legacy-default-code+touchid-macos' };
  }
  return {
    configured: true,
    createdAt: op.createdAt,
    confirmMethod: op.confirm?.method || 'auto',
    hasTotp: Boolean(op.confirm?.totpSecret),
    hasPassphrase: Boolean(op.confirm?.passphrase),
    codeAlgo: op.code?.algo || null,
  };
}

/** RFC 4648 base32 (no padding) for TOTP secrets */
export function randomTotpSecret() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = randomBytes(20);
  let out = '';
  for (const b of bytes) out += alphabet[b % 32];
  return out;
}

export function totpUri(secret, account = 'operator', issuer = 'HARD-ALLOW') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}

export function totpNow(secretB32, atMs = Date.now(), window = 1) {
  const key = base32Decode(secretB32);
  const codes = [];
  const counter = Math.floor(atMs / 1000 / 30);
  for (let w = -window; w <= window; w++) codes.push(hotp6(key, counter + w));
  return codes;
}

function hotp6(key, counter) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

function base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(s).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = '';
  for (const c of clean) {
    const v = alphabet.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
