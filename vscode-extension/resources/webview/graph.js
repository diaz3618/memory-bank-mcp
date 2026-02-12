/**
 * Graph Webview — Client-side JS
 *
 * Initializes Cytoscape.js, manages user interactions, and communicates
 * with the extension host via the VS Code postMessage API.
 *
 * Runs inside the webview sandbox (browser context, NOT Node.js).
 */

/* global cytoscape, acquireVsCodeApi */

(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  // ── Entity type → color/shape map ────────────────────────────────
  // Modern, sophisticated color palette with consistent rounded shapes

  const TYPE_STYLES = {
    project:  { color: '#3b82f6', shape: 'round-rectangle' },  // Blue
    person:   { color: '#10b981', shape: 'round-rectangle' },  // Emerald
    system:   { color: '#f59e0b', shape: 'round-rectangle' },  // Amber
    concept:  { color: '#8b5cf6', shape: 'round-rectangle' },  // Violet
    file:     { color: '#64748b', shape: 'round-rectangle' },  // Slate
    module:   { color: '#06b6d4', shape: 'round-rectangle' },  // Cyan
    service:  { color: '#ef4444', shape: 'round-rectangle' },  // Red
    tool:     { color: '#f97316', shape: 'round-rectangle' },  // Orange
    language: { color: '#6366f1', shape: 'round-rectangle' },  // Indigo
    pattern:  { color: '#a855f7', shape: 'round-rectangle' },  // Purple
    default:  { color: '#71717a', shape: 'round-rectangle' },  // Neutral
  };

  const DEFAULT_STYLE = { color: '#71717a', shape: 'round-rectangle' };

  function styleFor(entityType) {
    return TYPE_STYLES[entityType?.toLowerCase()] || DEFAULT_STYLE;
  }

  // ── Register fcose layout ────────────────────────────────────────

  if (typeof cytoscapeFcose !== 'undefined') {
    cytoscape.use(cytoscapeFcose);
  }

  // ── Initialize Cytoscape ─────────────────────────────────────────

  const cy = cytoscape({
    container: document.getElementById('cy-container'),
    elements: [],
    style: [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '12px',
          'font-weight': 500,
          'font-family': 'var(--vscode-font-family, sans-serif)',
          'color': '#ffffff',
          'text-outline-width': 0,
          'background-color': 'data(color)',
          'background-opacity': 0.95,
          'shape': 'data(shape)',
          'width': 'label',
          'height': 36,
          'padding': '12px',
          'border-width': 1.5,
          'border-color': '#00000020',
          'border-opacity': 0.3,
          'text-max-width': '140px',
          'text-wrap': 'wrap',
          // Modern shadow for depth
          'shadow-blur': 8,
          'shadow-color': '#00000040',
          'shadow-offset-x': 0,
          'shadow-offset-y': 2,
          'shadow-opacity': 0.25,
        },
      },
      {
        selector: 'node:selected',
        style: {
          'border-width': 2.5,
          'border-color': '#3b82f6',
          'border-opacity': 1,
          'shadow-blur': 12,
          'shadow-color': '#3b82f680',
          'shadow-opacity': 0.5,
        },
      },
      {
        selector: 'node:hover',
        style: {
          'background-opacity': 1,
          'shadow-blur': 10,
          'shadow-opacity': 0.35,
        },
      },
      {
        selector: 'node.faded',
        style: { 
          'opacity': 0.2,
          'shadow-opacity': 0,
        },
      },
      {
        selector: 'edge',
        style: {
          'label': 'data(label)',
          'font-size': '10px',
          'color': 'var(--vscode-descriptionForeground, #888)',
          'text-rotation': 'autorotate',
          'text-margin-y': -10,
          'text-background-color': 'var(--vscode-editor-background)',
          'text-background-opacity': 0.8,
          'text-background-padding': '3px',
          'curve-style': 'unbundled-bezier',
          'control-point-distances': [40],
          'control-point-weights': [0.5],
          'target-arrow-shape': 'triangle',
          'arrow-scale': 1.2,
          'line-color': '#ffffff15',
          'target-arrow-color': '#ffffff20',
          'width': 2,
          'opacity': 0.6,
        },
      },
      {
        selector: 'edge:selected',
        style: {
          'line-color': '#3b82f6',
          'target-arrow-color': '#3b82f6',
          'opacity': 1,
          'width': 2.5,
        },
      },
      {
        selector: 'edge.faded',
        style: { 
          'opacity': 0.1,
        },
      },
    ],
    layout: { name: 'grid' },
    minZoom: 0.15,
    maxZoom: 4,
    wheelSensitivity: 0.3,
  });

  // ── State ────────────────────────────────────────────────────────

  let allEntities = {};   // name → entity data
  let allRelations = [];  // full relation list
  let selectedNode = null;

  // ── DOM references ───────────────────────────────────────────────

  const searchInput = document.getElementById('search-input');
  const btnSearch = document.getElementById('btn-search');
  const btnFit = document.getElementById('btn-fit');
  const btnRebuild = document.getElementById('btn-rebuild');
  const loadingEl = document.getElementById('loading-indicator');
  const inspector = document.getElementById('inspector');
  const inspName = document.getElementById('insp-name');
  const inspType = document.getElementById('insp-type');
  const inspAttrs = document.getElementById('insp-attrs');
  const inspObs = document.getElementById('insp-observations');
  const inspRels = document.getElementById('insp-relations');
  const btnAddObs = document.getElementById('btn-add-obs');
  const btnLink = document.getElementById('btn-link');
  const btnExpand = document.getElementById('btn-expand');
  const btnDelete = document.getElementById('btn-delete');

  // ── Toolbar events ───────────────────────────────────────────────

  btnSearch.addEventListener('click', () => doSearch());
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
  btnFit.addEventListener('click', () => cy.fit(undefined, 40));
  btnRebuild.addEventListener('click', () => {
    vscode.postMessage({ type: 'rebuild' });
  });

  function doSearch() {
    const q = searchInput.value.trim();
    if (q) {
      vscode.postMessage({ type: 'search', query: q });
    } else {
      // Clear search — unfade all
      cy.elements().removeClass('faded');
    }
  }

  // ── Inspector action events ──────────────────────────────────────

  btnAddObs.addEventListener('click', () => {
    if (!selectedNode) return;
    const text = prompt('Observation text:');
    if (text) {
      vscode.postMessage({ type: 'addObservation', entity: selectedNode, text });
    }
  });

  btnLink.addEventListener('click', () => {
    if (!selectedNode) return;
    const to = prompt('Link to entity (name):');
    if (!to) return;
    const rel = prompt('Relation type (e.g. uses, depends-on):');
    if (!rel) return;
    vscode.postMessage({ type: 'linkEntities', from: selectedNode, to, relationType: rel });
  });

  btnExpand.addEventListener('click', () => {
    if (!selectedNode) return;
    vscode.postMessage({ type: 'openNodes', nodes: [selectedNode], depth: 1 });
  });

  btnDelete.addEventListener('click', () => {
    if (!selectedNode) return;
    vscode.postMessage({ type: 'deleteEntity', entity: selectedNode });
  });

  // ── Cytoscape events ─────────────────────────────────────────────

  cy.on('tap', 'node', (evt) => {
    const node = evt.target;
    selectedNode = node.id();
    showInspector(node.id());
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      selectedNode = null;
      inspector.classList.add('hidden');
    }
  });

  cy.on('dbltap', 'node', (evt) => {
    const name = evt.target.id();
    vscode.postMessage({ type: 'openNodes', nodes: [name], depth: 1 });
  });

  // ── Message handler (from extension) ─────────────────────────────

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'graphData':
        loadGraph(msg.entities, msg.relations, msg.focusNode);
        break;
      case 'searchResults':
        highlightSearchResults(msg.entities);
        break;
      case 'error':
        showError(msg.message);
        break;
      case 'loading':
        loadingEl.classList.toggle('hidden', !msg.active);
        break;
      case 'removeNode':
        removeNodeFromGraph(msg.name);
        break;
      case 'focusNode':
        focusOnNode(msg.name);
        break;
    }
  });

  // ── Graph rendering ──────────────────────────────────────────────

  function loadGraph(entities, relations, focusNode) {
    const elements = [];

    // Store state
    for (const e of entities) {
      allEntities[e.name] = e;
      const s = styleFor(e.entityType);
      elements.push({
        group: 'nodes',
        data: {
          id: e.name,
          label: e.name,
          entityType: e.entityType || 'unknown',
          color: s.color,
          shape: s.shape,
        },
      });
    }

    allRelations = relations;
    for (const r of relations) {
      // Only add edge if both source and target exist
      if (allEntities[r.from] && allEntities[r.to]) {
        const edgeId = `${r.from}--${r.relationType}--${r.to}`;
        elements.push({
          group: 'edges',
          data: {
            id: edgeId,
            source: r.from,
            target: r.to,
            label: r.relationType,
          },
        });
      }
    }

    // Merge: remove old elements, add new
    cy.elements().remove();
    cy.add(elements);
    runLayout();

    if (focusNode) {
      setTimeout(() => focusOnNode(focusNode), 300);
    }
  }

  function runLayout() {
    const count = cy.nodes().length;
    if (count === 0) return;

    const layoutName = (typeof cytoscapeFcose !== 'undefined' && count > 2) ? 'fcose' : 'cose';
    cy.layout({
      name: layoutName,
      animate: count < 80,
      animationDuration: 400,
      fit: true,
      padding: 40,
      nodeRepulsion: 8000,
      idealEdgeLength: 120,
      gravity: 0.25,
      randomize: true,
    }).run();
  }

  function highlightSearchResults(entities) {
    const names = new Set(entities.map((e) => e.name));

    // Merge any new entities into the graph
    const newEls = [];
    for (const e of entities) {
      if (!cy.getElementById(e.name).length) {
        allEntities[e.name] = e;
        const s = styleFor(e.entityType);
        newEls.push({
          group: 'nodes',
          data: {
            id: e.name,
            label: e.name,
            entityType: e.entityType || 'unknown',
            color: s.color,
            shape: s.shape,
          },
        });
      }
    }
    if (newEls.length) {
      cy.add(newEls);
      runLayout();
    }

    // Fade non-matching, unfade matching
    cy.nodes().forEach((n) => {
      n.toggleClass('faded', !names.has(n.id()));
    });
    cy.edges().forEach((e) => {
      const src = e.source().id();
      const tgt = e.target().id();
      e.toggleClass('faded', !names.has(src) && !names.has(tgt));
    });
  }

  function removeNodeFromGraph(name) {
    const node = cy.getElementById(name);
    if (node.length) node.remove();
    delete allEntities[name];
    if (selectedNode === name) {
      selectedNode = null;
      inspector.classList.add('hidden');
    }
  }

  function focusOnNode(name) {
    const node = cy.getElementById(name);
    if (node.length) {
      cy.animate({ center: { eles: node }, zoom: 1.5 }, { duration: 300 });
      node.select();
      selectedNode = name;
      showInspector(name);
    }
  }

  // ── Inspector ────────────────────────────────────────────────────

  function showInspector(name) {
    const entity = allEntities[name];
    if (!entity) {
      inspector.classList.add('hidden');
      return;
    }

    inspector.classList.remove('hidden');
    inspName.textContent = entity.name;
    inspType.textContent = entity.entityType || 'unknown';

    // Attrs
    inspAttrs.innerHTML = '';
    if (entity.attrs && Object.keys(entity.attrs).length) {
      let html = '<table>';
      for (const [k, v] of Object.entries(entity.attrs)) {
        html += `<tr><td>${esc(k)}</td><td>${esc(String(v))}</td></tr>`;
      }
      html += '</table>';
      inspAttrs.innerHTML = html;
    }

    // Observations
    inspObs.innerHTML = '';
    const obs = entity.observations || [];
    // Most recent first
    const sorted = [...obs].reverse();
    for (const o of sorted.slice(0, 20)) {
      const li = document.createElement('li');
      li.innerHTML = esc(o.text);
      if (o.timestamp || o.source) {
        const time = document.createElement('span');
        time.className = 'obs-time';
        time.textContent = [o.source, o.timestamp].filter(Boolean).join(' · ');
        li.appendChild(time);
      }
      inspObs.appendChild(li);
    }
    if (obs.length > 20) {
      const more = document.createElement('li');
      more.className = 'muted';
      more.textContent = `… and ${obs.length - 20} more`;
      inspObs.appendChild(more);
    }
    if (obs.length === 0) {
      inspObs.innerHTML = '<li class="muted">No observations</li>';
    }

    // Relations
    inspRels.innerHTML = '';
    const outgoing = allRelations.filter((r) => r.from === name);
    const incoming = allRelations.filter((r) => r.to === name);
    for (const r of outgoing) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="rel-arrow">→</span> ${esc(r.relationType)}: <strong>${esc(r.to)}</strong>`;
      inspRels.appendChild(li);
    }
    for (const r of incoming) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="rel-arrow">←</span> ${esc(r.relationType)}: <strong>${esc(r.from)}</strong>`;
      inspRels.appendChild(li);
    }
    if (outgoing.length === 0 && incoming.length === 0) {
      inspRels.innerHTML = '<li class="muted">No relations</li>';
    }
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function showError(message) {
    // Simple toast-style error
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;top:8px;right:8px;padding:8px 14px;background:#5a1d1d;color:#f48771;border-radius:4px;z-index:9999;font-size:12px;max-width:300px;';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  // ── Boot ─────────────────────────────────────────────────────────

  vscode.postMessage({ type: 'ready' });
})();
