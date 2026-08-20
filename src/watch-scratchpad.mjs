#!/usr/bin/env node
/**
 * watch-scratchpad.mjs
 *
 * Watches Claude's shared scratchpad directories and re-runs context-node
 * hydration when files change. Keeps the visualizer truly live.
 */
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

const HOME = homedir();
const HA = path.join(HOME, '.grok', 'hard-allow');
const CONFIG_FILE = path.join(HA, 'claude-scratchpad-paths.json');
const CREATE_NODES = path.join(HA, 'create-context-nodes.mjs');
const DOCS_SYNC = '/Users/c/dev/hard-allow-docs/scripts/sync-from-ha.mjs';

const DEBOUNCE_MS = 2000;

function log(msg) {
  console.error(`[scratchpad-watch] ${msg}`);
}

function loadPaths() {
  if (!fs.existsSync(CONFIG_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return Array.isArray(data) ? data : [data];
  } catch (e) {
    log(`could not parse config: ${e.message}`);
    return [];
  }
}

let pendingTimer = null;
let running = false;

function runHydration() {
  if (running) return;
  running = true;
  log('change detected, re-hydrating context nodes...');

  const child = spawn(process.execPath, [CREATE_NODES, '--force', '--silent'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let out = '';
  let err = '';
  child.stdout.on('data', d => out += d);
  child.stderr.on('data', d => err += d);

  child.on('close', (code) => {
    if (code === 0) {
      log('context nodes re-hydrated');
      syncDocs();
    } else {
      log(`re-hydration failed: ${err || out}`);
      running = false;
    }
  });
}

function syncDocs() {
  if (!fs.existsSync(DOCS_SYNC)) {
    running = false;
    return;
  }
  const child = spawn(process.execPath, [DOCS_SYNC], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', d => out += d);
  child.stderr.on('data', d => err += d);
  child.on('close', (code) => {
    if (code === 0) log('docs repo synced');
    else log(`docs sync failed: ${err || out}`);
    running = false;
  });
}

function scheduleHydration() {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(runHydration, DEBOUNCE_MS);
}

function watchDir(dir) {
  if (!fs.existsSync(dir)) {
    log(`skip missing dir: ${dir}`);
    return;
  }
  try {
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const full = path.join(dir, filename);
      log(`event: ${eventType} ${full}`);
      scheduleHydration();
    });
    log(`watching ${dir}`);
  } catch (e) {
    log(`could not watch ${dir}: ${e.message}`);
  }
}

const paths = loadPaths();
if (paths.length === 0) {
  log('no scratchpad paths configured');
  process.exit(1);
}

for (const p of paths) {
  watchDir(p);
}

log('ready');
