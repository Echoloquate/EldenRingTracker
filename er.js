const firebaseConfig = {
  apiKey: "AIzaSyAEWn2CFxUsowJDYrfog0HZeYCpzz2RKQA",
  authDomain: "elden-ring-tracker-de9af.firebaseapp.com",
  databaseURL: "https://elden-ring-tracker-de9af-default-rtdb.firebaseio.com",
  projectId: "elden-ring-tracker-de9af",
  storageBucket: "elden-ring-tracker-de9af.firebasestorage.app",
  messagingSenderId: "1049629299505",
  appId: "1:1049629299505:web:ef3ee3865bc3d2375e5610"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const ROOM_KEY = 'elden-ring-tracker-room';
const CAT_KEY = 'elden-ring-tracker-categories';

function itemId(locName, idx) {
  return `${locName.replace(/\./g, '%2E')}::${idx}`;
}

let checkedState = {};
let currentFilter = 'all';
let currentRoom = null;
let itemsRef = null;
let firebaseListener = null;
let categoriesRef = null;
let categoriesListener = null;
let waitingForInitialData = false;

// Default: all on except "Other Bosses"
const DEFAULT_CATEGORIES = CATEGORIES.map(c => c.id).filter(id => id !== 'boss');
let enabledCategories = new Set(DEFAULT_CATEGORIES);

let enabledSections = new Set(['base', 'dlc']);

(function loadSavedState() {
  const savedCat = localStorage.getItem(CAT_KEY);
  if (savedCat) {
    try {
      const arr = JSON.parse(savedCat);
      if (Array.isArray(arr)) enabledCategories = new Set(arr);
    } catch (e) {}
  }
})();

function saveCategoryState() {
  localStorage.setItem(CAT_KEY, JSON.stringify([...enabledCategories]));
}

function syncCategoriesToFirebase() {
  if (categoriesRef) categoriesRef.set([...enabledCategories]);
}

function updateCategoryButtons() {
  document.querySelectorAll('.cat-btn[data-cat]').forEach(btn => {
    if (enabledCategories.has(btn.dataset.cat)) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

function updateSectionButtons() {
  document.querySelectorAll('.sec-btn').forEach(btn => {
    if (enabledSections.has(btn.dataset.sec)) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function joinRoom(code) {
  if (firebaseListener && itemsRef) {
    itemsRef.off('value', firebaseListener);
  }
  if (categoriesListener && categoriesRef) {
    categoriesRef.off('value', categoriesListener);
  }

  currentRoom = code.toUpperCase();
  localStorage.setItem(ROOM_KEY, currentRoom);
  const url = new URL(location);
  url.searchParams.set('room', currentRoom);
  history.replaceState(null, '', url);
  itemsRef = db.ref('rooms/' + currentRoom + '/items');
  categoriesRef = db.ref('rooms/' + currentRoom + '/categories');

  firebaseListener = itemsRef.on('value', (snapshot) => {
    document.getElementById('syncError').hidden = true;
    checkedState = snapshot.val() || {};
    if (waitingForInitialData) {
      waitingForInitialData = false;
      render();
    } else {
      refreshUI();
    }
  }, (error) => {
    showSyncError('Firebase sync failed: ' + error.message + ' \u2014 check your database rules.');
    if (waitingForInitialData) {
      waitingForInitialData = false;
      render();
    }
  });

  categoriesListener = categoriesRef.on('value', (snapshot) => {
    const val = snapshot.val();
    if (val !== null) {
      const arr = Array.isArray(val) ? val : Object.values(val);
      enabledCategories = new Set(arr);
      saveCategoryState();
      updateCategoryButtons();
      applyFilters();
      updateProgress();
    } else {
      // New room — push current local categories
      categoriesRef.set([...enabledCategories]);
    }
  });

  document.getElementById('roomOverlay').hidden = true;
  document.getElementById('roomBadge').hidden = false;
  document.getElementById('roomCodeDisplay').textContent = currentRoom;
}

function leaveRoom() {
  if (firebaseListener && itemsRef) {
    itemsRef.off('value', firebaseListener);
  }
  if (categoriesListener && categoriesRef) {
    categoriesRef.off('value', categoriesListener);
  }
  firebaseListener = null;
  itemsRef = null;
  categoriesListener = null;
  categoriesRef = null;
  currentRoom = null;
  checkedState = {};
  localStorage.removeItem(ROOM_KEY);
  const url = new URL(location);
  url.searchParams.delete('room');
  history.replaceState(null, '', url);

  document.getElementById('roomBadge').hidden = true;
  document.getElementById('roomOverlay').hidden = false;
  document.getElementById('roomError').textContent = '';
  document.getElementById('roomCodeInput').value = '';

  refreshUI();
}

function showSyncError(msg) {
  const el = document.getElementById('syncError');
  el.textContent = msg;
  el.hidden = false;
}

const undoStack = [];
const UNDO_MAX = 50;

function updateUndoBtn() {
  document.getElementById('undoBtn').disabled = undoStack.length === 0;
}

function batchSetItems(changes, record) {
  if (record) {
    undoStack.push({ items: changes.map(c => ({ id: c.id, wasChecked: !!checkedState[c.id] })) });
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    updateUndoBtn();
  }

  const fbUpdate = {};
  for (const { id, checked } of changes) {
    if (checked) checkedState[id] = true;
    else delete checkedState[id];
    if (itemsRef) fbUpdate[id] = checked ? true : null;
  }
  refreshUI();

  if (itemsRef && Object.keys(fbUpdate).length) {
    itemsRef.update(fbUpdate)
      .catch(() => showSyncError('Failed to sync - check Firebase database rules (must allow read/write).'));
  }
}

function setItemChecked(id, checked) {
  batchSetItems([{ id, checked }], true);
}

function resetAllProgress() {
  if (!itemsRef) return;
  checkedState = {};
  undoStack.length = 0;
  updateUndoBtn();
  refreshUI();
  itemsRef.remove()
    .catch(() => showSyncError('Failed to reset - check Firebase database rules.'));
}

function sectionKey(s) { return s.section ? 'dlc' : 'base'; }

function getTotalAndChecked() {
  let total = 0, done = 0;
  DATA.forEach(s => {
    if (!enabledSections.has(sectionKey(s))) return;
    s.locations.forEach(loc => {
      loc.items.forEach((item, i) => {
        if (!enabledCategories.has(item.cat)) return;
        total++;
        if (checkedState[itemId(loc.name, i)]) done++;
      });
    });
  });
  return { total, done };
}

function updateProgress() {
  const { total, done } = getTotalAndChecked();
  document.getElementById('progressCount').textContent = `${done} / ${total}`;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('progressPercent').textContent = `${pct}%`;
  document.getElementById('progressFill').style.width = `${pct}%`;
}

function renderCategoryToggles() {
  const container = document.getElementById('categoryToggles');
  container.querySelectorAll('.cat-btn, .sec-btn, .toggle-sep').forEach(b => b.remove());

  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn' + (enabledCategories.has(cat.id) ? ' active' : '');
    btn.dataset.cat = cat.id;
    btn.textContent = cat.label;
    btn.addEventListener('click', () => {
      if (enabledCategories.has(cat.id)) {
        enabledCategories.delete(cat.id);
        btn.classList.remove('active');
      } else {
        enabledCategories.add(cat.id);
        btn.classList.add('active');
      }
      saveCategoryState();
      syncCategoriesToFirebase();
      applyFilters();
      updateProgress();
    });
    container.appendChild(btn);
  });

  const sep = document.createElement('div');
  sep.className = 'toggle-sep';
  container.appendChild(sep);

  [{ id: 'base', label: 'Base Game' }, { id: 'dlc', label: 'DLC' }].forEach(sec => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn sec-btn' + (enabledSections.has(sec.id) ? ' active' : '');
    btn.dataset.sec = sec.id;
    btn.textContent = sec.label;
    btn.addEventListener('click', () => {
      if (enabledSections.has(sec.id)) {
        enabledSections.delete(sec.id);
        btn.classList.remove('active');
      } else {
        enabledSections.add(sec.id);
        btn.classList.add('active');
      }
      applyFilters();
      updateProgress();
    });
    container.appendChild(btn);
  });
}

function render() {
  const main = document.getElementById('main');
  main.innerHTML = '';

  DATA.forEach(section => {
    const secKey = section.section ? 'dlc' : 'base';

    if (section.section) {
      const divider = document.createElement('div');
      divider.className = 'dlc-divider';
      divider.dataset.section = secKey;
      divider.innerHTML = `<h2>${section.section}</h2>`;
      main.appendChild(divider);
    }

    section.locations.forEach(loc => {
      const locDiv = document.createElement('div');
      locDiv.className = 'location';
      locDiv.dataset.name = loc.name.toLowerCase();
      locDiv.dataset.section = secKey;

      const header = document.createElement('div');
      header.className = 'location-header';
      header.innerHTML = `
        <h3>${loc.name}</h3>
        <span class="location-count"><span class="done">0</span> / <span class="loc-total">${loc.items.length}</span></span>
      `;
      locDiv.appendChild(header);

      const itemsDiv = document.createElement('div');
      itemsDiv.className = 'items';
      locDiv.appendChild(itemsDiv);

      header.addEventListener('click', () => {
        const collapsed = itemsDiv.dataset.collapsed === 'true';
        itemsDiv.dataset.collapsed = collapsed ? 'false' : 'true';
      });

      header.querySelector('.location-count').addEventListener('click', (e) => {
        e.stopPropagation();
        const visible = [...itemsDiv.querySelectorAll('.item:not([data-hidden="true"])')];
        if (!visible.length) return;
        const allChecked = visible.every(el => el.classList.contains('checked'));
        const changes = visible.map(el => ({ id: el.dataset.id, checked: !allChecked }));
        batchSetItems(changes, true);
      });

      loc.items.forEach((item, i) => {
        const id = itemId(loc.name, i);
        const isChecked = !!checkedState[id];

        const itemDiv = document.createElement('div');
        itemDiv.className = 'item' + (isChecked ? ' checked' : '');
        itemDiv.dataset.id = id;
        itemDiv.dataset.cat = item.cat;

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = isChecked;

        const textSpan = document.createElement('span');
        textSpan.className = 'item-text';
        if (item.replaces) {
          textSpan.innerHTML = `${item.desc}. <span class="item-replaces">\u2192 ${item.replaces}</span>`;
        } else {
          textSpan.textContent = item.desc;
        }

        itemDiv.appendChild(cb);
        itemDiv.appendChild(textSpan);
        itemsDiv.appendChild(itemDiv);

        itemDiv.addEventListener('click', (e) => {
          if (e.target === cb) return;
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });

        cb.addEventListener('change', () => {
          setItemChecked(id, cb.checked);
        });
      });

      main.appendChild(locDiv);
    });
  });

  const resetArea = document.createElement('div');
  resetArea.className = 'reset-area';
  resetArea.innerHTML = `<button class="reset-btn" id="resetBtn">Reset All Progress</button>`;
  main.appendChild(resetArea);

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('Reset all progress? This will clear progress for everyone in this room and cannot be undone.')) {
      resetAllProgress();
    }
  });

  applyFilters();
  updateProgress();
}

function refreshUI() {
  document.querySelectorAll('.location').forEach(locEl => {
    locEl.querySelectorAll('.item').forEach(itemEl => {
      const id = itemEl.dataset.id;
      const isChecked = !!checkedState[id];

      const cb = itemEl.querySelector('input[type="checkbox"]');
      if (cb.checked !== isChecked) cb.checked = isChecked;
      if (isChecked) itemEl.classList.add('checked');
      else itemEl.classList.remove('checked');
    });
  });

  updateProgress();
  applyFilters();
}

function applyFilters() {
  const query = document.getElementById('searchBox').value.toLowerCase().trim();

  document.querySelectorAll('.dlc-divider').forEach(d => {
    d.dataset.hidden = enabledSections.has(d.dataset.section) ? 'false' : 'true';
  });

  document.querySelectorAll('.location').forEach(locEl => {
    const locName = locEl.dataset.name;
    const sectionEnabled = enabledSections.has(locEl.dataset.section);
    let anyVisible = false;
    let locDone = 0;
    let locTotal = 0;

    locEl.querySelectorAll('.item').forEach(itemEl => {
      const id = itemEl.dataset.id;
      const cat = itemEl.dataset.cat;
      const isChecked = !!checkedState[id];
      const catEnabled = enabledCategories.has(cat);

      if (catEnabled) {
        locTotal++;
        if (isChecked) locDone++;
      }

      const text = itemEl.textContent.toLowerCase();
      const matchesSearch = !query || text.includes(query) || locName.includes(query);
      const matchesFilter = currentFilter === 'all' ||
        (currentFilter === 'checked' && isChecked) ||
        (currentFilter === 'unchecked' && !isChecked);

      const visible = sectionEnabled && catEnabled && matchesSearch && matchesFilter;
      itemEl.dataset.hidden = visible ? 'false' : 'true';
      if (visible) anyVisible = true;
    });

    const countEl = locEl.querySelector('.done');
    const totalEl = locEl.querySelector('.loc-total');
    if (countEl) countEl.textContent = locDone;
    if (totalEl) totalEl.textContent = locTotal;

    if (locTotal > 0 && locDone === locTotal) locEl.classList.add('all-done');
    else locEl.classList.remove('all-done');

    locEl.dataset.hidden = anyVisible ? 'false' : 'true';
  });
}

document.getElementById('infoToggle').addEventListener('click', () => {
  document.getElementById('infoToggle').classList.toggle('open');
  document.getElementById('infoContent').classList.toggle('open');
});

document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    applyFilters();
  });
});

document.getElementById('searchBox').addEventListener('input', applyFilters);

document.getElementById('collapseAllBtn').addEventListener('click', () => {
  document.querySelectorAll('.items').forEach(el => el.dataset.collapsed = 'true');
});

document.getElementById('expandAllBtn').addEventListener('click', () => {
  document.querySelectorAll('.items').forEach(el => el.dataset.collapsed = 'false');
});

document.getElementById('jumpNextBtn').addEventListener('click', () => {
  const next = document.querySelector('.item:not(.checked):not([data-hidden="true"])');
  if (!next) return;
  const items = next.closest('.items');
  if (items) items.dataset.collapsed = 'false';
  next.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

document.getElementById('undoBtn').addEventListener('click', () => {
  if (!undoStack.length) return;
  const entry = undoStack.pop();
  updateUndoBtn();
  batchSetItems(entry.items.map(i => ({ id: i.id, checked: i.wasChecked })), false);
});

document.getElementById('createRoomBtn').addEventListener('click', () => {
  const code = generateRoomCode();
  document.getElementById('roomError').textContent = '';
  joinRoom(code);
  render();
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
  const input = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  const errorEl = document.getElementById('roomError');
  if (!input || input.length < 3) {
    errorEl.textContent = 'Please enter a valid room code.';
    return;
  }
  errorEl.textContent = '';
  joinRoom(input);
  render();
});

document.getElementById('roomCodeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('joinRoomBtn').click();
});

document.getElementById('leaveRoomBtn').addEventListener('click', () => {
  leaveRoom();
  render();
});

renderCategoryToggles();

const urlRoom = new URLSearchParams(location.search).get('room');
const savedRoom = urlRoom ? urlRoom.trim().toUpperCase() : localStorage.getItem(ROOM_KEY);
if (savedRoom) {
  // Defer render until first Firebase snapshot — spinner stays visible
  waitingForInitialData = true;
  joinRoom(savedRoom);
} else {
  render();
  document.getElementById('roomOverlay').hidden = false;
}
