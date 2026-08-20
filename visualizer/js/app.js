const STATE_URL = '/proxy/state.json';
const GRAPH_URL = '/proxy/graph.jsonl';
const HYDRATE_URL = '/proxy/hydrate';
const SEARCH_URL = '/proxy/search-index.json';
const INTERPRET_URL = '/api/interpret';

let graph;
let currentState = null;
let currentEdges = [];
let lastHash = '';
let pollInterval = null;
let selectedNode = null;
let currentTab = 'overview';
let editMode = false;
let searchIndex = [];

async function loadSearchIndex() {
  try {
    const res = await fetch(SEARCH_URL, { cache: 'no-store' });
    if (res.ok) searchIndex = await res.json();
  } catch (err) {
    console.error('[search] index load failed:', err);
  }
}

function scoreNodes(query) {
  if (!query || !searchIndex.length) return [];
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  return searchIndex.map(item => {
    const text = item.text || '';
    let score = 0;
    terms.forEach(term => {
      if (item.id.toLowerCase().includes(term)) score += 5;
      let idx = text.indexOf(term);
      while (idx !== -1) {
        score += 1;
        idx = text.indexOf(term, idx + term.length);
      }
    });
    return { id: item.id, score };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
}

async function loadData(silent = false) {
  try {
    const [stateRes, graphRes] = await Promise.all([
      fetch(STATE_URL, { cache: 'no-store' }),
      fetch(GRAPH_URL, { cache: 'no-store' })
    ]);

    if (!stateRes.ok || !graphRes.ok) throw new Error(`HTTP ${stateRes.status}/${graphRes.status}`);

    const state = await stateRes.json();
    const edgesRaw = await graphRes.text();
    const edges = edgesRaw.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; }}).filter(Boolean);

    const hash = JSON.stringify({ state, edges });
    if (hash !== lastHash) {
      lastHash = hash;
      currentState = state;
      currentEdges = edges;
      graph.setData(state, edges);
      updateStats(state, edges);
      setStatus(true);
      if (!silent) flashUpdate();
    }
  } catch (err) {
    console.error('[HA Visualizer] load failed:', err);
    setStatus(false);
  }
}

function updateStats(state, edges) {
  document.getElementById('stat-nodes').textContent = Object.keys(state.nodes || {}).length;
  document.getElementById('stat-edges').textContent = edges.length;
  document.getElementById('stat-last-sync').textContent = new Date().toLocaleTimeString();
}

function setStatus(online) {
  const pill = document.getElementById('live-pill');
  if (online) {
    pill.style.opacity = '1';
    pill.title = t('connected');
  } else {
    pill.style.opacity = '0.4';
    pill.title = t('disconnected');
  }
}

function flashUpdate() {
  const pill = document.getElementById('live-pill');
  pill.classList.add('pulse');
  setTimeout(() => pill.classList.remove('pulse'), 1500);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function simpleMarkdown(md) {
  return escapeHtml(md)
    .replace(/^### (.*$)/gim, '<h4>$1</h4>')
    .replace(/^## (.*$)/gim, '<h3>$1</h3>')
    .replace(/^# (.*$)/gim, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function renderDetails() {
  const panel = document.querySelector('.details-body');
  if (!selectedNode) {
    panel.innerHTML = `<p class="empty">${t('selectNode')}</p>`;
    return;
  }

  const color = graph.colorMap[selectedNode.category] || graph.colorMap.default;

  if (currentTab === 'overview') {
    const status = selectedNode.data.status || (selectedNode.data.grantsInjected ? 'active' : 'ok');
    let extras = '';
    if (selectedNode.data.capabilities) extras += `<p><strong>${t('capabilities')}:</strong> ${selectedNode.data.capabilities.join(', ')}</p>`;
    if (selectedNode.data.grantsInjected) extras += `<p><strong>${t('grants')}:</strong> ${selectedNode.data.grantsInjected.join(', ')}</p>`;
    if (selectedNode.data.expiresAt) extras += `<p><strong>${t('lastSync')}:</strong> ${selectedNode.data.expiresAt}</p>`;

    panel.innerHTML = `
      <div class="details-content">
        <div class="node-id" style="color:${color}">${selectedNode.id}</div>
        <p><strong>${t('type')}:</strong> <span style="color:${color}">●</span> ${selectedNode.group}</p>
        <p><strong>${t('status')}:</strong> ${status}</p>
        ${extras}
      </div>
    `;
  } else if (currentTab === 'raw') {
    if (editMode) {
      panel.innerHTML = `<textarea id="node-json-edit">${escapeHtml(JSON.stringify(selectedNode.data, null, 2))}</textarea>
        <div class="path-actions" style="margin-top:8px">
          <button id="btn-save-edit">${t('save')}</button>
          <button id="btn-cancel-edit">${t('cancel')}</button>
        </div>`;
      document.getElementById('btn-save-edit').addEventListener('click', saveNodeEdit);
      document.getElementById('btn-cancel-edit').addEventListener('click', () => { editMode = false; renderDetails(); });
    } else {
      panel.innerHTML = `<pre>${escapeHtml(JSON.stringify(selectedNode.data, null, 2))}</pre>`;
    }
  } else if (currentTab === 'content') {
    const content = selectedNode.data.content || selectedNode.data.description;
    panel.innerHTML = content
      ? `<div class="details-content markdown">${simpleMarkdown(String(content))}</div>`
      : `<p class="empty">${t('noDetails')}</p>`;
  } else if (currentTab === 'children') {
    const children = currentEdges.filter(e => e.from === selectedNode.id && e.type === 'contains').map(e => e.to);
    const html = children.length ? children.map(childId => `
      <div class="relation-item" data-id="${childId}">
        ↳ <strong>${childId}</strong>
      </div>
    `).join('') : `<p class="empty">${t('noDetails')}</p>`;
    panel.innerHTML = `<div class="relation-list">${html}</div>`;
    panel.querySelectorAll('.relation-item').forEach(item => {
      item.addEventListener('click', () => graph.selectNode(item.dataset.id));
    });
  } else if (currentTab === 'relations') {
    const incoming = currentEdges.filter(e => e.to === selectedNode.id).map(e => ({ ...e, dir: 'from' }));
    const outgoing = currentEdges.filter(e => e.from === selectedNode.id).map(e => ({ ...e, dir: 'to' }));
    const all = [...incoming, ...outgoing];
    const html = all.length ? all.map(e => `
      <div class="relation-item" data-id="${e.dir === 'from' ? e.from : e.to}">
        ${e.dir === 'from' ? '←' : '→'} <strong>${e.dir === 'from' ? e.from : e.to}</strong> <span style="color:var(--text-muted)">(${e.type})</span>
      </div>
    `).join('') : `<p class="empty">${t('noDetails')}</p>`;

    panel.innerHTML = `<div class="relation-list">${html}</div>`;
    panel.querySelectorAll('.relation-item').forEach(item => {
      item.addEventListener('click', () => graph.selectNode(item.dataset.id));
    });
  }
}

function saveNodeEdit() {
  const raw = document.getElementById('node-json-edit').value;
  try {
    const parsed = JSON.parse(raw);
    currentState.nodes[selectedNode.id] = parsed;
    selectedNode.data = parsed;
    editMode = false;
    graph.setData(currentState, currentEdges);
    renderDetails();
  } catch (e) {
    alert('Invalid JSON: ' + e.message);
  }
}

function deleteSelectedNode() {
  if (!selectedNode) return;
  if (!confirm(`Delete node ${selectedNode.id}?`)) return;
  delete currentState.nodes[selectedNode.id];
  currentEdges = currentEdges.filter(e => e.from !== selectedNode.id && e.to !== selectedNode.id);
  selectedNode = null;
  graph.setData(currentState, currentEdges);
  renderDetails();
  updateStats(currentState, currentEdges);
}

function findPath() {
  const from = document.getElementById('path-from').value.trim();
  const to = document.getElementById('path-to').value.trim();
  const result = document.getElementById('path-result');

  if (!from || !to) {
    result.innerHTML = '';
    return;
  }

  const path = graph.findPath(from, to);
  if (path) {
    graph.highlightPath(path);
    result.innerHTML = `<span style="color:var(--ok)">${t('pathFound')}:</span> ` +
      path.map(id => `<span class="step">${id}</span>`).join(' → ');
  } else {
    result.innerHTML = `<span style="color:var(--accent)">${t('noPath')}</span>`;
    graph.deselect();
  }
}

function setupSearch() {
  const input = document.getElementById('node-search');
  const suggestions = document.getElementById('search-suggestions');

  input.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    graph.search(q);

    if (!q) {
      suggestions.classList.remove('active');
      return;
    }

    const ranked = scoreNodes(q).slice(0, 8);
    const matches = ranked.length ? ranked : graph.nodes
      .filter(n => n.id.toLowerCase().includes(q) || n.label.toLowerCase().includes(q))
      .map(n => ({ id: n.id, score: 0 }))
      .slice(0, 8);

    suggestions.innerHTML = matches.map(r => `<div data-id="${r.id}">${r.id} <span style="color:var(--text-muted);font-size:10px">score:${Math.round(r.score)}</span></div>`).join('');
    suggestions.classList.add('active');

    suggestions.querySelectorAll('div').forEach(div => {
      div.addEventListener('click', () => {
        input.value = div.dataset.id;
        graph.selectNode(div.dataset.id);
        graph.fit();
        suggestions.classList.remove('active');
      });
    });
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) suggestions.classList.remove('active');
  });
}

function createNodeOrEdge() {
  const type = document.getElementById('create-type').value;
  const id = document.getElementById('create-id').value.trim();
  const value = document.getElementById('create-value').value.trim();

  if (!id) return;

  if (type === 'node') {
    currentState.nodes[id] = value ? JSON.parse(value) : {};
  } else {
    const [from, to] = id.split('->').map(s => s.trim());
    if (from && to) currentEdges.push({ from, to, type: value || 'related' });
  }

  graph.setData(currentState, currentEdges);
  updateStats(currentState, currentEdges);
  document.getElementById('create-id').value = '';
  document.getElementById('create-value').value = '';
}

async function hydrate() {
  const btn = document.getElementById('btn-hydrate');
  const original = btn.textContent;
  btn.textContent = t('hydrating');
  btn.disabled = true;
  try {
    const res = await fetch(HYDRATE_URL, { method: 'POST' });
    const text = await res.text();
    console.log('[hydrate]', text);
    await loadData();
  } catch (err) {
    console.error('[hydrate] failed:', err);
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

function setupExport() {
  const modal = document.getElementById('export-modal');
  document.getElementById('btn-export').addEventListener('click', () => modal.classList.remove('hidden'));
  document.querySelector('.close-modal').addEventListener('click', () => modal.classList.add('hidden'));

  modal.querySelectorAll('[data-format]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fmt = btn.dataset.format;
      if (fmt === 'json') download(JSON.stringify(currentState, null, 2), 'ha-context-state.json', 'application/json');
      if (fmt === 'jsonl') download(currentEdges.map(e => JSON.stringify(e)).join('\n'), 'ha-context-edges.jsonl', 'application/jsonlines');
      if (fmt === 'svg') downloadUrl(graph.exportSVG(), 'ha-context-graph.svg');
      if (fmt === 'png') graph.exportPNG(dataUrl => downloadUrl(dataUrl, 'ha-context-graph.png'));
      modal.classList.add('hidden');
    });
  });
}

function download(content, filename, type) {
  const blob = new Blob([content], { type });
  downloadUrl(URL.createObjectURL(blob), filename);
}

function downloadUrl(url, filename) {
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function startRealtime() {
  loadData();
  pollInterval = setInterval(() => loadData(true), 2000);
}

async function askLLM() {
  const btn = document.getElementById('btn-ask-llm');
  const answerBox = document.getElementById('llm-answer');
  const question = document.getElementById('llm-question').value.trim();
  if (!question) return;

  btn.disabled = true;
  btn.textContent = 'Thinking...';
  answerBox.classList.add('visible');
  answerBox.textContent = 'Consulting Claude...';

  const ranked = scoreNodes(question).slice(0, 5);
  const context = ranked.map(r => {
    const node = currentState.nodes[r.id];
    return `NODE: ${r.id}\n${JSON.stringify(node, null, 2)}`;
  }).join('\n---\n');

  try {
    const res = await fetch(INTERPRET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: question, context }),
    });
    const data = await res.json();
    answerBox.innerHTML = escapeHtml(data.answer || data.error || 'No answer');
  } catch (err) {
    answerBox.textContent = 'Error: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = t('ask');
  }
}

function setupAskLLM() {
  const btn = document.getElementById('btn-ask-llm');
  if (btn) btn.addEventListener('click', askLLM);
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  loadSearchIndex();
  graph = new HAContextGraph('graph');

  document.getElementById('btn-fit').addEventListener('click', () => graph.fit());
  document.getElementById('btn-hydrate').addEventListener('click', hydrate);
  document.getElementById('lang-select').value = currentLang;
  document.getElementById('lang-select').addEventListener('change', e => { setLanguage(e.target.value); renderDetails(); });

  document.getElementById('btn-mode').addEventListener('click', () => {
    const next = graph.layoutMode === 'force' ? 'cluster' : 'force';
    graph.setLayout(next);
    document.getElementById('btn-mode').textContent = next === 'force' ? '⧉ Force' : '⊞ Cluster';
  });

  document.getElementById('btn-theme').addEventListener('click', () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    html.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
  });

  setupSearch();

  document.querySelectorAll('.filter-cat').forEach(cb => {
    cb.addEventListener('change', () => {
      const checked = Array.from(document.querySelectorAll('.filter-cat:checked')).map(c => c.value);
      graph.filterCategories(checked);
    });
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      editMode = false;
      renderDetails();
    });
  });

  document.getElementById('btn-edit-node').addEventListener('click', () => {
    if (currentTab !== 'raw') {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-tab="raw"]').classList.add('active');
      currentTab = 'raw';
    }
    editMode = true;
    renderDetails();
  });

  document.getElementById('btn-delete-node').addEventListener('click', deleteSelectedNode);

  document.getElementById('btn-find-path').addEventListener('click', findPath);
  document.getElementById('btn-clear-path').addEventListener('click', () => {
    document.getElementById('path-from').value = '';
    document.getElementById('path-to').value = '';
    document.getElementById('path-result').innerHTML = '';
    graph.deselect();
  });

  document.getElementById('btn-create').addEventListener('click', createNodeOrEdge);

  window.addEventListener('node-selected', e => { selectedNode = e.detail.node; renderDetails(); });
  window.addEventListener('node-deselected', () => { selectedNode = null; renderDetails(); });

  setupAskLLM();
  setupExport();
  startRealtime();
  setTimeout(() => graph.fit(), 600);
});
