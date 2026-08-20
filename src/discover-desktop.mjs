#!/usr/bin/env node
/**
 * discover-desktop.mjs
 * Auto-discover Desktop resources (FAST — no du/find on huge trees).
 * Called by create-context-nodes.mjs during HA hydration.
 *
 * HARD ALLOW launch was hanging on phase 4.5 because du -sh / find on Desktop
 * could run for minutes. Top-level readdir only.
 */
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DESKTOP = process.env.HA_DESKTOP_PATH || '/Users/c/Desktop';
const MAX_DIRS = Number(process.env.HA_DESKTOP_MAX_DIRS || 40);

function readReadme(path, maxChars = 500) {
  const files = ['README.md', 'readme.md', 'README.txt'];
  for (const f of files) {
    const p = join(path, f);
    if (existsSync(p)) {
      try {
        const text = readFileSync(p, 'utf8');
        return text.length > maxChars ? text.slice(0, maxChars) + '\n\n[...]' : text;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

function detectTechnologies(path) {
  const techs = [];
  const checks = {
    'Node.js': ['package.json'],
    Python: ['requirements.txt', 'pyproject.toml', 'setup.py'],
    Docker: ['Dockerfile', 'docker-compose.yml'],
    Rust: ['Cargo.toml'],
    Go: ['go.mod'],
  };
  for (const [tech, files] of Object.entries(checks)) {
    if (files.some((f) => existsSync(join(path, f)))) techs.push(tech);
  }
  return techs;
}

function detectSecretsTopLevel(path) {
  try {
    return readdirSync(path).filter((entry) => {
      const lower = entry.toLowerCase();
      return (
        lower.includes('secret') ||
        lower.includes('.env') ||
        lower.includes('credential') ||
        lower.includes('token')
      );
    });
  } catch {
    return [];
  }
}

function isGitRepo(path) {
  return existsSync(join(path, '.git'));
}

function inferScopes(name, title, desc) {
  const text = `${name} ${title} ${desc}`.toLowerCase();
  const scopes = [];
  const map = {
    fable: ['fable', 'research'],
    mcp: ['mcp', 'tools'],
    secops: ['secops', 'security'],
    offwks: ['offwks'],
    secret: ['secrets', 'sensitive'],
  };
  for (const [key, tags] of Object.entries(map)) {
    if (text.includes(key)) scopes.push(...tags);
  }
  return [...new Set(scopes)];
}

function shouldSkipDir(name) {
  if (name.startsWith('.')) return true;
  const lower = name.toLowerCase();
  const skipPatterns = ['carpeta sin título', 'sin titulo', 'untitled', 'root', 'shared'];
  return skipPatterns.some((p) => lower.includes(p));
}

function topLevelCount(path) {
  try {
    return readdirSync(path).length;
  } catch {
    return 0;
  }
}

function discoverDesktop() {
  const nodes = {};
  const edges = [];

  if (!existsSync(DESKTOP)) return { nodes, edges };

  let entries;
  try {
    entries = readdirSync(DESKTOP, { withFileTypes: true });
  } catch {
    return { nodes, edges };
  }

  const dirs = entries
    .filter((e) => e.isDirectory() && !shouldSkipDir(e.name))
    .map((e) => e.name)
    .slice(0, MAX_DIRS);
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);

  for (const dirName of dirs) {
    const fullPath = join(DESKTOP, dirName);
    // FAST: no du/find
    const fileCount = topLevelCount(fullPath);
    if (fileCount === 0) continue;

    const gitRepo = isGitRepo(fullPath);
    const readme = readReadme(fullPath);
    const technologies = detectTechnologies(fullPath);
    const sensitiveFiles = detectSecretsTopLevel(fullPath);

    let title = dirName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    let description = `Desktop resource: ${dirName}`;
    if (readme) {
      const firstLine =
        readme.split('\n').find((l) => l.trim() && !l.startsWith('#')) || readme.split('\n')[0];
      if (firstLine) description = firstLine.slice(0, 200);
      const h1 = readme.match(/^#\s+(.+)$/m);
      if (h1) title = h1[1].trim();
    }

    const scopes = inferScopes(dirName, title, description);
    const nodeId = `desktop.${dirName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    nodes[nodeId] = {
      path: fullPath,
      title,
      description,
      type: 'project',
      size: 'n/a',
      fileCount,
      gitRepo,
      gitBranch: 'unknown',
      technologies,
      scopes,
      sensitiveFiles,
      keyFiles: sensitiveFiles.slice(0, 5),
      status: 'active',
      _label: title,
      _type: 'project',
      _fastDiscover: true,
    };

    edges.push({
      from: nodeId,
      to: 'projects.multi-llm-ha-chat',
      type: 'feeds-into',
      label: 'Desktop resource feeds kernel context',
    });
  }

  for (const fileName of files) {
    const fullPath = join(DESKTOP, fileName);
    let size = 'n/a';
    try {
      const sizeBytes = statSync(fullPath).size;
      size =
        sizeBytes > 1024 * 1024
          ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(sizeBytes / 1024)} KB`;
    } catch {
      /* ignore */
    }
    const lower = fileName.toLowerCase();
    if (lower.includes('secret') || lower.includes('credential') || lower.includes('token')) {
      const nodeId = 'desktop.secrets';
      nodes[nodeId] = {
        path: fullPath,
        title: 'Desktop Secrets Database',
        description: `Infrastructure secrets file: ${fileName}`,
        type: 'resource',
        size,
        sensitive: true,
        scopes: ['secrets', 'sensitive', 'infrastructure'],
        status: 'active',
        _label: 'Desktop Secrets Database',
        _type: 'resource',
      };
      edges.push({ from: nodeId, to: 'system.credentials', type: 'contains', label: 'Contains credentials' });
    }
  }

  const allDesktopIds = Object.keys(nodes);
  if (allDesktopIds.length > 0) {
    nodes['desktop.staging'] = {
      title: 'Desktop Staging Root',
      description: 'Root container for all Desktop research resources (fast scan)',
      type: 'resource',
      childCount: allDesktopIds.length,
      scopes: ['staging', 'desktop'],
      status: 'active',
      _label: 'Desktop Staging Root',
      _type: 'resource',
    };
    for (const id of allDesktopIds) {
      if (id !== 'desktop.staging') {
        edges.push({ from: 'desktop.staging', to: id, type: 'contains', label: 'Staging contains resource' });
      }
    }
  }

  return { nodes, edges };
}

export { discoverDesktop };

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('discover-desktop.mjs')) {
  const t0 = Date.now();
  const { nodes, edges } = discoverDesktop();
  console.log(
    `Discovered ${Object.keys(nodes).length} Desktop nodes, ${edges.length} edges in ${Date.now() - t0}ms`,
  );
}
