class HAContextGraph {
  constructor(svgId) {
    this.svg = d3.select(`#${svgId}`);
    this.container = this.svg.append('g');
    this.width = 0;
    this.height = 0;
    this.simulation = null;
    this.nodes = [];
    this.links = [];
    this.selectedNodeId = null;
    this.layoutMode = 'force'; // 'force' | 'cluster'
    this.zoom = d3.zoom().on('zoom', (e) => this.container.attr('transform', e.transform));
    this.svg.call(this.zoom);

    this.colorMap = {
      system: '#ff2a2a',
      agents: '#00ccff',
      projects: '#00ff9d',
      hardAllow: '#ffcc00',
      default: '#8888a0'
    };

    this.categoryOrder = ['system', 'hardAllow', 'agents', 'projects', 'default'];

    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
      if (this.simulation) this.simulation.alpha(0.3).restart();
    });
  }

  resize() {
    const rect = this.svg.node().getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.svg.attr('viewBox', [0, 0, this.width, this.height]);
  }

  categorize(id) {
    if (id.startsWith('system.')) return 'system';
    if (id.startsWith('agents.')) return 'agents';
    if (id.startsWith('projects.')) return 'projects';
    if (id.startsWith('hardAllow.')) return 'hardAllow';
    return 'default';
  }

  shortName(id) {
    return id.split('.').pop();
  }

  groupName(id) {
    return id.split('.')[0];
  }

  setData(state, edges, preservePositions = true) {
    const oldPositions = new Map();
    if (preservePositions) {
      this.nodes.forEach(n => oldPositions.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }));
    }

    const nodeMap = new Map();
    Object.entries(state.nodes || {}).forEach(([id, data]) => {
      const old = oldPositions.get(id);
      nodeMap.set(id, {
        id, data,
        category: this.categorize(id),
        group: this.groupName(id),
        label: this.shortName(id),
        x: old?.x,
        y: old?.y,
        vx: old?.vx,
        vy: old?.vy
      });
    });

    this.nodes = Array.from(nodeMap.values());
    const validIds = new Set(this.nodes.map(n => n.id));

    this.links = (edges || [])
      .filter(e => validIds.has(e.from) && validIds.has(e.to))
      .map(e => ({ source: e.from, target: e.to, type: e.type || 'related' }));

    this.render();
    this.drawMinimap();
  }

  render() {
    this.container.selectAll('*').remove();

    if (this.layoutMode === 'cluster') {
      this.runClusterLayout();
    }

    this.simulation = d3.forceSimulation(this.nodes)
      .force('link', d3.forceLink(this.links).id(d => d.id).distance(d => d.type === 'prerequisite' ? 80 : 140))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2))
      .force('collide', d3.forceCollide().radius(40))
      .force('x', d3.forceX(d => this.categoryX(d.category)).strength(0.08))
      .force('y', d3.forceY(this.height / 2).strength(0.03));

    const link = this.container.append('g').attr('class', 'links')
      .selectAll('line').data(this.links).join('line').attr('class', 'link');

    const node = this.container.append('g').attr('class', 'nodes')
      .selectAll('g').data(this.nodes).join('g').attr('class', 'node')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) this.simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) this.simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

    node.append('circle')
      .attr('r', d => d.category === 'system' ? 12 : d.category === 'hardAllow' ? 10 : 8)
      .attr('fill', d => this.colorMap[d.category] || this.colorMap.default);

    node.append('text')
      .attr('dx', 14).attr('dy', 4)
      .text(d => d.label.length > 18 ? d.label.slice(0, 16) + '…' : d.label);

    node.on('click', (e, d) => { e.stopPropagation(); this.selectNode(d.id); })
        .on('mouseenter', (e, d) => this.showTooltip(e, d))
        .on('mouseleave', () => this.hideTooltip());

    this.svg.on('click', () => this.deselect());

    this.simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
      this.drawMinimap();
    });
  }

  runClusterLayout() {
    const groups = d3.group(this.nodes, d => d.category);
    let y = 80;
    groups.forEach((nodes, cat) => {
      nodes.forEach((n, i) => {
        n.x = this.width / 2 + (i % 3 - 1) * 120;
        n.y = y + Math.floor(i / 3) * 70;
      });
      y += Math.ceil(nodes.length / 3) * 70 + 60;
    });
  }

  categoryX(cat) {
    const idx = this.categoryOrder.indexOf(cat);
    const total = this.categoryOrder.length;
    const margin = this.width * 0.15;
    return margin + (this.width - margin * 2) * (idx / (total - 1 || 1));
  }

  selectNode(id) {
    this.selectedNodeId = id;
    this.container.selectAll('.node').classed('selected', d => d.id === id);
    this.highlightNeighbors(id);
    const node = this.nodes.find(n => n.id === id);
    window.dispatchEvent(new CustomEvent('node-selected', { detail: { id, node } }));
  }

  deselect() {
    this.selectedNodeId = null;
    this.container.selectAll('.node').classed('selected', false).classed('dimmed', false).classed('highlight', false);
    this.container.selectAll('.link').classed('highlight', false).classed('dimmed', false);
    window.dispatchEvent(new CustomEvent('node-deselected'));
  }

  highlightNeighbors(id) {
    const connected = new Set([id]);
    this.links.forEach(l => {
      if (l.source.id === id) connected.add(l.target.id);
      if (l.target.id === id) connected.add(l.source.id);
    });

    this.container.selectAll('.node')
      .classed('dimmed', d => !connected.has(d.id))
      .classed('highlight', d => connected.has(d.id));

    this.container.selectAll('.link')
      .classed('highlight', d => d.source.id === id || d.target.id === id)
      .classed('dimmed', d => d.source.id !== id && d.target.id !== id);
  }

  highlightPath(pathIds) {
    const set = new Set(pathIds);
    this.container.selectAll('.node')
      .classed('dimmed', d => !set.has(d.id))
      .classed('highlight', d => set.has(d.id));
    this.container.selectAll('.link')
      .classed('dimmed', d => !set.has(d.source.id) || !set.has(d.target.id))
      .classed('highlight', d => set.has(d.source.id) && set.has(d.target.id));
  }

  showTooltip(event, d) {
    const tooltip = document.getElementById('tooltip');
    const status = d.data.status || (d.data.grantsInjected ? 'active' : 'ok');
    tooltip.innerHTML = `
      <strong>${d.id}</strong><br>
      <span style="color:${this.colorMap[d.category]}">●</span> ${d.group}<br>
      <span style="color:var(--text-muted)">${t('status')}:</span> ${status}
    `;
    tooltip.style.left = (event.pageX + 14) + 'px';
    tooltip.style.top = (event.pageY + 14) + 'px';
    tooltip.classList.add('visible');
  }

  hideTooltip() {
    document.getElementById('tooltip').classList.remove('visible');
  }

  fit() {
    if (this.nodes.length === 0) return;
    const bounds = this.container.node().getBBox();
    const scale = 0.85 / Math.max(bounds.width / this.width, bounds.height / this.height);
    this.svg.transition().duration(600).call(
      this.zoom.transform,
      d3.zoomIdentity.translate(this.width / 2, this.height / 2).scale(scale).translate(-(bounds.x + bounds.width / 2), -(bounds.y + bounds.height / 2))
    );
  }

  setLayout(mode) {
    this.layoutMode = mode;
    this.render();
    setTimeout(() => this.fit(), 100);
  }

  filterCategories(categories) {
    const set = new Set(categories);
    this.container.selectAll('.node').style('display', d => set.has(d.category) ? 'block' : 'none');
    this.container.selectAll('.link').style('display', d => {
      return set.has(d.source.category) && set.has(d.target.category) ? 'block' : 'none';
    });
  }

  search(query) {
    if (!query) {
      this.container.selectAll('.node').style('opacity', 1);
      this.container.selectAll('.link').style('opacity', 0.55);
      return;
    }
    const q = query.toLowerCase();
    this.container.selectAll('.node').style('opacity', d =>
      d.id.toLowerCase().includes(q) || d.label.toLowerCase().includes(q) ? 1 : 0.12
    );
    this.container.selectAll('.link').style('opacity', 0.08);
  }

  findPath(fromId, toId) {
    if (!fromId || !toId) return null;
    const adj = new Map();
    this.nodes.forEach(n => adj.set(n.id, []));
    this.links.forEach(l => {
      adj.get(l.source.id).push(l.target.id);
      adj.get(l.target.id).push(l.source.id);
    });

    const visited = new Set();
    const queue = [[fromId]];
    while (queue.length) {
      const path = queue.shift();
      const current = path[path.length - 1];
      if (current === toId) return path;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const neighbor of adj.get(current) || []) {
        if (!visited.has(neighbor)) queue.push([...path, neighbor]);
      }
    }
    return null;
  }

  drawMinimap() {
    const canvas = document.getElementById('minimap');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const cw = w / 2, ch = h / 2;

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--panel');
    ctx.fillRect(0, 0, cw, ch);

    if (this.nodes.length === 0) return;

    const bounds = this.container.node().getBBox();
    const pad = 20;
    const mw = bounds.width + pad * 2 || cw;
    const mh = bounds.height + pad * 2 || ch;
    const scale = Math.min(cw / mw, ch / mh);
    const ox = (cw - mw * scale) / 2 - (bounds.x - pad) * scale;
    const oy = (ch - mh * scale) / 2 - (bounds.y - pad) * scale;

    this.links.forEach(l => {
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(ox + l.source.x * scale, oy + l.source.y * scale);
      ctx.lineTo(ox + l.target.x * scale, oy + l.target.y * scale);
      ctx.stroke();
    });

    this.nodes.forEach(n => {
      ctx.fillStyle = this.colorMap[n.category] || this.colorMap.default;
      ctx.beginPath();
      ctx.arc(ox + n.x * scale, oy + n.y * scale, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  exportSVG() {
    const svgNode = this.svg.node().cloneNode(true);
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgNode);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    return URL.createObjectURL(blob);
  }

  exportPNG(callback) {
    const svgNode = this.svg.node().cloneNode(true);
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgNode);
    const canvas = document.createElement('canvas');
    canvas.width = this.width * 2;
    canvas.height = this.height * 2;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      callback(canvas.toDataURL('image/png'));
    };
    img.src = url;
  }
}
