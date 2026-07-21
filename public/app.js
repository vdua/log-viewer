// Initialize theme as early as possible to prevent flash of wrong colors
(function() {
  const storedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', storedTheme);
})();

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
  visibleItemsCount: 20,
  comparisonSessions: [],
  timelineSource: 'response'
};

// DOM Elements
const el = {
  screenSelector: document.getElementById('screen-selector'),
  screenDashboard: document.getElementById('screen-dashboard'),
  dirSearch: document.getElementById('dir-search'),
  btnImportHar: document.getElementById('btn-import-har'),
  harFileInput: document.getElementById('har-file-input'),
  sessionList: document.getElementById('session-list'),
  sessionPagination: document.getElementById('session-pagination'),
  
  btnBack: document.getElementById('btn-back'),
  activeSessionName: document.getElementById('active-session-name'),
  topPayloadSearch: document.getElementById('top-payload-search'),
  btnDownloadSessionHar: document.getElementById('btn-download-session-har'),
  
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
  btnDownloadHar: document.getElementById('btn-download-har'),
  
  // Content blocks
  sectionState: document.getElementById('section-state'),
  stateJsonContent: document.getElementById('state-json-content'),
  sectionTimeline: document.getElementById('section-timeline'),
  timelineStepsList: document.getElementById('timeline-steps-list'),
  timelineTitle: document.getElementById('timeline-title'),
  timelineToggleContainer: document.getElementById('timeline-toggle-container'),
  btnTimelineResponse: document.getElementById('btn-timeline-response'),
  btnTimelineRequests: document.getElementById('btn-timeline-requests'),
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
window.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  
  // Handle browser back/forward buttons via popstate
  window.addEventListener('popstate', () => {
    syncStateFromURL();
  });
  
  // Synchronize state with URL parameters (handles initial load / direct links)
  await syncStateFromURL(true);
  
  // Load workspaces and sessions in the background
  await loadApps();
});

function initEventListeners() {
  // Theme toggler buttons
  document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    });
  });

  // Screen 1: Search Directories & Clean All
  el.dirSearch.addEventListener('input', () => {
    state.visibleItemsCount = 20;
    updateUrlParam('sessionSearch', el.dirSearch.value.trim(), false);
    renderSessions();
  });
  if (el.btnCleanAll) {
    el.btnCleanAll.addEventListener('click', cleanAllSessions);
  }

  if (el.btnImportHar) {
    el.btnImportHar.addEventListener('click', () => {
      el.harFileInput.click();
    });
  }
  if (el.harFileInput) {
    el.harFileInput.addEventListener('change', handleImportHar);
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
  el.topPayloadSearch.addEventListener('input', () => {
    applyTopPayloadSearch({ updateUrl: true });
  });
  
  // Download HAR
  if (el.btnDownloadHar) {
    el.btnDownloadHar.addEventListener('click', handleDownloadHar);
  }

  // Download Session HAR
  if (el.btnDownloadSessionHar) {
    el.btnDownloadSessionHar.addEventListener('click', handleDownloadSessionHar);
  }
  
  // Workspace Manager: Submit new app
  if (el.addAppForm) {
    el.addAppForm.addEventListener('submit', handleAddApp);
  }

  // View Mode Toggle Button
  const btnToggleViewMode = document.getElementById('btn-toggle-view-mode');
  if (btnToggleViewMode) {
    btnToggleViewMode.addEventListener('click', toggleViewMode);
  }

  // Timeline Toggles
  if (el.timelineToggleContainer) {
    el.timelineToggleContainer.addEventListener('click', (e) => e.stopPropagation());
  }
  if (el.btnTimelineResponse) {
    el.btnTimelineResponse.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.timelineSource !== 'response') {
        state.timelineSource = 'response';
        if (el.btnTimelineRequests) el.btnTimelineRequests.classList.remove('active');
        if (el.btnTimelineResponse) el.btnTimelineResponse.classList.add('active');
        renderInspector();
      }
    });
  }
  if (el.btnTimelineRequests) {
    el.btnTimelineRequests.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.timelineSource !== 'requests') {
        state.timelineSource = 'requests';
        if (el.btnTimelineResponse) el.btnTimelineResponse.classList.remove('active');
        if (el.btnTimelineRequests) el.btnTimelineRequests.classList.add('active');
        renderInspector();
      }
    });
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

  // Comparison Tray Event Listeners
  const btnClearComp = document.getElementById('btn-clear-comparison');
  if (btnClearComp) {
    btnClearComp.addEventListener('click', () => {
      state.comparisonSessions = [];
      updateComparisonTray();
      renderSessions();
    });
  }

  const btnCompareNow = document.getElementById('btn-compare-now');
  if (btnCompareNow) {
    btnCompareNow.addEventListener('click', () => {
      startComparison();
    });
  }

  const btnCompareBack = document.getElementById('btn-compare-back');
  if (btnCompareBack) {
    btnCompareBack.addEventListener('click', () => {
      // Clear URL params for comparison
      updateUrlParams({
        compare: '',
        sessionA: '',
        workspaceA: '',
        sessionB: '',
        workspaceB: ''
      }, true);
      
      // Hide comparison screen
      document.getElementById('screen-comparison').classList.remove('active');
      el.screenSelector.classList.add('active');
      
      syncStateFromURL();
    });
  }

  // Diff Tab switching listeners
  document.querySelectorAll('.diff-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.diff-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderSelectedDiff();
    });
  });

  initSettingsModal();
  initStateInfoDiffModal();
  initExclusionsModal();
  updateExclusionsBadge();
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
    updateActiveSessionHeader();
    updateCompareHeader();
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

function getWorkspaceDisplayName(path) {
  if (!path) return '';
  const apps = [...state.apps];
  if (path && !apps.includes(path)) {
    apps.push(path);
  }
  const uniqueNames = getUniqueWorkspaceNames(apps);
  return uniqueNames[path] || path.split('/').filter(Boolean).pop() || path;
}

function updateActiveSessionHeader() {
  if (!state.selectedSession) return;
  const folderName = state.selectedSession;
  const activeApp = state.activeApp;
  const activeWsName = getWorkspaceDisplayName(activeApp);
  
  if (el.activeSessionName) {
    el.activeSessionName.innerHTML = `
      <span class="session-workspace-badge" title="${activeApp}">${activeWsName}</span>
      <span class="session-header-separator">/</span>
      <span class="session-folder-name" title="${folderName}">${folderName}</span>
    `;
  }
}

function updateCompareHeader() {
  if (!state.comparisonData) return;
  const { sessionA, workspaceA, sessionB, workspaceB } = state.comparisonData;
  const wsAName = getWorkspaceDisplayName(workspaceA);
  const wsBName = getWorkspaceDisplayName(workspaceB);
  
  const titleEl = document.getElementById('compare-sessions-title');
  if (titleEl) {
    titleEl.innerHTML = `
      <div class="compare-session-column">
        <span class="session-workspace-badge" title="${workspaceA}">${wsAName}</span>
        <span class="session-header-separator">/</span>
        <span class="session-folder-name" title="${sessionA}">${sessionA}</span>
      </div>
      <span class="compare-vs">vs</span>
      <div class="compare-session-column">
        <span class="session-workspace-badge" title="${workspaceB}">${wsBName}</span>
        <span class="session-header-separator">/</span>
        <span class="session-folder-name" title="${sessionB}">${sessionB}</span>
      </div>
    `;
  }
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
    const match = s.name.match(/^(?:(.*)-)?network-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/);
    if (match) {
      const dataset = match[1];
      const year = match[2];
      const monthStr = match[3];
      const dayStr = match[4];
      const hour = match[5];
      const minute = match[6];
      const second = match[7];
      
      const mIdx = parseInt(monthStr, 10) - 1;
      const monthName = monthNames[mIdx] || monthStr;
      const day = parseInt(dayStr, 10);
      
      const timeDisplay = dataset 
        ? `[${dataset}] ${hour}:${minute}:${second}`
        : `${hour}:${minute}:${second}`;
      
      return {
        session: s,
        isStandard: true,
        dateKey: `${monthStr}-${dayStr}`, // For sorting (e.g. "07-09")
        dateDisplay: `${monthName} ${day}`,
        timeDisplay: timeDisplay,
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
        
        const isCompSelected = (state.comparisonSessions || []).some(
          c => c.workspacePath === state.activeApp && c.sessionName === s.name
        );
        const isMaxReached = (state.comparisonSessions || []).length >= 2;
        const isDisabled = isMaxReached && !isCompSelected;

        return `
          <div class="session-item" data-name="${s.name}">
            <div class="checkbox-cell" onclick="event.stopPropagation();">
              <input type="checkbox" class="comp-checkbox" data-name="${s.name}" 
                ${isCompSelected ? 'checked' : ''} 
                ${isDisabled ? 'disabled' : ''}
                title="${isDisabled ? 'Max 2 sessions can be selected' : 'Add to compare'}" />
            </div>
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

  // Attach checkbox handlers
  el.sessionList.querySelectorAll('.comp-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const name = cb.getAttribute('data-name');
      if (cb.checked) {
        if ((state.comparisonSessions || []).length < 2) {
          state.comparisonSessions.push({
            workspacePath: state.activeApp,
            sessionName: name
          });
        } else {
          cb.checked = false; // rollback
        }
      } else {
        state.comparisonSessions = (state.comparisonSessions || []).filter(
          c => !(c.workspacePath === state.activeApp && c.sessionName === name)
        );
      }
      updateComparisonTray();
      renderSessions();
    });
  });
}

function showSessionSelector() {
  state.viewMode = 'standard';
  const searchBar = document.querySelector('.payload-search-filter-bar');
  const standardBody = document.querySelector('.dashboard-body');
  const timelineBody = document.getElementById('timeline-view-body');
  if (searchBar) searchBar.style.display = 'flex';
  if (standardBody) standardBody.style.display = 'flex';
  if (timelineBody) timelineBody.style.display = 'none';
  const viewModeBtn = document.getElementById('btn-toggle-view-mode');
  if (viewModeBtn) {
    viewModeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px; flex-shrink:0;">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      <span>Timeline View</span>
    `;
  }

  updateUrlParams({
    session: '',
    apiSearch: '',
    apiId: ''
  }, true);
  syncStateFromURL();
}

// --- URL STATE MANAGEMENT ---

function updateUrlParam(name, value, pushHistory = false) {
  const params = new URLSearchParams(window.location.search);
  if (value !== null && value !== undefined && value !== '') {
    params.set(name, value);
  } else {
    params.delete(name);
  }
  
  const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
  if (pushHistory) {
    window.history.pushState(null, '', newUrl);
  } else {
    window.history.replaceState(null, '', newUrl);
  }
}

function updateUrlParams(updates, pushHistory = false) {
  const params = new URLSearchParams(window.location.search);
  for (const [name, value] of Object.entries(updates)) {
    if (value !== null && value !== undefined && value !== '') {
      params.set(name, value);
    } else {
      params.delete(name);
    }
  }
  const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
  if (pushHistory) {
    window.history.pushState(null, '', newUrl);
  } else {
    window.history.replaceState(null, '', newUrl);
  }
}

async function syncStateFromURL(isInitial = false) {
  const params = new URLSearchParams(window.location.search);
  const sessionParam = params.get('session');
  const sessionSearchParam = params.get('sessionSearch') || '';
  const apiSearchParam = params.get('apiSearch') || '';
  const apiIdParam = params.get('apiId');
  const compareParam = params.get('compare') === 'true';

  // Sync directory search input
  if (el.dirSearch && el.dirSearch.value !== sessionSearchParam) {
    el.dirSearch.value = sessionSearchParam;
  }

  if (compareParam) {
    const sessionA = params.get('sessionA');
    const workspaceA = params.get('workspaceA');
    const sessionB = params.get('sessionB');
    const workspaceB = params.get('workspaceB');

    // Switch to comparison view
    el.screenSelector.classList.remove('active');
    el.screenDashboard.classList.remove('active');
    document.getElementById('screen-comparison').classList.add('active');

    // Hide floating tray if active
    const tray = document.getElementById('comparison-tray');
    if (tray) tray.classList.remove('visible');

    // Trigger alignment if not already done
    if (!state.comparisonData || 
        state.comparisonData.sessionA !== sessionA || 
        state.comparisonData.sessionB !== sessionB) {
      await loadAndCompare(sessionA, workspaceA, sessionB, workspaceB);
    }
    return;
  }

  // Deactivate comparison screen if returning
  const compareScreen = document.getElementById('screen-comparison');
  if (compareScreen) compareScreen.classList.remove('active');

  if (sessionParam) {
    if (state.selectedSession !== sessionParam) {
      await selectSession(sessionParam, { updateUrl: false });
    } else {
      // Session is already selected, just sync search and apiId
      if (el.topPayloadSearch.value !== apiSearchParam) {
        el.topPayloadSearch.value = apiSearchParam;
        applyTopPayloadSearch({ updateUrl: false });
      }
      
      const targetApiId = apiIdParam ? parseInt(apiIdParam, 10) : null;
      if (state.selectedApiId !== targetApiId) {
        if (targetApiId !== null) {
          selectApi(targetApiId, false);
        } else {
          state.selectedApiId = null;
          el.inspectorActive.style.display = 'none';
          el.inspectorEmpty.style.display = 'flex';
        }
      }
    }
  } else {
    // No session selected
    if (state.selectedSession !== null) {
      state.selectedSession = null;
      state.apis = [];
      state.bodies = {};
      state.selectedApiId = null;
      
      el.screenDashboard.classList.remove('active');
      el.screenSelector.classList.add('active');
    }
    renderSessions();
    updateComparisonTray(); // Restore comparison tray if items are staged
  }
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

async function handleImportHar(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const text = event.target.result;
      const harData = JSON.parse(text);

      if (!harData.log || !Array.isArray(harData.log.entries)) {
        alert('Invalid HAR file: Missing log entries');
        return;
      }

      // Show loading state in session list
      el.sessionList.innerHTML = `
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Parsing and importing HAR session...</p>
        </div>
      `;

      const response = await fetch('/api/logs/import-har', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filename: file.name,
          harData
        })
      });

      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (jsonErr) {
        console.error('Failed to parse response as JSON:', responseText);
        alert(`Server error (${response.status}): ${responseText.slice(0, 300)}`);
        loadSessions();
        return;
      }

      if (response.ok && result.success) {
        el.harFileInput.value = '';
        await loadSessions();
        
        // Enter the newly imported session
        const session = state.sessions.find(s => s.name === result.sessionName);
        if (session) {
          selectSession(session.name);
        } else {
          renderSessions();
        }
      } else {
        alert('Failed to import HAR: ' + (result.error || 'Unknown error'));
        loadSessions();
      }
    } catch (err) {
      alert('Error parsing HAR file: ' + err.message);
      loadSessions();
    }
  };
  reader.readAsText(file);
}

// --- SCREEN 2 & 3: DASHBOARD ---

async function selectSession(folderName, options = {}) {
  const updateUrl = options.updateUrl !== false;
  
  if (updateUrl) {
    updateUrlParams({
      session: folderName,
      apiSearch: '',
      apiId: ''
    }, true);
  }
  
  state.selectedSession = folderName;
  
  // Reset View Mode to Standard on session load
  state.viewMode = 'standard';
  const searchBar = document.querySelector('.payload-search-filter-bar');
  const standardBody = document.querySelector('.dashboard-body');
  const timelineBody = document.getElementById('timeline-view-body');
  if (searchBar) searchBar.style.display = 'flex';
  if (standardBody) standardBody.style.display = 'flex';
  if (timelineBody) timelineBody.style.display = 'none';
  const viewModeBtn = document.getElementById('btn-toggle-view-mode');
  if (viewModeBtn) {
    viewModeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px; flex-shrink:0;">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      <span>Timeline View</span>
    `;
  }

  updateActiveSessionHeader();
  
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
    
    // Check URL parameters to see if we should restore search and selection
    const params = new URLSearchParams(window.location.search);
    const apiSearchVal = params.get('apiSearch') || '';
    const apiIdVal = params.get('apiId');
    
    el.topPayloadSearch.value = apiSearchVal;
    applyTopPayloadSearch({ updateUrl: false });
    
    if (apiIdVal) {
      const apiId = parseInt(apiIdVal, 10);
      selectApi(apiId, false);
    } else {
      state.selectedApiId = null;
      el.inspectorActive.style.display = 'none';
      el.inspectorEmpty.style.display = 'flex';
    }
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

// Helper: get state name for journeydropoffupdate.json (sent in request)
function getUpdateApiState(id) {
  const payload = state.bodies[id];
  if (!payload || !payload.req) return null;
  const info = payload.req.RequestPayload?.formData?.journeyStateInfo?.[0];
  return info ? info.state : null;
}

// Helper: get states list for journeydropoffparam.json (received in response)
function getParamApiStates(id) {
  const payload = state.bodies[id];
  if (!payload || !payload.res) return [];
  const infoList = payload.res.formData?.journeyStateInfo || [];
  return infoList.map(item => item.state).filter(Boolean);
}

// Helper: get state name from request payload (from any journey dropoff/update request)
function getRequestState(id) {
  const payload = state.bodies[id];
  if (!payload || !payload.req) return null;
  const info = payload.req.RequestPayload?.formData?.journeyStateInfo?.[0] || 
               payload.req.formData?.journeyStateInfo?.[0] || 
               payload.req.journeyStateInfo?.[0];
  return info ? info.state : null;
}

// Helper: get all requests in chronological order that sent a state
function getRequestProgressionStates() {
  const list = [];
  const sortedApis = [...state.apis].sort((a, b) => a.id - b.id);
  for (const api of sortedApis) {
    const stateVal = getRequestState(api.id);
    if (stateVal) {
      list.push({
        apiId: api.id,
        state: stateVal,
        path: api.path,
        timing: state.bodies[api.id]?.timing || state.bodies[api.id]?.req?.timing
      });
    }
  }
  return list;
}

// Helper: get parsed stateInfo object from request payload
function getRequestStateInfo(id) {
  const payload = state.bodies[id];
  if (!payload || !payload.req) return null;
  const info = payload.req.RequestPayload?.formData?.journeyStateInfo?.[0] || 
               payload.req.formData?.journeyStateInfo?.[0] || 
               payload.req.journeyStateInfo?.[0];
  if (!info || !info.stateInfo) return null;
  
  if (typeof info.stateInfo === 'string') {
    try {
      return JSON.parse(info.stateInfo);
    } catch (e) {
      return info.stateInfo;
    }
  }
  return info.stateInfo;
}

// Helper: get preceding request containing a valid stateInfo object
function getPreviousRequestStateInfo(currentId) {
  const sortedApis = [...state.apis].sort((a, b) => a.id - b.id);
  const currentIndex = sortedApis.findIndex(a => a.id === currentId);
  if (currentIndex <= 0) return null;
  
  for (let i = currentIndex - 1; i >= 0; i--) {
    const prevApi = sortedApis[i];
    const prevInfo = getRequestStateInfo(prevApi.id);
    if (prevInfo) {
      return {
        apiId: prevApi.id,
        stateName: getRequestState(prevApi.id),
        stateInfo: prevInfo
      };
    }
  }
  return null;
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
    
    let stateLabel = '';
    if (api.path.includes('journeydropoffupdate.json')) {
      const updateState = getUpdateApiState(api.id);
      if (updateState) {
        stateLabel = `<span class="state-badge update-state-badge" title="${updateState}">${updateState}</span>`;
      } else {
        stateLabel = isStateCall ? `<span class="state-badge">State</span>` : '';
      }
    } else if (api.path.includes('journeydropoffparam.json')) {
      const paramStates = getParamApiStates(api.id);
      if (paramStates.length > 0) {
        stateLabel = `<span class="state-badge param-state-badge" title="${paramStates.join(', ')}">${paramStates.length} States</span>`;
      } else {
        stateLabel = isStateCall ? `<span class="state-badge">State</span>` : '';
      }
    } else {
      stateLabel = isStateCall ? `<span class="state-badge">State</span>` : '';
    }
    
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

function selectApi(id, updateUrl = true) {
  if (updateUrl) {
    updateUrlParam('apiId', id, true);
  }
  
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
  
  // We no longer show the old raw wizard state section (wizard state info is not required)
  el.sectionState.style.display = 'none';
  el.stateJsonContent.innerHTML = '';
  el.stateJsonContent.dataset.raw = '';

  // Handle stateInfo Diff button visibility and click logic
  const currentInfo = getRequestStateInfo(api.id);
  const prevData = getPreviousRequestStateInfo(api.id);
  const btnDiffStateInfo = document.getElementById('btn-diff-stateinfo');
  if (btnDiffStateInfo) {
    if (currentInfo) {
      btnDiffStateInfo.style.display = 'inline-block';
      if (prevData) {
        btnDiffStateInfo.title = `Compare stateInfo changes with previous state (${prevData.stateName || 'No State'} in API #${prevData.apiId})`;
        btnDiffStateInfo.onclick = (e) => {
          e.stopPropagation();
          openStateInfoDiffModal(prevData.stateInfo, currentInfo, prevData.apiId, api.id, prevData.stateName, getRequestState(api.id));
        };
      } else {
        btnDiffStateInfo.title = `Compare stateInfo changes (initial state)`;
        btnDiffStateInfo.onclick = (e) => {
          e.stopPropagation();
          openStateInfoDiffModal({}, currentInfo, 'Initial', api.id, 'Empty State', getRequestState(api.id));
        };
      }
    } else {
      btnDiffStateInfo.style.display = 'none';
    }
  }

  // Render Timeline/Stepper for journey states
  const isStateCall = api.path.includes('journeydropoffparam.json') || 
                      api.path.includes('journeydropoffupdate.json') || 
                      api.path.includes('journeydropoff.json');

  if (isStateCall) {
    el.sectionTimeline.style.display = 'block';
    el.sectionTimeline.classList.remove('collapsed');
    
    // Toggle container is only visible if the api path is journeydropoffparam.json
    const isParamCall = api.path.includes('journeydropoffparam.json');
    if (el.timelineToggleContainer) {
      el.timelineToggleContainer.style.display = isParamCall ? 'flex' : 'none';
    }
    
    // Decide active timeline source
    const activeSource = isParamCall ? state.timelineSource : 'requests';
    
    if (activeSource === 'response') {
      if (el.timelineTitle) el.timelineTitle.innerText = 'Journey States Timeline (Response)';
      if (el.btnTimelineResponse) el.btnTimelineResponse.classList.add('active');
      if (el.btnTimelineRequests) el.btnTimelineRequests.classList.remove('active');
      
      const paramStates = getParamApiStates(api.id); // array of state strings
      const journeyStateInfo = bodies.res?.formData?.journeyStateInfo || [];
      
      if (paramStates.length > 0) {
        el.timelineStepsList.innerHTML = paramStates.map((stateName, index) => {
          const stepNum = index + 1;
          let timeLabel = '';
          const item = journeyStateInfo[index];
          if (item && item.timeinfo) {
            try {
              const date = new Date(item.timeinfo);
              timeLabel = date.toTimeString().split(' ')[0];
            } catch(e) {
              timeLabel = '';
            }
          }
          return `
            <div class="timeline-step" data-index="${index}" title="${stateName}">
              <div class="timeline-step-node">${stepNum}</div>
              <div class="timeline-step-label">${stateName}</div>
              ${timeLabel ? `<div class="timeline-step-time">${timeLabel}</div>` : ''}
            </div>
          `;
        }).join('');
        
        // Add click handlers to each step to expand only that state in the response/request payloads
        el.timelineStepsList.querySelectorAll('.timeline-step').forEach(stepEl => {
          stepEl.addEventListener('click', () => {
            // Remove active class from all other steps, add to this one
            el.timelineStepsList.querySelectorAll('.timeline-step').forEach(s => s.classList.remove('active'));
            stepEl.classList.add('active');
            
            const index = parseInt(stepEl.getAttribute('data-index'), 10);
            
            // Expand state in both request and response payload JSON trees if found
            expandStateNodeAtIndex(el.reqJsonContent, index);
            expandStateNodeAtIndex(el.resJsonContent, index);
          });
        });
      } else {
        el.timelineStepsList.innerHTML = `<div class="empty-state" style="padding: 10px; text-align: center;"><p>No states returned in response.</p></div>`;
      }
    } else {
      // 'requests' mode: Progression of states sent in request payloads across the session
      if (el.timelineTitle) el.timelineTitle.innerText = 'Journey States Timeline (Request Progression)';
      if (el.btnTimelineResponse) el.btnTimelineResponse.classList.remove('active');
      if (el.btnTimelineRequests) el.btnTimelineRequests.classList.add('active');
      
      const reqProgression = getRequestProgressionStates(); // array of { apiId, state, timing }
      
      if (reqProgression.length > 0) {
        el.timelineStepsList.innerHTML = reqProgression.map((item, index) => {
          const stepNum = index + 1;
          let timeLabel = '';
          const sentAt = item.timing?.sentAt;
          if (sentAt) {
            try {
              const date = new Date(sentAt);
              timeLabel = date.toTimeString().split(' ')[0];
            } catch(e) {
              timeLabel = '';
            }
          }
          
          // Highlight active step if this step corresponds to the currently selected API!
          const isActiveApi = item.apiId === api.id;
          const activeClass = isActiveApi ? 'active' : '';
          
          return `
            <div class="timeline-step ${activeClass}" data-api-id="${item.apiId}" data-index="${index}" title="${item.state} (API #${item.apiId})">
              <div class="timeline-step-node">${stepNum}</div>
              <div class="timeline-step-label">${item.state}</div>
              <div class="timeline-step-time">API #${item.apiId}${timeLabel ? ` - ${timeLabel}` : ''}</div>
            </div>
          `;
        }).join('');
        
        // Add click handlers: Clicking a step selects that API transaction!
        el.timelineStepsList.querySelectorAll('.timeline-step').forEach(stepEl => {
          stepEl.addEventListener('click', () => {
            const stepApiId = parseInt(stepEl.getAttribute('data-api-id'), 10);
            if (stepApiId && stepApiId !== api.id) {
              selectApi(stepApiId);
            }
          });
        });
      } else {
        el.timelineStepsList.innerHTML = `<div class="empty-state" style="padding: 10px; text-align: center;"><p>No states sent in request payloads.</p></div>`;
      }
    }
  } else {
    el.sectionTimeline.style.display = 'none';
    el.timelineStepsList.innerHTML = '';
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

// Helper: Find the journeyStateInfo node and expand only the target state index, collapse others
function expandStateNodeAtIndex(containerEl, index) {
  if (!containerEl) return;
  const keySpans = Array.from(containerEl.querySelectorAll('.json-key'));
  const stateInfoKeySpan = keySpans.find(span => span.textContent.includes('journeyStateInfo'));
  if (!stateInfoKeySpan) return;

  const stateInfoNode = stateInfoKeySpan.parentElement;
  if (!stateInfoNode) return;

  stateInfoNode.classList.remove('collapsed');

  const childrenContainer = stateInfoNode.querySelector(':scope > .json-children');
  if (!childrenContainer) return;

  const childNodes = Array.from(childrenContainer.children).filter(node => node.classList.contains('json-node'));

  childNodes.forEach((childNode, idx) => {
    if (idx === index) {
      childNode.classList.remove('collapsed');
      
      // Expand parents
      let parent = childNode.parentElement;
      while (parent && parent !== containerEl) {
        if (parent.classList.contains('json-collapsible')) {
          parent.classList.remove('collapsed');
        }
        parent = parent.parentElement;
      }
      
      // Scroll and Highlight
      setTimeout(() => {
        childNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        childNode.classList.add('highlight-flash');
        setTimeout(() => {
          childNode.classList.remove('highlight-flash');
        }, 1800);
      }, 50);
    } else {
      childNode.classList.add('collapsed');
    }
  });
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

// --- TOP LEVEL PAYLOAD FILTER ---

function getApiExclusions() {
  const stored = localStorage.getItem('apiExclusions');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {}
  }
  return [
    { id: 'ex-options', enabled: true, name: 'Exclude OPTIONS calls', method: 'OPTIONS', pattern: '' },
    { id: 'ex-assets', enabled: true, name: 'Exclude Static Assets (.js, .css, .svg, etc.)', method: 'ANY', pattern: '\\.(js|css|svg|png|gif|ico|woff2?)$' }
  ];
}

function saveApiExclusions(rules) {
  localStorage.setItem('apiExclusions', JSON.stringify(rules));
}

function getNonExcludedApis() {
  const rules = getApiExclusions().filter(r => r.enabled);
  if (rules.length === 0) {
    return state.apis;
  }
  
  return state.apis.filter(api => {
    const matchesAny = rules.some(rule => {
      const methodMatch = (rule.method === 'ANY' || (api.method && api.method.toUpperCase() === rule.method.toUpperCase()));
      if (!methodMatch) return false;
      
      if (!rule.pattern) {
        return true;
      }
      
      try {
        const regex = new RegExp(rule.pattern, 'i');
        return regex.test(api.path);
      } catch (err) {
        return false;
      }
    });
    
    return !matchesAny;
  });
}

function updateDashboardStats(nonExcludedApis) {
  const successCount = nonExcludedApis.filter(a => a.status >= 200 && a.status < 300).length;
  const errorCount = nonExcludedApis.length - successCount;
  if (el.stat200) el.stat200.innerText = successCount;
  if (el.stat500) el.stat500.innerText = errorCount;
}

function updateExclusionsBadge() {
  const rules = getApiExclusions();
  const activeCount = rules.filter(r => r.enabled).length;
  const badge = document.getElementById('active-exclusions-badge');
  if (badge) {
    badge.innerText = activeCount;
    if (activeCount === 0) {
      badge.classList.add('zero');
    } else {
      badge.classList.remove('zero');
    }
  }
}

function renderExclusionsList() {
  const container = document.getElementById('exclusions-list-container');
  if (!container) return;
  
  const rules = getApiExclusions();
  if (rules.length === 0) {
    container.innerHTML = `<span style="color: var(--text-muted); font-size: 13px; font-style: italic;">No exclusion filters configured.</span>`;
    return;
  }
  
  container.innerHTML = rules.map(rule => {
    return `
      <div class="exclusion-rule-item">
        <div style="display: flex; align-items: center; gap: 8px; flex-grow: 1; min-width: 0;">
          <input type="checkbox" class="exclusion-checkbox" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''} style="cursor: pointer; width: 14px; height: 14px; flex-shrink: 0;" />
          <span style="font-family: var(--font-mono); font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background-color: var(--overlay-medium); color: var(--text-bright); flex-shrink: 0;">${rule.method}</span>
          <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-main); word-break: break-all; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-grow: 1;" title="${escapeHtml(rule.pattern || '(any path)')}">${escapeHtml(rule.pattern || '(any path)')}</span>
        </div>
        <button type="button" class="btn-remove-exclusion" data-id="${rule.id}" title="Remove rule" style="flex-shrink: 0;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
  }).join('');
  
  // Attach checkbox toggle handlers
  container.querySelectorAll('.exclusion-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.getAttribute('data-id');
      const rules = getApiExclusions();
      const rule = rules.find(r => r.id === id);
      if (rule) {
        rule.enabled = cb.checked;
        saveApiExclusions(rules);
        updateExclusionsBadge();
      }
    });
  });
  
  // Attach remove rule handlers
  container.querySelectorAll('.btn-remove-exclusion').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      let rules = getApiExclusions();
      rules = rules.filter(r => r.id !== id);
      saveApiExclusions(rules);
      renderExclusionsList();
      updateExclusionsBadge();
    });
  });
}

function initExclusionsModal() {
  const btnExclusions = document.getElementById('btn-exclude-filters');
  const modal = document.getElementById('modal-exclusions');
  const btnClose = document.getElementById('btn-close-modal-exclusions');
  const btnApply = document.getElementById('btn-apply-exclusions');
  const btnReset = document.getElementById('btn-reset-exclusions');
  const formAdd = document.getElementById('form-add-exclusion');
  const inputMethod = document.getElementById('input-exclusion-method');
  const inputPattern = document.getElementById('input-exclusion-pattern');
  
  if (!btnExclusions || !modal) return;
  
  // Open modal
  btnExclusions.addEventListener('click', () => {
    renderExclusionsList();
    modal.style.display = 'flex';
  });
  
  // Close modal
  const closeModal = () => {
    modal.style.display = 'none';
  };
  
  btnClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Add rule form submit
  formAdd.addEventListener('submit', (e) => {
    e.preventDefault();
    const method = inputMethod.value;
    const pattern = inputPattern.value.trim();
    
    if (pattern) {
      // Validate regex pattern
      try {
        new RegExp(pattern);
      } catch (err) {
        alert('Invalid regex pattern: ' + err.message);
        return;
      }
      
      const rules = getApiExclusions();
      const newId = 'ex-' + Date.now();
      rules.push({
        id: newId,
        enabled: true,
        method: method,
        pattern: pattern
      });
      saveApiExclusions(rules);
      renderExclusionsList();
      updateExclusionsBadge();
      inputPattern.value = '';
    }
  });
  
  // Reset Defaults button
  btnReset.addEventListener('click', () => {
    localStorage.removeItem('apiExclusions');
    renderExclusionsList();
    updateExclusionsBadge();
  });
  
  // Apply button
  btnApply.addEventListener('click', () => {
    closeModal();
    applyTopPayloadSearch({ updateUrl: false });
  });
}

function applyTopPayloadSearch(options = {}) {
  const updateUrl = options.updateUrl !== false;
  const query = el.topPayloadSearch.value.trim();
  
  if (updateUrl) {
    updateUrlParam('apiSearch', query, false);
  }
  
  const queryLower = query.toLowerCase();
  
  // 1. Get non-excluded APIs
  const nonExcludedApis = getNonExcludedApis();
  
  // 2. Update stats and exclusions count
  updateDashboardStats(nonExcludedApis);
  updateExclusionsBadge();
  
  // 3. Auto-clear selected API if it is now excluded
  const selectedIsExcluded = state.selectedApiId !== null && !nonExcludedApis.some(api => api.id === state.selectedApiId);
  if (selectedIsExcluded) {
    state.selectedApiId = null;
    if (el.inspectorActive) el.inspectorActive.style.display = 'none';
    if (el.inspectorEmpty) el.inspectorEmpty.style.display = 'flex';
  }
  
  if (!queryLower) {
    renderApiList(nonExcludedApis);
    el.apiCount.innerText = `${nonExcludedApis.length} / ${nonExcludedApis.length}`;
    highlightActiveSelectionInList();
    return;
  }
  
  const filtered = nonExcludedApis.filter(api => {
    const bodies = state.bodies[api.id];
    
    const apiIdStr = (api.id !== undefined && api.id !== null) ? api.id.toString().toLowerCase() : '';
    const apiMethod = api.method ? api.method.toLowerCase() : '';
    const apiPath = api.path ? api.path.toLowerCase() : '';
    const apiStatus = (api.status !== undefined && api.status !== null) ? api.status.toString().toLowerCase() : '';
    const apiScenario = api.scenario ? api.scenario.toLowerCase() : '';

    if (apiIdStr.includes(queryLower) ||
        apiMethod.includes(queryLower) ||
        apiPath.includes(queryLower) ||
        apiStatus.includes(queryLower) ||
        apiScenario.includes(queryLower)) {
      return true;
    }

    if (!bodies) return false;
    
    // Convert payloads directly to lowercase strings
    const reqStr = bodies.req ? JSON.stringify(bodies.req).toLowerCase() : '';
    const resStr = bodies.res ? JSON.stringify(bodies.res).toLowerCase() : '';
    
    return reqStr.includes(queryLower) || resStr.includes(queryLower);
  });
  
  renderApiList(filtered);
  el.apiCount.innerText = `${filtered.length} / ${nonExcludedApis.length}`;
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
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
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
    if (key === 'journeyStateInfo' || key === 'stateInfo') {
      node.classList.add('collapsed');
    }
    
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

function handleDownloadHar() {
  const api = state.apis.find(a => a.id === state.selectedApiId);
  const bodies = state.bodies[state.selectedApiId];
  if (!api || !bodies) return;
  downloadHar(api, bodies);
}

function downloadHar(api, bodies) {
  if (!api || !bodies) return;

  const url = api.path.startsWith('http') 
    ? api.path 
    : `${window.location.protocol}//${window.location.host}${api.path}`;

  const reqBodyText = bodies.req ? JSON.stringify(bodies.req, null, 2) : '';
  const resBodyText = bodies.res ? JSON.stringify(bodies.res, null, 2) : '';

  const har = {
    log: {
      version: "1.2",
      creator: {
        name: "Wizard Log Explorer",
        version: "1.0.0"
      },
      entries: [
        {
          startedDateTime: new Date().toISOString(),
          time: 0,
          request: {
            method: api.method,
            url: url,
            httpVersion: "HTTP/1.1",
            headers: [
              { name: "Content-Type", value: "application/json" }
            ],
            queryString: [],
            cookies: [],
            headersSize: -1,
            bodySize: reqBodyText.length,
            postData: reqBodyText ? {
              mimeType: "application/json",
              text: reqBodyText
            } : undefined
          },
          response: {
            status: api.status,
            statusText: getStatusText(api.status),
            httpVersion: "HTTP/1.1",
            headers: [
              { name: "Content-Type", value: "application/json" }
            ],
            cookies: [],
            content: {
              size: resBodyText.length,
              mimeType: "application/json",
              text: resBodyText
            },
            redirectURL: "",
            headersSize: -1,
            bodySize: resBodyText.length
          },
          cache: {},
          timings: {
            send: 0,
            wait: 0,
            receive: 0
          }
        }
      ]
    }
  };

  const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  
  const pathClean = api.path.split('?')[0].replace(/[^a-zA-Z0-9]/g, '_');
  a.download = `api_${api.id}_${pathClean}.har`;
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

function getStatusText(status) {
  const statusTexts = {
    200: "OK",
    201: "Created",
    202: "Accepted",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found",
    304: "Not Modified",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable"
  };
  return statusTexts[status] || "Unknown";
}

function handleDownloadSessionHar() {
  if (!state.selectedSession || state.apis.length === 0) return;

  const entries = state.apis.map(api => {
    const bodies = state.bodies[api.id] || { req: null, res: null };
    const url = api.path.startsWith('http') 
      ? api.path 
      : `${window.location.protocol}//${window.location.host}${api.path}`;

    const reqBodyText = bodies.req ? JSON.stringify(bodies.req, null, 2) : '';
    const resBodyText = bodies.res ? JSON.stringify(bodies.res, null, 2) : '';

    return {
      startedDateTime: new Date().toISOString(),
      time: 0,
      request: {
        method: api.method,
        url: url,
        httpVersion: "HTTP/1.1",
        headers: [
          { name: "Content-Type", value: "application/json" }
        ],
        queryString: [],
        cookies: [],
        headersSize: -1,
        bodySize: reqBodyText.length,
        postData: reqBodyText ? {
          mimeType: "application/json",
          text: reqBodyText
        } : undefined
      },
      response: {
        status: api.status,
        statusText: getStatusText(api.status),
        httpVersion: "HTTP/1.1",
        headers: [
          { name: "Content-Type", value: "application/json" }
        ],
        cookies: [],
        content: {
          size: resBodyText.length,
          mimeType: "application/json",
          text: resBodyText
        },
        redirectURL: "",
        headersSize: -1,
        bodySize: resBodyText.length
      },
      cache: {},
      timings: {
        send: 0,
        wait: 0,
        receive: 0
      }
    };
  });

  const har = {
    log: {
      version: "1.2",
      creator: {
        name: "Wizard Log Explorer",
        version: "1.0.0"
      },
      entries: entries
    }
  };

  const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `session_${state.selectedSession}.har`;
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

// --- COMPARISON UTILITY FUNCTIONS ---

function updateComparisonTray() {
  const tray = document.getElementById('comparison-tray');
  const pillsContainer = document.getElementById('comparison-pills');
  const btnCompare = document.getElementById('btn-compare-now');
  const badge = document.getElementById('comparison-count-badge');
  
  if (!tray || !pillsContainer || !btnCompare || !badge) return;

  const count = (state.comparisonSessions || []).length;
  
  if (count > 0) {
    tray.classList.add('visible');
  } else {
    tray.classList.remove('visible');
  }

  // Render pills
  pillsContainer.innerHTML = state.comparisonSessions.map((c, index) => {
    const wsName = c.workspacePath.split('/').pop() || c.workspacePath;
    return `
      <div class="comp-pill" data-index="${index}">
        <span class="comp-pill-workspace">${wsName}</span>
        <span class="comp-pill-session" title="${c.sessionName}">${c.sessionName}</span>
        <button class="btn-remove-comp" data-index="${index}">&times;</button>
      </div>
    `;
  }).join('');

  // Attach pill remove handlers
  pillsContainer.querySelectorAll('.btn-remove-comp').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.getAttribute('data-index'), 10);
      state.comparisonSessions.splice(index, 1);
      updateComparisonTray();
      renderSessions();
    });
  });

  // Enable/disable compare button
  badge.textContent = `${count}/2`;
  if (count === 2) {
    btnCompare.disabled = false;
    btnCompare.classList.add('ready');
  } else {
    btnCompare.disabled = true;
    btnCompare.classList.remove('ready');
  }
}

function startComparison() {
  if (state.comparisonSessions.length !== 2) return;
  
  const [sessA, sessB] = state.comparisonSessions;
  
  updateUrlParams({
    compare: 'true',
    sessionA: sessA.sessionName,
    workspaceA: sessA.workspacePath,
    sessionB: sessB.sessionName,
    workspaceB: sessB.workspacePath
  }, true);
  
  syncStateFromURL();
}

async function loadAndCompare(sessionA, workspaceA, sessionB, workspaceB) {
  state.comparisonData = {
    sessionA,
    workspaceA,
    sessionB,
    workspaceB,
    alignedApis: [],
    selectedAlignedIndex: null
  };

  updateCompareHeader();
  
  const listEl = document.getElementById('compare-api-list');
  listEl.innerHTML = `
    <div class="loading-state" style="padding: 20px; text-align: center;">
      <div class="spinner"></div>
      <p>Loading sessions to compare...</p>
    </div>
  `;
  document.getElementById('compare-inspector-empty').style.display = 'flex';
  document.getElementById('compare-inspector-active').style.display = 'none';

  try {
    const [apisARes, bodiesARes, apisBRes, bodiesBRes] = await Promise.all([
      fetch(`/api/logs/${sessionA}/apis?workspace=${encodeURIComponent(workspaceA)}`),
      fetch(`/api/logs/${sessionA}/bodies?workspace=${encodeURIComponent(workspaceA)}`),
      fetch(`/api/logs/${sessionB}/apis?workspace=${encodeURIComponent(workspaceB)}`),
      fetch(`/api/logs/${sessionB}/bodies?workspace=${encodeURIComponent(workspaceB)}`)
    ]);

    if (!apisARes.ok || !bodiesARes.ok || !apisBRes.ok || !bodiesBRes.ok) {
      throw new Error('Failed to load session details from server');
    }

    const apisA = await apisARes.json();
    const rawBodiesA = await bodiesARes.json();
    const apisB = await apisBRes.json();
    const rawBodiesB = await bodiesBRes.json();

    const bodiesA = {};
    for (const [id, body] of Object.entries(rawBodiesA)) {
      bodiesA[id] = {
        req: parseStringifiedJSON(body.req),
        res: parseStringifiedJSON(body.res)
      };
    }

    const bodiesB = {};
    for (const [id, body] of Object.entries(rawBodiesB)) {
      bodiesB[id] = {
        req: parseStringifiedJSON(body.req),
        res: parseStringifiedJSON(body.res)
      };
    }

    state.comparisonData.apisA = apisA;
    state.comparisonData.bodiesA = bodiesA;
    state.comparisonData.apisB = apisB;
    state.comparisonData.bodiesB = bodiesB;

    // Run sequence alignment
    const strategy = getMatchingStrategy();
    const aligned = alignSequences(apisA, apisB, strategy);
    state.comparisonData.alignedApis = aligned;

    // Run deep payload comparison logic (taking ignored keys into account)
    runComparison();

  } catch (err) {
    console.error('Error during comparison:', err);
    listEl.innerHTML = `
      <div class="empty-state" style="padding: 20px; color: var(--error);">
        <p>Error running comparison: ${err.message}</p>
      </div>
    `;
  }
}

function alignSequences(seqA, seqB, strategy = 'strict') {
  // Annotate original indices to track chronological sequence positions
  seqA.forEach((item, index) => { item.originalIndex = index; });
  seqB.forEach((item, index) => { item.originalIndex = index; });

  if (strategy === 'strict') {
    const m = seqA.length;
    const n = seqB.length;
    
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const a = seqA[i - 1];
        const b = seqB[j - 1];
        
        if (a.method === b.method && a.path.split('?')[0] === b.path.split('?')[0]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    
    let i = m;
    let j = n;
    const alignment = [];
    
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && seqA[i - 1].method === seqB[j - 1].method && seqA[i - 1].path.split('?')[0] === seqB[j - 1].path.split('?')[0]) {
        alignment.unshift({
          type: 'match',
          left: seqA[i - 1],
          right: seqB[j - 1]
        });
        i--;
        j--;
      } else {
        if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
          alignment.unshift({
            type: 'added',
            left: null,
            right: seqB[j - 1]
          });
          j--;
        } else {
          alignment.unshift({
            type: 'deleted',
            left: seqA[i - 1],
            right: null
          });
          i--;
        }
      }
    }
    
    return alignment;
  } else {
    // strategy === 'flexible' (Out of order matching)
    const matchedB = new Set();
    const alignment = [];
    
    // Iterate over A, finding the closest match in B
    for (let i = 0; i < seqA.length; i++) {
      const a = seqA[i];
      const aPath = a.path.split('?')[0];
      
      let bestB = null;
      let minDistance = Infinity;
      
      for (let j = 0; j < seqB.length; j++) {
        if (matchedB.has(j)) continue;
        const b = seqB[j];
        if (a.method === b.method && aPath === b.path.split('?')[0]) {
          const dist = Math.abs(i - j);
          if (dist < minDistance) {
            minDistance = dist;
            bestB = j;
          }
        }
      }
      
      if (bestB !== null) {
        matchedB.add(bestB);
        alignment.push({
          type: 'match',
          left: a,
          right: seqB[bestB]
        });
      } else {
        alignment.push({
          type: 'deleted',
          left: a,
          right: null
        });
      }
    }
    
    // Add any unmatched elements in B
    for (let j = 0; j < seqB.length; j++) {
      if (!matchedB.has(j)) {
        alignment.push({
          type: 'added',
          left: null,
          right: seqB[j]
        });
      }
    }
    
    // Sort alignment primarily by the left item's originalIndex,
    // placing right-only (added) elements chronologically based on their originalIndex
    // relative to the matched/deleted items.
    const finalAlignment = [];
    const mainAlignment = alignment.filter(p => p.left !== null); // sorted by left originalIndex
    
    let bIdx = 0;
    mainAlignment.forEach(pair => {
      const pairBIdx = pair.right ? pair.right.originalIndex : -1;
      
      // Add any B items that occur before this matched item
      while (bIdx < seqB.length) {
        if (!matchedB.has(bIdx)) {
          finalAlignment.push({
            type: 'added',
            left: null,
            right: seqB[bIdx]
          });
        } else if (bIdx === pairBIdx) {
          bIdx++;
          break;
        }
        bIdx++;
      }
      finalAlignment.push(pair);
    });
    
    // Add remaining unmatched B items
    while (bIdx < seqB.length) {
      if (!matchedB.has(bIdx)) {
        finalAlignment.push({
          type: 'added',
          left: null,
          right: seqB[bIdx]
        });
      }
      bIdx++;
    }
    
    // Detect out of order among matched pairs
    const matchedPairs = finalAlignment.filter(p => p.left !== null && p.right !== null);
    matchedPairs.forEach(p => {
      const idxA = p.left.originalIndex;
      const idxB = p.right.originalIndex;
      
      const isCrossed = matchedPairs.some(q => {
        if (q === p) return false;
        const qIdxA = q.left.originalIndex;
        const qIdxB = q.right.originalIndex;
        
        return (qIdxA < idxA && qIdxB > idxB) || (qIdxA > idxA && qIdxB < idxB);
      });
      
      if (isCrossed) {
        p.outOfOrder = true;
      }
    });
    
    return finalAlignment;
  }
}

function renderAlignedList() {
  const listEl = document.getElementById('compare-api-list');
  const aligned = state.comparisonData.alignedApis;
  
  if (aligned.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state" style="padding: 20px;">
        <p>No transactions to compare.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = aligned.map((pair, index) => {
    let method = '';
    let path = '';
    let statusText = '';
    let statusClass = '';
    let indicatorChar = '';
    let indicatorClass = '';

    if (pair.type === 'match' || pair.type === 'changed') {
      method = pair.left.method;
      path = pair.left.path.split('?')[0].split('/').pop();
      statusText = pair.right.status;
      statusClass = pair.right.status >= 500 ? 'red' : (pair.right.status >= 400 ? 'orange' : 'green');
      
      if (pair.type === 'match') {
        indicatorChar = '=';
        indicatorClass = 'matched';
      } else {
        indicatorChar = '~';
        indicatorClass = 'changed';
      }
    } else if (pair.type === 'added') {
      method = pair.right.method;
      path = pair.right.path.split('?')[0].split('/').pop();
      statusText = pair.right.status;
      statusClass = pair.right.status >= 500 ? 'red' : (pair.right.status >= 400 ? 'orange' : 'green');
      indicatorChar = '+';
      indicatorClass = 'added';
    } else if (pair.type === 'deleted') {
      method = pair.left.method;
      path = pair.left.path.split('?')[0].split('/').pop();
      statusText = pair.left.status;
      statusClass = 'red';
      indicatorChar = '-';
      indicatorClass = 'deleted';
    }

    const isSelected = state.comparisonData.selectedAlignedIndex === index;
    const selectedClass = isSelected ? 'selected' : '';

    return `
      <div class="api-item ${selectedClass}" data-index="${index}">
        <div class="api-index-col" style="display: flex; align-items: center; justify-content: center;">
          <span class="compare-status-icon ${indicatorClass}">${indicatorChar}</span>
        </div>
        <div class="api-method-col method-${method}">${method}</div>
        <div class="api-path-col">
          <span>${path}</span>
          ${pair.outOfOrder ? `<span class="out-of-order-badge" title="Out of sequence order (Left: #${pair.left.originalIndex + 1} vs Right: #${pair.right.originalIndex + 1})">⇄ Out of Order</span>` : ''}
        </div>
        <div class="api-status-col">
          <span class="status-pill ${statusClass}">${statusText}</span>
        </div>
      </div>
    `;
  }).join('');

  // Attach event handlers
  listEl.querySelectorAll('.api-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.getAttribute('data-index'), 10);
      selectAlignedApi(index);
    });
  });
}

function selectAlignedApi(index) {
  state.comparisonData.selectedAlignedIndex = index;
  
  const listEl = document.getElementById('compare-api-list');
  listEl.querySelectorAll('.api-item').forEach((item, idx) => {
    if (idx === index) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });

  document.getElementById('compare-inspector-empty').style.display = 'none';
  document.getElementById('compare-inspector-active').style.display = 'flex';

  const pair = state.comparisonData.alignedApis[index];
  const mainCall = pair.right || pair.left;
  
  const methodBadge = document.getElementById('compare-inspect-method');
  methodBadge.textContent = mainCall.method;
  methodBadge.className = `badge method-${mainCall.method}`;

  document.getElementById('compare-inspect-path').textContent = mainCall.path;
  
  const sequenceEl = document.getElementById('compare-inspect-sequence');
  if (sequenceEl) {
    if (pair.outOfOrder) {
      sequenceEl.textContent = `⇄ Out of Order (Left: #${pair.left.originalIndex + 1} vs Right: #${pair.right.originalIndex + 1})`;
      sequenceEl.style.display = 'inline-flex';
    } else {
      sequenceEl.style.display = 'none';
    }
  }

  const statusBadge = document.getElementById('compare-inspect-status');
  statusBadge.textContent = pair.type.toUpperCase();
  if (pair.type === 'match') {
    statusBadge.className = 'status-pill green';
  } else if (pair.type === 'changed') {
    statusBadge.className = 'status-pill orange';
  } else {
    statusBadge.className = 'status-pill red';
  }

  // Update diff headers with specific session details
  document.getElementById('diff-header-left').textContent = `Left: ${state.comparisonData.sessionA}`;
  document.getElementById('diff-header-right').textContent = `Right: ${state.comparisonData.sessionB}`;

  // Calculate tab changes dynamically
  let reqSame = true;
  let resSame = true;
  let stateSame = true;

  if (pair.left && pair.right) {
    const bodyA = state.comparisonData.bodiesA[pair.left.id] || {};
    const bodyB = state.comparisonData.bodiesB[pair.right.id] || {};

    const reqA = removeIgnoredKeys(bodyA.req);
    const reqB = removeIgnoredKeys(bodyB.req);
    const resA = removeIgnoredKeys(bodyA.res);
    const resB = removeIgnoredKeys(bodyB.res);

    reqSame = JSON.stringify(reqA) === JSON.stringify(reqB);
    resSame = JSON.stringify(resA) === JSON.stringify(resB);

    const stateA = findStateInfo(reqA) || findStateInfo(resA);
    const stateB = findStateInfo(reqB) || findStateInfo(resB);
    stateSame = JSON.stringify(stateA) === JSON.stringify(stateB);
  } else {
    reqSame = false;
    resSame = false;
    stateSame = false;
  }

  const reqTab = document.querySelector('.diff-tab[data-tab="req"]');
  const resTab = document.querySelector('.diff-tab[data-tab="res"]');
  const stateTab = document.querySelector('.diff-tab[data-tab="state"]');

  if (reqTab) reqTab.classList.toggle('has-changes', !reqSame);
  if (resTab) resTab.classList.toggle('has-changes', !resSame);
  if (stateTab) stateTab.classList.toggle('has-changes', !stateSame);

  renderSelectedDiff();
}

function renderSelectedDiff() {
  const index = state.comparisonData.selectedAlignedIndex;
  if (index === null) return;

  const pair = state.comparisonData.alignedApis[index];
  const activeTab = document.querySelector('.diff-tab.active').getAttribute('data-tab');

  let leftJson = null;
  let rightJson = null;

  if (activeTab === 'req') {
    if (pair.left) {
      const body = state.comparisonData.bodiesA[pair.left.id];
      leftJson = body ? body.req : null;
    }
    if (pair.right) {
      const body = state.comparisonData.bodiesB[pair.right.id];
      rightJson = body ? body.req : null;
    }
  } else if (activeTab === 'res') {
    if (pair.left) {
      const body = state.comparisonData.bodiesA[pair.left.id];
      leftJson = body ? body.res : null;
    }
    if (pair.right) {
      const body = state.comparisonData.bodiesB[pair.right.id];
      rightJson = body ? body.res : null;
    }
  } else if (activeTab === 'state') {
    if (pair.left) {
      const body = state.comparisonData.bodiesA[pair.left.id];
      leftJson = body ? (findStateInfo(body.req) || findStateInfo(body.res)) : null;
    }
    if (pair.right) {
      const body = state.comparisonData.bodiesB[pair.right.id];
      rightJson = body ? (findStateInfo(body.req) || findStateInfo(body.res)) : null;
    }
  }

  const cleanLeft = leftJson ? removeIgnoredKeys(leftJson) : null;
  const cleanRight = rightJson ? removeIgnoredKeys(rightJson) : null;

  const strLeft = cleanLeft ? JSON.stringify(cleanLeft, null, 2) : '';
  const strRight = cleanRight ? JSON.stringify(cleanRight, null, 2) : '';

  const linesLeft = strLeft ? strLeft.split('\n') : [];
  const linesRight = strRight ? strRight.split('\n') : [];

  if (linesLeft.length === 0 && linesRight.length === 0) {
    document.getElementById('diff-code-left').innerHTML = '<div class="diff-line line-equal">No payload payload exists.</div>';
    document.getElementById('diff-code-right').innerHTML = '<div class="diff-line line-equal">No payload payload exists.</div>';
    return;
  }

  const diffResult = diffLines(linesLeft, linesRight);

  let htmlLeft = '';
  let htmlRight = '';

  diffResult.forEach(item => {
    if (item.type === 'equal') {
      htmlLeft += `<div class="diff-line line-equal">${escapeHtml(item.left)}</div>`;
      htmlRight += `<div class="diff-line line-equal">${escapeHtml(item.right)}</div>`;
    } else if (item.type === 'added') {
      htmlLeft += `<div class="diff-line line-empty">&nbsp;</div>`;
      htmlRight += `<div class="diff-line line-added">+ ${escapeHtml(item.right)}</div>`;
    } else if (item.type === 'deleted') {
      htmlLeft += `<div class="diff-line line-deleted">- ${escapeHtml(item.left)}</div>`;
      htmlRight += `<div class="diff-line line-empty">&nbsp;</div>`;
    }
  });

  document.getElementById('diff-code-left').innerHTML = htmlLeft;
  document.getElementById('diff-code-right').innerHTML = htmlRight;

  initSyncScroll();
}

// --- CONFIGURABLE IGNORE KEYS HELPERS & UI ---

function runComparison() {
  const { alignedApis, bodiesA, bodiesB } = state.comparisonData;
  if (!alignedApis || !bodiesA || !bodiesB) return;

  alignedApis.forEach(pair => {
    if (pair.left && pair.right) {
      const bodyA = bodiesA[pair.left.id] || {};
      const bodyB = bodiesB[pair.right.id] || {};
      
      const reqA = removeIgnoredKeys(bodyA.req);
      const reqB = removeIgnoredKeys(bodyB.req);
      const resA = removeIgnoredKeys(bodyA.res);
      const resB = removeIgnoredKeys(bodyB.res);

      const reqSame = JSON.stringify(reqA) === JSON.stringify(reqB);
      const resSame = JSON.stringify(resA) === JSON.stringify(resB);
      
      const stateA = findStateInfo(reqA) || findStateInfo(resA);
      const stateB = findStateInfo(reqB) || findStateInfo(resB);
      const stateSame = JSON.stringify(stateA) === JSON.stringify(stateB);

      if (!reqSame || !resSame || !stateSame || pair.left.status !== pair.right.status) {
        pair.type = 'changed';
      } else {
        pair.type = 'match';
      }
    }
  });

  // Render Aligned List
  renderAlignedList();
  
  // Update header stats
  updateCompareStats();

  // Re-select currently selected API (or 0 if none or out of bounds)
  let currentIndex = state.comparisonData.selectedAlignedIndex;
  if (currentIndex === null || currentIndex >= alignedApis.length) {
    currentIndex = alignedApis.length > 0 ? 0 : null;
  }
  if (currentIndex !== null) {
    selectAlignedApi(currentIndex);
  }
}

function removeIgnoredKeys(obj, regexes = null) {
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => removeIgnoredKeys(item, regexes));
  }
  
  if (typeof obj === 'object') {
    if (!regexes) {
      regexes = getIgnoredRegexes();
    }
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      const shouldIgnore = regexes.some(rx => rx.test(k));
      if (shouldIgnore) {
        continue;
      }
      result[k] = removeIgnoredKeys(v, regexes);
    }
    return result;
  }
  
  return obj;
}

function getIgnoredRegexes() {
  const keys = getIgnoredKeys();
  return keys.map(pattern => {
    try {
      return new RegExp(pattern, 'i');
    } catch (e) {
      console.warn(`Invalid regex pattern: ${pattern}`, e);
      // Fallback: escape special chars for exact match regex
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^${escaped}$`, 'i');
    }
  });
}

function initSettingsModal() {
  const btnSettings = document.getElementById('btn-compare-settings');
  const modal = document.getElementById('modal-settings');
  const btnClose = document.getElementById('btn-close-modal-settings');
  const btnApply = document.getElementById('btn-apply-settings');
  const btnReset = document.getElementById('btn-reset-defaults');
  const formAdd = document.getElementById('form-add-ignored-key');
  const inputKey = document.getElementById('input-ignored-key');

  if (!btnSettings || !modal) return;

  // Open modal
  btnSettings.addEventListener('click', () => {
    renderIgnoredKeysPills();
    
    // Set matching strategy radio check
    const currentStrategy = getMatchingStrategy();
    const radio = modal.querySelector(`input[name="matchingStrategy"][value="${currentStrategy}"]`);
    if (radio) {
      radio.checked = true;
    }
    
    modal.style.display = 'flex';
  });

  // Close modal
  const closeModal = () => {
    modal.style.display = 'none';
  };
  
  btnClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Form submit (Add key)
  formAdd.addEventListener('submit', (e) => {
    e.preventDefault();
    const newKey = inputKey.value.trim();
    if (newKey) {
      const keys = getIgnoredKeys();
      if (!keys.includes(newKey)) {
        keys.push(newKey);
        saveIgnoredKeys(keys);
        renderIgnoredKeysPills();
      }
      inputKey.value = '';
    }
  });

  // Preset buttons
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      const keys = getIgnoredKeys();
      if (!keys.includes(key)) {
        keys.push(key);
        saveIgnoredKeys(keys);
        renderIgnoredKeysPills();
      }
    });
  });

  // Reset defaults
  btnReset.addEventListener('click', () => {
    const defaults = ['timestamp', 'txnId', 'transactionId', 'sessionId', 'token', 'requestId', 'correlationId'];
    saveIgnoredKeys(defaults);
    renderIgnoredKeysPills();
    
    // Reset matching strategy
    saveMatchingStrategy('strict');
    const radio = modal.querySelector('input[name="matchingStrategy"][value="strict"]');
    if (radio) {
      radio.checked = true;
    }
  });

  // Apply Settings & Compare
  btnApply.addEventListener('click', () => {
    // Save matching strategy
    const selectedRadio = modal.querySelector('input[name="matchingStrategy"]:checked');
    if (selectedRadio) {
      saveMatchingStrategy(selectedRadio.value);
    }
    
    closeModal();
    // Re-run comparison logic on loaded data
    if (state.comparisonData && state.comparisonData.apisA) {
      const strategy = getMatchingStrategy();
      state.comparisonData.alignedApis = alignSequences(
        state.comparisonData.apisA,
        state.comparisonData.apisB,
        strategy
      );
      runComparison();
    }
  });
}

function initStateInfoDiffModal() {
  const modal = document.getElementById('modal-stateinfo-diff');
  const btnClose = document.getElementById('btn-close-modal-stateinfo-diff');
  if (!modal || !btnClose) return;
  
  const closeModal = () => {
    modal.style.display = 'none';
  };
  
  btnClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Setup scroll sync once
  const leftPane = document.getElementById('stateinfo-diff-container-left');
  const rightPane = document.getElementById('stateinfo-diff-container-right');
  if (leftPane && rightPane) {
    let activePane = null;
    leftPane.addEventListener('scroll', () => {
      if (activePane === 'left') rightPane.scrollTop = leftPane.scrollTop;
    });
    rightPane.addEventListener('scroll', () => {
      if (activePane === 'right') leftPane.scrollTop = rightPane.scrollTop;
    });
    leftPane.addEventListener('mouseenter', () => { activePane = 'left'; });
    rightPane.addEventListener('mouseenter', () => { activePane = 'right'; });
  }
}

function openStateInfoDiffModal(prevInfo, currentInfo, prevId, currentId, prevStateName, currentStateName) {
  const modal = document.getElementById('modal-stateinfo-diff');
  if (!modal) return;
  
  const prevTitle = `API #${prevId} (${prevStateName || 'No State'}) - stateInfo`;
  const currentTitle = `API #${currentId} (${currentStateName || 'No State'}) - stateInfo`;
  
  renderStateInfoDiff(prevInfo, currentInfo, prevTitle, currentTitle);
  
  modal.style.display = 'flex';
}

function renderStateInfoDiff(prevInfo, currentInfo, prevTitle, currentTitle) {
  const linesLeft = JSON.stringify(prevInfo, null, 2).split('\n');
  const linesRight = JSON.stringify(currentInfo, null, 2).split('\n');
  
  const diffResult = diffLines(linesLeft, linesRight);
  
  document.getElementById('stateinfo-diff-header-left').textContent = prevTitle;
  document.getElementById('stateinfo-diff-header-right').textContent = currentTitle;
  
  let htmlLeft = '';
  let htmlRight = '';
  
  diffResult.forEach(item => {
    if (item.type === 'equal') {
      htmlLeft += `<div class="diff-line line-equal">${escapeHtml(item.left)}</div>`;
      htmlRight += `<div class="diff-line line-equal">${escapeHtml(item.right)}</div>`;
    } else if (item.type === 'added') {
      htmlLeft += `<div class="diff-line line-empty">&nbsp;</div>`;
      htmlRight += `<div class="diff-line line-added">+ ${escapeHtml(item.right)}</div>`;
    } else if (item.type === 'deleted') {
      htmlLeft += `<div class="diff-line line-deleted">- ${escapeHtml(item.left)}</div>`;
      htmlRight += `<div class="diff-line line-empty">&nbsp;</div>`;
    }
  });
  
  document.getElementById('stateinfo-diff-code-left').innerHTML = htmlLeft;
  document.getElementById('stateinfo-diff-code-right').innerHTML = htmlRight;
}

function getMatchingStrategy() {
  return localStorage.getItem('matchingStrategy') || 'strict';
}

function saveMatchingStrategy(strategy) {
  localStorage.setItem('matchingStrategy', strategy);
}

function renderIgnoredKeysPills() {
  const container = document.getElementById('ignored-keys-container');
  if (!container) return;

  const keys = getIgnoredKeys();
  if (keys.length === 0) {
    container.innerHTML = `<span style="color: var(--text-muted); font-size: 13px; font-style: italic;">No keys ignored. Comparisons are strict.</span>`;
  } else {
    container.innerHTML = keys.map(key => `
      <span class="key-pill">
        <span>${escapeHtml(key)}</span>
        <button type="button" class="btn-remove-key" data-key="${escapeHtml(key)}" title="Remove ignore pattern">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </span>
    `).join('');

    // Attach remove handlers
    container.querySelectorAll('.btn-remove-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const keyToRemove = btn.getAttribute('data-key');
        let keys = getIgnoredKeys();
        keys = keys.filter(k => k !== keyToRemove);
        saveIgnoredKeys(keys);
        renderIgnoredKeysPills();
      });
    });
  }

  // Update presets buttons states
  document.querySelectorAll('.btn-preset').forEach(btn => {
    const key = btn.getAttribute('data-key');
    if (keys.includes(key)) {
      btn.classList.add('added-preset');
      btn.disabled = true;
    } else {
      btn.classList.remove('added-preset');
      btn.disabled = false;
    }
  });
}

// Helper to get ignore keys
function getIgnoredKeys() {
  const stored = localStorage.getItem('ignoredKeys');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      // fallback
    }
  }
  return ['timestamp', 'txnId', 'transactionId', 'sessionId', 'token', 'requestId', 'correlationId'];
}

// Helper to save ignore keys
function saveIgnoredKeys(keys) {
  localStorage.setItem('ignoredKeys', JSON.stringify(keys));
}

function diffLines(linesA, linesB) {
  const m = linesA.length;
  const n = linesB.length;
  
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  let i = m;
  let j = n;
  const diff = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      diff.unshift({
        type: 'equal',
        left: linesA[i - 1],
        right: linesB[j - 1]
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({
        type: 'added',
        left: '',
        right: linesB[j - 1]
      });
      j--;
    } else {
      diff.unshift({
        type: 'deleted',
        left: linesA[i - 1],
        right: ''
      });
      i--;
    }
  }
  
  return diff;
}

function initSyncScroll() {
  const leftPane = document.getElementById('diff-container-left');
  const rightPane = document.getElementById('diff-container-right');
  
  if (!leftPane || !rightPane) return;
  
  let activePane = null;
  
  const onScrollLeft = () => {
    if (activePane !== 'left') return;
    rightPane.scrollTop = leftPane.scrollTop;
    rightPane.scrollLeft = leftPane.scrollLeft;
  };
  
  const onScrollRight = () => {
    if (activePane !== 'right') return;
    leftPane.scrollTop = rightPane.scrollTop;
    leftPane.scrollLeft = rightPane.scrollLeft;
  };
  
  leftPane.addEventListener('mouseenter', () => { activePane = 'left'; });
  rightPane.addEventListener('mouseenter', () => { activePane = 'right'; });
  
  leftPane.addEventListener('scroll', onScrollLeft);
  rightPane.addEventListener('scroll', onScrollRight);
}

function updateCompareStats() {
  const aligned = state.comparisonData.alignedApis;
  const matched = aligned.filter(p => p.type === 'match').length;
  const diffs = aligned.filter(p => p.type === 'changed').length;
  const missing = aligned.filter(p => p.type === 'added' || p.type === 'deleted').length;

  document.getElementById('compare-stat-matched').textContent = matched;
  document.getElementById('compare-stat-diff').textContent = diffs;
  document.getElementById('compare-stat-missing').textContent = missing;
  document.getElementById('compare-api-count').textContent = aligned.length;
}

function toggleViewMode() {
  const btn = document.getElementById('btn-toggle-view-mode');
  const searchBar = document.querySelector('.payload-search-filter-bar');
  const standardBody = document.querySelector('.dashboard-body');
  const timelineBody = document.getElementById('timeline-view-body');
  
  if (state.viewMode === 'standard') {
    state.viewMode = 'timeline';
    if (searchBar) searchBar.style.display = 'none';
    if (standardBody) standardBody.style.display = 'none';
    if (timelineBody) timelineBody.style.display = 'flex';
    
    if (btn) {
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px; flex-shrink:0;">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="9" y1="3" x2="9" y2="21"></line>
        </svg>
        <span>Standard View</span>
      `;
    }
    renderTimelineView();
  } else {
    state.viewMode = 'standard';
    if (searchBar) searchBar.style.display = 'flex';
    if (standardBody) standardBody.style.display = 'flex';
    if (timelineBody) timelineBody.style.display = 'none';
    
    if (btn) {
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px; flex-shrink:0;">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span>Timeline View</span>
      `;
    }
    renderInspector();
  }
}

function renderTimelineView() {
  const list = getRequestProgressionStates();
  const stateCountEl = document.getElementById('timeline-state-count');
  if (stateCountEl) {
    stateCountEl.textContent = list.length + (list.length === 1 ? ' State' : ' States');
  }
  
  const verticalListEl = document.getElementById('timeline-vertical-list');
  if (!verticalListEl) return;
  
  if (list.length === 0) {
    verticalListEl.innerHTML = `
      <div class="empty-state" style="padding: 20px; text-align: center;">
        <p>No journey states found in request payloads for this session.</p>
      </div>
    `;
    document.getElementById('timeline-diff-empty').style.display = 'flex';
    document.getElementById('timeline-diff-active').style.display = 'none';
    return;
  }
  
  verticalListEl.innerHTML = list.map((item, index) => {
    const stepNum = index + 1;
    let timeLabel = '';
    const sentAt = item.timing?.sentAt;
    if (sentAt) {
      try {
        const date = new Date(sentAt);
        timeLabel = date.toTimeString().split(' ')[0];
      } catch(e) {
        timeLabel = '';
      }
    }
    
    return `
      <div class="timeline-vertical-item" data-api-id="${item.apiId}" data-index="${index}">
        <div class="timeline-vertical-node">${stepNum}</div>
        <div class="timeline-vertical-content">
          <div class="timeline-vertical-label">${item.state}</div>
          <div class="timeline-vertical-sub">API #${item.apiId}${timeLabel ? ` - ${timeLabel}` : ''}</div>
        </div>
      </div>
    `;
  }).join('');
  
  const steps = verticalListEl.querySelectorAll('.timeline-vertical-item');
  steps.forEach(stepEl => {
    stepEl.addEventListener('click', () => {
      steps.forEach(s => s.classList.remove('active'));
      stepEl.classList.add('active');
      
      const apiId = parseInt(stepEl.getAttribute('data-api-id'), 10);
      const index = parseInt(stepEl.getAttribute('data-index'), 10);
      
      showTimelineDiff(apiId, index, list);
    });
  });
  
  // Auto-select first state to display initial diff
  if (steps.length > 0) {
    steps[0].click();
  }
}

function showTimelineDiff(apiId, index, list) {
  const currentItem = list[index];
  const prevItem = index > 0 ? list[index - 1] : null;
  
  const currentInfo = getRequestStateInfo(currentItem.apiId) || {};
  const prevInfo = prevItem ? (getRequestStateInfo(prevItem.apiId) || {}) : {};
  
  const diffEmptyEl = document.getElementById('timeline-diff-empty');
  const diffActiveEl = document.getElementById('timeline-diff-active');
  if (diffEmptyEl) diffEmptyEl.style.display = 'none';
  if (diffActiveEl) diffActiveEl.style.display = 'flex';
  
  const prevTitle = prevItem ? `API #${prevItem.apiId} (${prevItem.state})` : 'Initial (Empty State)';
  const currentTitle = `API #${currentItem.apiId} (${currentItem.state})`;
  
  const leftHeader = document.getElementById('timeline-pane-header-left');
  const rightHeader = document.getElementById('timeline-pane-header-right');
  const diffApiInfo = document.getElementById('timeline-diff-api-info');
  
  if (leftHeader) leftHeader.textContent = prevTitle;
  if (rightHeader) rightHeader.textContent = currentTitle;
  if (diffApiInfo) diffApiInfo.textContent = `Diffing ${prevTitle} vs ${currentTitle}`;
  
  const linesLeft = JSON.stringify(prevInfo, null, 2).split('\n');
  const linesRight = JSON.stringify(currentInfo, null, 2).split('\n');
  
  const diffResult = diffLines(linesLeft, linesRight);
  
  let htmlLeft = '';
  let htmlRight = '';
  
  diffResult.forEach(item => {
    if (item.type === 'equal') {
      htmlLeft += `<div class="diff-line line-equal">${escapeHtml(item.left)}</div>`;
      htmlRight += `<div class="diff-line line-equal">${escapeHtml(item.right)}</div>`;
    } else if (item.type === 'added') {
      htmlLeft += `<div class="diff-line line-empty">&nbsp;</div>`;
      htmlRight += `<div class="diff-line line-added">+ ${escapeHtml(item.right)}</div>`;
    } else if (item.type === 'deleted') {
      htmlLeft += `<div class="diff-line line-deleted">- ${escapeHtml(item.left)}</div>`;
      htmlRight += `<div class="diff-line line-empty">&nbsp;</div>`;
    }
  });
  
  const codeLeftEl = document.getElementById('timeline-diff-code-left');
  const codeRightEl = document.getElementById('timeline-diff-code-right');
  if (codeLeftEl) codeLeftEl.innerHTML = htmlLeft;
  if (codeRightEl) codeRightEl.innerHTML = htmlRight;
}

function initTimelineViewScrollSync() {
  const leftPane = document.getElementById('timeline-diff-container-left');
  const rightPane = document.getElementById('timeline-diff-container-right');
  if (leftPane && rightPane) {
    let activePane = null;
    leftPane.addEventListener('scroll', () => {
      if (activePane === 'left') rightPane.scrollTop = leftPane.scrollTop;
    });
    rightPane.addEventListener('scroll', () => {
      if (activePane === 'right') leftPane.scrollTop = rightPane.scrollTop;
    });
    leftPane.addEventListener('mouseenter', () => { activePane = 'left'; });
    rightPane.addEventListener('mouseenter', () => { activePane = 'right'; });
  }
}

