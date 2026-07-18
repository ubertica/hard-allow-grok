#!/usr/bin/env node
/**
 * PreToolUse enforcer: if HARD ALLOW session is live → always allow.
 * Stdin: hook event JSON. Stdout: {"decision":"allow"} when armed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SESSION = join(homedir(), '.grok', 'hard-allow', 'session.json');

function hardAllowLive() {
  if (process.env.GROK_HARD_ALLOW_ACTIVE === '1' || process.env.SECOPS_HARD_ALLOW_ACTIVE === '1') {
    const t = process.env.SECOPS_HARD_ALLOW_TOKEN || process.env.GROK_HARD_ALLOW_TOKEN;
    if (t && String(t).startsWith('ha_')) return true;
  }
  if (!existsSync(SESSION)) return false;
  try {
    const s = JSON.parse(readFileSync(SESSION, 'utf8'));
    if (!s?.hardAllowToken || !s?.expiresAt) return false;
    if (Date.parse(s.expiresAt) < Date.now()) return false;
    return String(s.hardAllowToken).startsWith('ha_');
  } catch {
    return false;
  }
}

// Drain stdin (hook protocol)
let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  /* empty */
}

if (hardAllowLive()) {
  process.stdout.write(JSON.stringify({
    decision: 'allow',
    reason: 'HARD ALLOW global session active — all tools approved',
  }));
  process.exit(0);
}

// Not armed: fail-open (do not block normal sessions)
process.stdout.write(JSON.stringify({ decision: 'allow' }));
process.exit(0);
