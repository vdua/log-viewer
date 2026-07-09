// Simplified Application State
let state = {
  sessions: [],
  selectedSession: null,
  apis: [],
  bodies: {},
  selectedApiId: null,
  apps: [],
  activeApp: '',
  activeLogsDir: '',
  visibleItemsCount: 20
};

// DOM Elements
const el = {
  screenSelector: document.getElementById('screen-selector'),
  screenDashboard: document.getElementById('screen-dashboard'),
  dirSearch: document.getElementById('dir-search'),
  sessionList: document.getElementById('session-list'),
  sessionPagination: document.getElementById('session-pagination'),
  
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
  resJsonContent: document.getElementById('res-json-content'),
  
  // Screenshot blocks
  sectionScreenshot: document.getElementById('section-screenshot'),
  screenshotImage: document.getElementById('screenshot-image'),
  btnCleanAll: document.getElementById('btn-clean-all'),

  // Application Workspaces Elements
  appList: document.getElementById('app-list'),
  addAppForm: document.getElementById('add-app-form'),
  appPathInput: document.getElementById('app-path-input')
};

// --- APP INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadApps();
});

function initEventListeners() {
  // Screen 1: Search Directories & Clean All
  el.dirSearch.addEventListener('input', () => {
    state.visibleItemsCount = 20;
    renderSessions();
  });
  if (el.btnCleanAll) {
    el.btnCleanAll.addEventListener('click', cleanAllSessions);
  }
  
  // Infinite Scroll scroll listener on the session list container
  if (el.sessionList) {
    el.sessionList.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = el.sessionList;
      if (scrollHeight - scrollTop - clientHeight < 40) {
        const query = el.dirSearch.value.trim().toLowerCase();
        const filteredCount = state.sessions.filter(s => s.name.toLowerCase().includes(query)).length;
        if (state.visibleItemsCount < filteredCount) {
          state.visibleItemsCount += 20;
          renderSessions();
        }
      }
    });
  }
  
  // Header: Go Back
  el.btnBack.addEventListener('click', showSessionSelector);
  
  // Top-level payload filtering
  el.topPayloadSearch.addEventListener('input', applyTopPayloadSearch);
  
  // Workspace Manager: Submit new app
  if (el.addAppForm) {
    el.addAppForm.addEventListener('submit', handleAddApp);
  }

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

  // Expand / Collapse JSON Buttons
  document.querySelectorAll('.btn-json-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent collapsing accordion section
      const action = btn.getAttribute('data-action');
      const targetId = btn.getAttribute('data-target');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        if (action === 'expand') {
          targetEl.querySelectorAll('.json-collapsible').forEach(node => {
            node.classList.remove('collapsed');
          });
        } else if (action === 'collapse') {
          targetEl.querySelectorAll('.json-collapsible').forEach(node => {
            node.classList.add('collapsed');
          });
        }
      }
    });
  });
}

// --- WORKSPACE MANAGEMENT ---

async function loadApps() {
  try {
    const res = await fetch('/api/apps');
    const data = await res.json();
    state.apps = data.apps || [];
    state.activeApp = data.activeApp || '';
    state.activeLogsDir = data.activeLogsDir || '';
    renderApps();
    state.visibleItemsCount = 20;
    await loadSessions();
  } catch (err) {
    console.error('Failed to load apps:', err);
    el.appList.innerHTML = `
      <div class="empty-state">
        <p style="color: var(--error)">Error loading workspaces. Check if the backend server is running.</p>
      </div>
    `;
  }
}

function getUniqueWorkspaceNames(paths) {
  const pathSegments = paths.map(p => ({
    original: p,
    segments: p.split('/').filter(Boolean)
  }));

  const results = {};
  for (const item of pathSegments) {
    let k = 1;
    let suffix = '';
    let start = 0;
    while (true) {
      start = Math.max(0, item.segments.length - k);
      suffix = item.segments.slice(start).join('/');
      if (start === 0) break;

      let isUnique = true;
      for (const other of pathSegments) {
        if (other.original === item.original) continue;
        const otherStart = Math.max(0, other.segments.length - k);
        const otherSuffix = other.segments.slice(otherStart).join('/');
        if (suffix === otherSuffix) {
          isUnique = false;
          break;
        }
      }
      if (isUnique) break;
      k++;
    }
    results[item.original] = (start === 0) ? item.original : suffix;
  }
  return results;
}

function renderApps() {
  if (state.apps.length === 0) {
    el.appList.innerHTML = `
      <div class="empty-state">
        <p>No application workspaces registered.</p>
      </div>
    `;
    return;
  }

  const uniqueNames = getUniqueWorkspaceNames(state.apps);

  el.appList.innerHTML = state.apps.map((app, index) => {
    const isActive = app === state.activeApp;
    const isDefault = index === 0;
    
    // Check path for code/test/integration/logs relative to the app
    const resolvedLogsPath = app + (app.endsWith('/') || app.endsWith('\\') ? '' : '/') + 'code/test/integration/logs';

    const deleteBtn = isDefault ? '' : `
      <button class="btn-delete-app" data-path="${app}" title="Remove Workspace">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    return `
      <div class="app-item ${isActive ? 'active' : ''}" data-path="${app}">
        <div class="app-item-info">
          <div style="display: flex; align-items: center; gap: 8px;">
            ${isActive ? '<span class="app-badge">Active</span>' : ''}
            <span class="app-path" title="${app}">${uniqueNames[app]}</span>
          </div>
          <span class="app-logs-resolved" title="${resolvedLogsPath}">Logs path: ${resolvedLogsPath}</span>
        </div>
        ${deleteBtn}
      </div>
    `;
  }).join('');

  // Click handler to activate app
  el.appList.querySelectorAll('.app-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-app')) return;
      const path = item.getAttribute('data-path');
      selectActiveApp(path);
    });
  });

  // Delete handler
  el.appList.querySelectorAll('.btn-delete-app').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const path = btn.getAttribute('data-path');
      if (confirm(`Are you sure you want to remove workspace "${path}"?`)) {
        removeApp(path);
      }
    });
  });
}

async function selectActiveApp(path) {
  try {
    const res = await fetch('/api/apps/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    const result = await res.json();
    if (result.success) {
      loadApps();
    } else {
      alert(`Error: ${result.error || 'Failed to select workspace'}`);
    }
  } catch (err) {
    console.error('Failed to select workspace:', err);
    alert('Server error setting workspace.');
  }
}

async function removeApp(path) {
  try {
    const res = await fetch('/api/apps', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    const result = await res.json();
    if (result.success) {
      loadApps();
    } else {
      alert(`Error: ${result.error || 'Failed to remove workspace'}`);
    }
  } catch (err) {
    console.error('Failed to remove workspace:', err);
    alert('Server error removing workspace.');
  }
}

async function handleAddApp(e) {
  e.preventDefault();
  const path = el.appPathInput.value.trim();
  if (!path) return;

  try {
    const res = await fetch('/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    const result = await res.json();
    if (result.success) {
      el.appPathInput.value = '';
      loadApps();
    } else {
      alert(`Error: ${result.error || 'Failed to register workspace'}`);
    }
  } catch (err) {
    console.error('Failed to register workspace:', err);
    alert('Server error registering workspace. Please verify the absolute path exists.');
  }
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

  // Parse and categorize
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const categorized = filtered.map(s => {
    const match = s.name.match(/^network-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = match[1];
      const monthStr = match[2];
      const dayStr = match[3];
      const hour = match[4];
      const minute = match[5];
      const second = match[6];
      
      const mIdx = parseInt(monthStr, 10) - 1;
      const monthName = monthNames[mIdx] || monthStr;
      const day = parseInt(dayStr, 10);
      
      return {
        session: s,
        isStandard: true,
        dateKey: `${monthStr}-${dayStr}`, // For sorting (e.g. "07-09")
        dateDisplay: `${monthName} ${day}`,
        timeDisplay: `${hour}:${minute}:${second}`,
        timestampSort: `${hour}-${minute}-${second}`
      };
    } else {
      return {
        session: s,
        isStandard: false,
        dateKey: 'Others',
        dateDisplay: 'Others',
        timeDisplay: s.name,
        timestampSort: s.name
      };
    }
  });

  // Group by dateKey
  const groups = {};
  categorized.forEach(item => {
    const key = item.dateKey;
    if (!groups[key]) {
      groups[key] = {
        key: key,
        display: item.dateDisplay,
        items: []
      };
    }
    groups[key].items.push(item);
  });

  // Sort groups: Standard dates descending, "Others" always at the end
  const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'Others') return 1;
    if (b === 'Others') return -1;
    // Compare Month-Day strings descending
    return b.localeCompare(a);
  });

  // Sort items within each group
  sortedGroupKeys.forEach(key => {
    const group = groups[key];
    if (key === 'Others') {
      group.items.sort((a, b) => new Date(b.session.createdAt) - new Date(a.session.createdAt));
    } else {
      group.items.sort((a, b) => b.timestampSort.localeCompare(a.timestampSort));
    }
  });

  // Infinite Scroll Slice: We want to only show state.visibleItemsCount sessions in total
  let sessionCounter = 0;
  let html = '';

  for (const key of sortedGroupKeys) {
    const group = groups[key];
    const groupItems = [];
    
    for (const item of group.items) {
      if (sessionCounter >= state.visibleItemsCount) {
        break;
      }
      groupItems.push(item);
      sessionCounter++;
    }

    if (groupItems.length > 0) {
      // Render group header
      html += `<div class="session-group-header">${group.display}</div>`;
      
      // Render group items
      html += groupItems.map(item => {
        const s = item.session;
        const sizeStr = s.sizeBytes >= 1024 * 1024 
          ? `${(s.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
          : `${(s.sizeBytes / 1024).toFixed(2)} KB`;
        const mDateStr = new Date(s.createdAt).toLocaleString();
        
        return `
          <div class="session-item" data-name="${s.name}">
            <div class="session-name-cell">
              <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              <div>
                <div class="session-title">${item.timeDisplay}</div>
              </div>
            </div>
            <div class="text-right">${s.totalApis} calls</div>
            <div class="text-right">${sizeStr}</div>
            <div class="session-meta">${mDateStr}</div>
            <div class="action-cell">
              <button class="btn-delete-session" data-name="${s.name}" title="Delete Session">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="trash-icon">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    if (sessionCounter >= state.visibleItemsCount) {
      break;
    }
  }

  el.sessionList.innerHTML = html;

  // Attach select handlers
  el.sessionList.querySelectorAll('.session-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.getAttribute('data-name');
      selectSession(name);
    });
  });

  // Attach delete handlers
  el.sessionList.querySelectorAll('.btn-delete-session').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.getAttribute('data-name');
      if (confirm(`Are you sure you want to delete session "${name}"?`)) {
        deleteSession(name);
      }
    });
  });
}

function showSessionSelector() {
  state.selectedSession = null;
  state.apis = [];
  state.bodies = {};
  state.selectedApiId = null;
  state.visibleItemsCount = 20;
  
  el.screenDashboard.classList.remove('active');
  el.screenSelector.classList.add('active');
  el.dirSearch.value = '';
  el.topPayloadSearch.value = '';
  loadSessions();
}

async function deleteSession(name) {
  try {
    const res = await fetch(`/api/logs/${name}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      loadSessions();
    } else {
      alert(`Error: ${result.error || 'Failed to delete session'}`);
    }
  } catch (err) {
    console.error('Failed to delete session:', err);
    alert('Failed to delete session. Server error.');
  }
}

async function cleanAllSessions() {
  if (state.sessions.length === 0) {
    alert('No sessions to clean.');
    return;
  }
  if (confirm('Are you sure you want to clean ALL log sessions? This will permanently delete all session folders and flat log files.')) {
    try {
      const res = await fetch('/api/logs', { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        loadSessions();
      } else {
        alert(`Error: ${result.error || 'Failed to clean all sessions'}`);
      }
    } catch (err) {
      console.error('Failed to clean all sessions:', err);
      alert('Failed to clean all sessions. Server error.');
    }
  }
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
    const rawBodies = await bodiesRes.json();
    state.bodies = {};
    for (const [id, body] of Object.entries(rawBodies)) {
      state.bodies[id] = {
        req: parseStringifiedJSON(body.req),
        res: parseStringifiedJSON(body.res)
      };
    }
    
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
  renderJsonToElement(bodies.req, el.reqJsonContent);
  el.reqJsonContent.dataset.raw = reqStr;
  
  const resStr = bodies.res ? JSON.stringify(bodies.res, null, 2) : 'null';
  renderJsonToElement(bodies.res, el.resJsonContent);
  el.resJsonContent.dataset.raw = resStr;
  
  // Extract and render stateInfo if it exists
  const stateInfo = findStateInfo(bodies.req) || findStateInfo(bodies.res);
  if (stateInfo) {
    el.sectionState.style.display = 'block';
    el.sectionState.classList.remove('collapsed'); // ensure open when new data loads
    const stateStr = JSON.stringify(stateInfo, null, 2);
    renderJsonToElement(stateInfo, el.stateJsonContent);
    el.stateJsonContent.dataset.raw = stateStr;
  } else {
    el.sectionState.style.display = 'none';
    el.stateJsonContent.innerHTML = '';
    el.stateJsonContent.dataset.raw = '';
  }

  // Render Screenshot if present
  if (bodies.res && bodies.res.screenshot) {
    el.sectionScreenshot.style.display = 'block';
    el.sectionScreenshot.classList.remove('collapsed');
    el.screenshotImage.src = bodies.res.screenshot;
  } else {
    el.sectionScreenshot.style.display = 'none';
    el.screenshotImage.src = '';
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
  
  // Always start by rendering the clean JSON tree
  try {
    const parsed = JSON.parse(rawData);
    renderJsonToElement(parsed, targetEl);
  } catch (err) {
    targetEl.innerText = rawData;
  }
  
  if (!query) {
    if (countEl) {
      countEl.innerText = '';
      countEl.className = 'match-count';
    }
    return;
  }
  
  // Escape special regex character tokens
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedQuery, 'gi');
  
  let matchCount = 0;
  
  // Check if a tree view is present
  const jsonCollapsible = targetEl.querySelector('.json-node');
  if (jsonCollapsible) {
    const textElements = targetEl.querySelectorAll('.json-key, .json-string, .json-number, .json-boolean, .json-null');
    textElements.forEach(el => {
      const text = el.textContent;
      if (regex.test(text)) {
        // Highlight matches
        const highlightedHtml = text.replace(regex, (match) => {
          matchCount++;
          return `<mark class="json-highlight">${match}</mark>`;
        });
        el.innerHTML = highlightedHtml;
        
        // Auto-expand all parent elements to make this match visible
        let parent = el.closest('.json-node');
        while (parent && targetEl.contains(parent)) {
          if (parent.classList.contains('collapsed')) {
            parent.classList.remove('collapsed');
          }
          parent = parent.parentElement.closest('.json-node');
        }
      }
    });
  } else {
    // Fallback if not a tree (e.g. plain text response)
    const escapedData = escapeHtml(rawData);
    const highlightedHtml = escapedData.replace(regex, (match) => {
      matchCount++;
      return `<mark class="json-highlight">${match}</mark>`;
    });
    targetEl.innerHTML = highlightedHtml;
  }
  
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
    
    const apiIdStr = (api.id !== undefined && api.id !== null) ? api.id.toString().toLowerCase() : '';
    const apiMethod = api.method ? api.method.toLowerCase() : '';
    const apiPath = api.path ? api.path.toLowerCase() : '';
    const apiStatus = (api.status !== undefined && api.status !== null) ? api.status.toString().toLowerCase() : '';
    const apiScenario = api.scenario ? api.scenario.toLowerCase() : '';

    if (apiIdStr.includes(query) ||
        apiMethod.includes(query) ||
        apiPath.includes(query) ||
        apiStatus.includes(query) ||
        apiScenario.includes(query)) {
      return true;
    }

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

function parseStringifiedJSON(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseStringifiedJSON(parsed);
      } catch (e) {
        return obj;
      }
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => parseStringifiedJSON(item));
  }
  if (typeof obj === 'object') {
    const copy = {};
    for (const key of Object.keys(obj)) {
      copy[key] = parseStringifiedJSON(obj[key]);
    }
    return copy;
  }
  return obj;
}

// --- COLLAPSIBLE JSON TREE RENDERING FUNCTIONS ---

function buildJsonTreeDOM(val, isLast = true, key = null) {
  const node = document.createElement('div');
  node.className = 'json-node';

  // Key element
  if (key !== null) {
    const keySpan = document.createElement('span');
    keySpan.className = 'json-key';
    keySpan.textContent = JSON.stringify(key) + ': ';
    node.appendChild(keySpan);
  }

  const isObject = val !== null && typeof val === 'object';

  if (isObject) {
    node.classList.add('json-collapsible');
    
    // Add toggle icon
    const toggle = document.createElement('span');
    toggle.className = 'json-toggle';
    toggle.textContent = '▼';
    if (node.firstChild) {
      node.insertBefore(toggle, node.firstChild);
    } else {
      node.appendChild(toggle);
    }

    const isArray = Array.isArray(val);
    const openBrace = isArray ? '[' : '{';
    const closeBrace = isArray ? ']' : '}';

    const openSpan = document.createElement('span');
    openSpan.className = 'json-bracket';
    openSpan.textContent = openBrace;
    node.appendChild(openSpan);

    // Placeholder for collapsed state
    const placeholder = document.createElement('span');
    placeholder.className = 'json-placeholder';
    const count = isArray ? val.length : Object.keys(val).length;
    placeholder.textContent = isArray ? `[${count} items]` : `{${count} props}`;
    node.appendChild(placeholder);

    // Children container
    const childrenDiv = document.createElement('div');
    childrenDiv.className = 'json-children';

    const keys = isArray ? null : Object.keys(val);
    const length = isArray ? val.length : keys.length;

    if (isArray) {
      for (let i = 0; i < length; i++) {
        const childNode = buildJsonTreeDOM(val[i], i === length - 1);
        childrenDiv.appendChild(childNode);
      }
    } else {
      for (let i = 0; i < length; i++) {
        const childKey = keys[i];
        const childNode = buildJsonTreeDOM(val[childKey], i === length - 1, childKey);
        childrenDiv.appendChild(childNode);
      }
    }
    node.appendChild(childrenDiv);

    const closeSpan = document.createElement('span');
    closeSpan.className = 'json-bracket';
    closeSpan.textContent = closeBrace;
    node.appendChild(closeSpan);

    // Click handler for toggle / placeholder / opening bracket
    const toggleCollapse = (e) => {
      e.stopPropagation();
      node.classList.toggle('collapsed');
    };
    toggle.addEventListener('click', toggleCollapse);
    placeholder.addEventListener('click', toggleCollapse);
    openSpan.addEventListener('click', toggleCollapse);
  } else {
    // Primitive values
    const valueSpan = document.createElement('span');
    valueSpan.className = 'json-value';
    if (typeof val === 'string') {
      valueSpan.classList.add('json-string');
      valueSpan.textContent = JSON.stringify(val);
    } else if (typeof val === 'number') {
      valueSpan.classList.add('json-number');
      valueSpan.textContent = String(val);
    } else if (typeof val === 'boolean') {
      valueSpan.classList.add('json-boolean');
      valueSpan.textContent = String(val);
    } else if (val === null) {
      valueSpan.classList.add('json-null');
      valueSpan.textContent = 'null';
    } else {
      valueSpan.classList.add('json-other');
      valueSpan.textContent = String(val);
    }
    node.appendChild(valueSpan);
  }

  // Comma
  if (!isLast) {
    const commaSpan = document.createElement('span');
    commaSpan.className = 'json-comma';
    commaSpan.textContent = ',';
    node.appendChild(commaSpan);
  }

  return node;
}

function renderJsonToElement(val, containerEl) {
  containerEl.innerHTML = '';
  if (val === null || val === undefined) {
    const nullSpan = document.createElement('span');
    nullSpan.className = 'json-value json-null';
    nullSpan.textContent = 'null';
    containerEl.appendChild(nullSpan);
    return;
  }
  
  if (typeof val !== 'object') {
    const valueSpan = document.createElement('span');
    valueSpan.className = 'json-value';
    if (typeof val === 'string') {
      valueSpan.classList.add('json-string');
      valueSpan.textContent = JSON.stringify(val);
    } else {
      valueSpan.classList.add(typeof val === 'number' ? 'json-number' : (typeof val === 'boolean' ? 'json-boolean' : 'json-other'));
      valueSpan.textContent = String(val);
    }
    containerEl.appendChild(valueSpan);
    return;
  }

  const tree = buildJsonTreeDOM(val, true);
  containerEl.appendChild(tree);
}

