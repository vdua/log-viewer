// Simplified Application State
let state = {
  sessions: [],
  selectedSession: null,
  apis: [],
  bodies: {},
  selectedApiId: null
};

// DOM Elements
const el = {
  screenSelector: document.getElementById('screen-selector'),
  screenDashboard: document.getElementById('screen-dashboard'),
  dirSearch: document.getElementById('dir-search'),
  sessionList: document.getElementById('session-list'),
  
  btnBack: document.getElementById('btn-back'),
  activeSessionName: document.getElementById('active-session-name'),
  topPayloadSearch: document.getElementById('top-payload-search'),
  
  stat200: document.getElementById('stat-200'),
  stat500: document.getElementById('stat-500'),
  
  // Views
  apiList: document.getElementById('api-list'),
  apiCount: document.getElementById('api-count'),
  
  // Inspector
  inspectorEmpty: document.getElementById('inspector-empty'),
  inspectorActive: document.getElementById('inspector-active'),
  inspectMethod: document.getElementById('inspect-method'),
  inspectPath: document.getElementById('inspect-path'),
  inspectStatus: document.getElementById('inspect-status'),
  
  // Content blocks
  sectionState: document.getElementById('section-state'),
  stateJsonContent: document.getElementById('state-json-content'),
  reqJsonContent: document.getElementById('req-json-content'),
  resJsonContent: document.getElementById('res-json-content')
};

// --- APP INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadSessions();
});

function initEventListeners() {
  // Screen 1: Search Directories
  el.dirSearch.addEventListener('input', renderSessions);
  
  // Header: Go Back
  el.btnBack.addEventListener('click', showSessionSelector);
  
  // Top-level payload filtering
  el.topPayloadSearch.addEventListener('input', applyTopPayloadSearch);
  
  // Accordion Toggle
  document.querySelectorAll('.section-title-bar').forEach(bar => {
    bar.addEventListener('click', () => {
      const section = bar.closest('.details-section');
      if (section) {
        section.classList.toggle('collapsed');
      }
    });
  });
  
  // Payload search containers (Prevent collapsing when searching)
  document.querySelectorAll('.payload-search-container').forEach(container => {
    container.addEventListener('click', (e) => e.stopPropagation());
  });
  
  // Payload search inputs
  document.querySelectorAll('.input-payload-search').forEach(input => {
    input.addEventListener('input', handlePayloadSearch);
    input.addEventListener('click', (e) => e.stopPropagation()); // Prevent collapsing accordion
  });
  
  // Copy Buttons
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent collapsing accordion
      const targetId = btn.getAttribute('data-target');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        const text = targetEl.dataset.raw || targetEl.innerText;
        navigator.clipboard.writeText(text).then(() => {
          const originalText = btn.innerText;
          btn.innerText = 'Copied!';
          setTimeout(() => {
            btn.innerText = originalText;
          }, 1500);
        });
      }
    });
  });
}

// --- SCREEN 1: SESSION SELECTOR ---

async function loadSessions() {
  try {
    const res = await fetch('/api/logs');
    state.sessions = await res.json();
    renderSessions();
  } catch (err) {
    console.error('Failed to load log directories:', err);
    el.sessionList.innerHTML = `
      <div class="empty-state">
        <p style="color: var(--error)">Error loading log directories from backend. Ensure the server is running.</p>
      </div>
    `;
  }
}

function renderSessions() {
  const query = el.dirSearch.value.trim().toLowerCase();
  const filtered = state.sessions.filter(s => s.name.toLowerCase().includes(query));
  
  if (filtered.length === 0) {
    el.sessionList.innerHTML = `
      <div class="empty-state">
        <p>No log directories found${query ? ' matching search' : ''}.</p>
      </div>
    `;
    return;
  }
  
  el.sessionList.innerHTML = filtered.map(s => {
    const dateStr = new Date(s.createdAt).toLocaleString();
    const sizeMB = (s.sizeBytes / (1024 * 1024)).toFixed(2);
    
    return `
      <div class="session-item" data-name="${s.name}">
        <div class="session-name-cell">
          <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <div>
            <div class="session-title">${s.name}</div>
          </div>
        </div>
        <div class="text-right">${s.totalApis} calls</div>
        <div class="text-right">${sizeMB} MB</div>
        <div class="session-meta">${dateStr}</div>
      </div>
    `;
  }).join('');
  
  // Attach select handlers
  el.sessionList.querySelectorAll('.session-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.getAttribute('data-name');
      selectSession(name);
    });
  });
}

function showSessionSelector() {
  state.selectedSession = null;
  state.apis = [];
  state.bodies = {};
  state.selectedApiId = null;
  
  el.screenDashboard.classList.remove('active');
  el.screenSelector.classList.add('active');
  el.dirSearch.value = '';
  el.topPayloadSearch.value = '';
  loadSessions();
}

// --- SCREEN 2 & 3: DASHBOARD ---

async function selectSession(folderName) {
  state.selectedSession = folderName;
  el.activeSessionName.innerText = folderName;
  el.topPayloadSearch.value = '';
  
  el.screenSelector.classList.remove('active');
  el.screenDashboard.classList.add('active');
  
  el.apiList.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading APIs...</p></div>`;
  el.inspectorActive.style.display = 'none';
  el.inspectorEmpty.style.display = 'flex';
  
  try {
    const [apisRes, bodiesRes] = await Promise.all([
      fetch(`/api/logs/${folderName}/apis`),
      fetch(`/api/logs/${folderName}/bodies`)
    ]);
    
    state.apis = await apisRes.json();
    state.bodies = await bodiesRes.json();
    
    // Process stats
    const successCount = state.apis.filter(a => a.status >= 200 && a.status < 300).length;
    const errorCount = state.apis.length - successCount;
    el.stat200.innerText = successCount;
    el.stat500.innerText = errorCount;
    
    el.apiCount.innerText = `${state.apis.length} / ${state.apis.length}`;
    
    renderApiList();
  } catch (err) {
    console.error('Failed to load session details:', err);
    el.apiList.innerHTML = `<div class="empty-state"><p style="color: var(--error)">Error loading session logs.</p></div>`;
  }
}

// Helper: search key 'stateInfo' recursively
function findStateInfo(obj) {
  if (!obj || typeof obj !== 'object') return null;
  
  if (obj.stateInfo) {
    if (typeof obj.stateInfo === 'string') {
      try {
        return JSON.parse(obj.stateInfo);
      } catch (e) {
        return obj.stateInfo;
      }
    }
    return obj.stateInfo;
  }
  
  for (const key of Object.keys(obj)) {
    const found = findStateInfo(obj[key]);
    if (found) return found;
  }
  
  return null;
}

// Helper to determine if an API has state data
function hasStateInfo(id) {
  const payload = state.bodies[id];
  if (!payload) return false;
  return !!(findStateInfo(payload.req) || findStateInfo(payload.res));
}

function renderApiList(apisToRender = state.apis) {
  if (apisToRender.length === 0) {
    el.apiList.innerHTML = `<div class="empty-state"><p>No matching API calls in this log.</p></div>`;
    return;
  }
  
  el.apiList.innerHTML = apisToRender.map(api => {
    const statusClass = api.status >= 500 ? 'red' : (api.status >= 400 ? 'orange' : 'green');
    const lastName = api.path.split('?')[0].split('/').pop();
    const isStateCall = hasStateInfo(api.id);
    const stateLabel = isStateCall ? `<span class="state-badge">State</span>` : '';
    
    return `
      <div class="api-item" data-id="${api.id}">
        <div class="api-index-col">#${api.id}</div>
        <div class="api-method-col method-${api.method}">${api.method}</div>
        <div class="api-path-col" title="${api.path}">
          ${lastName}
          ${stateLabel}
        </div>
        <div class="api-status-col">
          <span class="status-pill ${statusClass}">${api.status}</span>
        </div>
      </div>
    `;
  }).join('');
  
  // Attach select handlers
  el.apiList.querySelectorAll('.api-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.getAttribute('data-id'), 10);
      selectApi(id);
    });
  });
}

function selectApi(id) {
  state.selectedApiId = id;
  
  // Highlight selection
  document.querySelectorAll('.api-item.selected').forEach(el => el.classList.remove('selected'));
  const elItem = el.apiList.querySelector(`.api-item[data-id="${id}"]`);
  if (elItem) elItem.classList.add('selected');
  
  renderInspector();
}

function renderInspector() {
  const api = state.apis.find(a => a.id === state.selectedApiId);
  const bodies = state.bodies[state.selectedApiId];
  
  if (!api || !bodies) {
    el.inspectorActive.style.display = 'none';
    el.inspectorEmpty.style.display = 'flex';
    return;
  }
  
  // Reset all search inputs and match counts
  document.querySelectorAll('.input-payload-search').forEach(input => {
    input.value = '';
  });
  document.querySelectorAll('.match-count').forEach(count => {
    count.innerText = '';
    count.className = 'match-count';
  });
  
  el.inspectorEmpty.style.display = 'none';
  el.inspectorActive.style.display = 'flex';
  
  // Header details
  const statusClass = api.status >= 500 ? 'red' : (api.status >= 400 ? 'orange' : 'green');
  el.inspectMethod.className = `badge method-${api.method}`;
  el.inspectMethod.innerText = api.method;
  el.inspectPath.innerText = api.path;
  el.inspectPath.title = api.path;
  el.inspectStatus.className = `status-pill ${statusClass}`;
  el.inspectStatus.innerText = api.status;
  
  // Render Payloads inside pre blocks
  const reqStr = bodies.req ? JSON.stringify(bodies.req, null, 2) : 'null';
  el.reqJsonContent.innerText = reqStr;
  el.reqJsonContent.dataset.raw = reqStr;
  
  const resStr = bodies.res ? JSON.stringify(bodies.res, null, 2) : 'null';
  el.resJsonContent.innerText = resStr;
  el.resJsonContent.dataset.raw = resStr;
  
  // Extract and render stateInfo if it exists
  const stateInfo = findStateInfo(bodies.req) || findStateInfo(bodies.res);
  if (stateInfo) {
    el.sectionState.style.display = 'block';
    el.sectionState.classList.remove('collapsed'); // ensure open when new data loads
    const stateStr = JSON.stringify(stateInfo, null, 2);
    el.stateJsonContent.innerText = stateStr;
    el.stateJsonContent.dataset.raw = stateStr;
  } else {
    el.sectionState.style.display = 'none';
    el.stateJsonContent.innerText = '';
    el.stateJsonContent.dataset.raw = '';
  }
}

// --- PAYLOAD SEARCH AND TEXT HIGHLIGHT HANDLER ---

function handlePayloadSearch(e) {
  const query = e.target.value.trim();
  const targetId = e.target.getAttribute('data-target');
  const targetEl = document.getElementById(targetId);
  
  // Find matching count indicator ID
  let countId = 'req-match-count';
  if (targetId === 'state-json-content') countId = 'state-match-count';
  if (targetId === 'res-json-content') countId = 'res-match-count';
  const countEl = document.getElementById(countId);
  
  if (!targetEl || !targetEl.dataset.raw) return;
  
  const rawData = targetEl.dataset.raw;
  
  if (!query) {
    // Reset back to original raw text
    targetEl.innerText = rawData;
    if (countEl) {
      countEl.innerText = '';
      countEl.className = 'match-count';
    }
    return;
  }
  
  // Escape HTML before injecting match tags
  const escapedData = escapeHtml(rawData);
  
  // Escape special regex character tokens
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedQuery, 'gi');
  
  let matchCount = 0;
  const highlightedHtml = escapedData.replace(regex, (match) => {
    matchCount++;
    return `<mark class="json-highlight">${match}</mark>`;
  });
  
  targetEl.innerHTML = highlightedHtml;
  
  if (countEl) {
    if (matchCount > 0) {
      countEl.innerText = `${matchCount} found`;
      countEl.className = 'match-count active';
    } else {
      countEl.innerText = 'no matches';
      countEl.className = 'match-count empty';
    }
  }
  
  // Auto-scroll to the first highlighted match
  const firstMatch = targetEl.querySelector('mark');
  if (firstMatch) {
    firstMatch.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

// --- TOP LEVEL PAYLOAD FILTER ---

function applyTopPayloadSearch() {
  const query = el.topPayloadSearch.value.trim().toLowerCase();
  
  if (!query) {
    renderApiList(state.apis);
    el.apiCount.innerText = `${state.apis.length} / ${state.apis.length}`;
    highlightActiveSelectionInList();
    return;
  }
  
  const filtered = state.apis.filter(api => {
    const bodies = state.bodies[api.id];
    if (!bodies) return false;
    
    // Convert payloads directly to lowercase strings
    const reqStr = bodies.req ? JSON.stringify(bodies.req).toLowerCase() : '';
    const resStr = bodies.res ? JSON.stringify(bodies.res).toLowerCase() : '';
    
    return reqStr.includes(query) || resStr.includes(query);
  });
  
  renderApiList(filtered);
  el.apiCount.innerText = `${filtered.length} / ${state.apis.length}`;
  highlightActiveSelectionInList();
}

function highlightActiveSelectionInList() {
  document.querySelectorAll('.api-item.selected').forEach(el => el.classList.remove('selected'));
  if (state.selectedApiId !== null) {
    const elItem = el.apiList.querySelector(`.api-item[data-id="${state.selectedApiId}"]`);
    if (elItem) elItem.classList.add('selected');
  }
}

// --- UTILITY HELPER ---

function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
