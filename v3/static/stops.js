// ═══ Stop management, geocode, add-stop popup ════════════

let _pendingStopLat, _pendingStopLng, _addStopPopup;

function showAddStopPopup(lat, lng, prefillName) {
  _pendingStopLat = lat; _pendingStopLng = lng;
  if (_addStopPopup) { _addStopPopup.remove(); _addStopPopup = null; }

  const modeItems = [
    { key: null, title: 'Numbered',
      html: `<svg width="20" height="20" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg"><circle cx="13" cy="13" r="13" fill="#1A1D2E"/><text x="13" y="17.5" text-anchor="middle" font-size="11" font-weight="700" fill="white" font-family="-apple-system,sans-serif">1</text></svg>` },
    ...Object.entries(CATEGORIES).map(([key, {label, color}]) => ({
      key, title: label,
      html: `<svg width="20" height="20" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14" r="13" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1.5"/><g transform="translate(4,4)" fill="${color}">${catIconPath(key)}</g></svg>`
    }))
  ];
  const catPickerHtml = modeItems.map(({key, html, title}) => {
    const keyStr = key === null ? 'null' : `'${key}'`;
    const active = addStopMode === key;
    return `<button class="mode-btn${active ? ' active' : ''}" title="${title}" data-cat="${key ?? '__num__'}" onclick="selectPopupCat(${keyStr})"><span class="mode-btn-icon">${html}</span></button>`;
  }).join('');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;min-width:220px;padding:2px">
      <input id="addStopNameInput" placeholder="Stop name" style="width:100%;box-sizing:border-box;padding:6px 9px;border:1.5px solid #D0E3FF;border-radius:7px;font-size:0.8rem;font-family:inherit;outline:none;margin-bottom:10px"/>
      <div style="margin-bottom:10px">
        <div style="font-size:0.65rem;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px">Type</div>
        <div id="popupCatRow" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px">${catPickerHtml}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
        <label style="display:flex;align-items:center;gap:7px;font-size:0.78rem;color:#4B4542;cursor:pointer">
          <input type="checkbox" id="chkStart" onchange="if(this.checked){document.getElementById('chkEnd').checked=false;document.getElementById('chkStartEnd').checked=false}"> Set as start
        </label>
        <label style="display:flex;align-items:center;gap:7px;font-size:0.78rem;color:#4B4542;cursor:pointer">
          <input type="checkbox" id="chkEnd" onchange="if(this.checked){document.getElementById('chkStart').checked=false;document.getElementById('chkStartEnd').checked=false}"> Set as end
        </label>
        <label style="display:flex;align-items:center;gap:7px;font-size:0.78rem;color:#4B4542;cursor:pointer">
          <input type="checkbox" id="chkStartEnd" onchange="if(this.checked){document.getElementById('chkStart').checked=false;document.getElementById('chkEnd').checked=false}"> Set as start &amp; end
        </label>
      </div>
      <button onclick="confirmAddStop()" style="width:100%;padding:7px;border:none;border-radius:7px;background:#1A1D2E;color:#fff;font-size:0.76rem;font-weight:600;font-family:inherit;cursor:pointer">Add</button>
    </div>`;

  _addStopPopup = new maplibregl.Popup({ closeButton: true, className: 'add-stop-popup' })
    .setLngLat([lng, lat])
    .setHTML(html)
    .addTo(map);

  setTimeout(() => {
    const input = document.getElementById("addStopNameInput");
    if (!input) return;
    if (prefillName) { input.value = prefillName; input.select(); }
    input.focus();
  }, 50);
}

function confirmAddStop() {
  const input = document.getElementById("addStopNameInput");
  const name = input ? input.value.trim() : "";
  if (!name) { input && input.focus(); return; }
  pushUndo();
  const isStart    = document.getElementById("chkStart")?.checked;
  const isEnd      = document.getElementById("chkEnd")?.checked;
  const isStartEnd = document.getElementById("chkStartEnd")?.checked;
  const id = "custom_" + customIdSeq++;
  const role = isStartEnd ? "startend" : isStart ? "start" : isEnd ? "end" : null;
  const stop = { id, name, lat: _pendingStopLat, lng: _pendingStopLng, role, notes: '', category: addStopMode || null };
  if (isStart || isStartEnd) selectedStops.forEach(s => { if (s.role === "start" || s.role === "startend") s.role = null; });
  if (isEnd   || isStartEnd) selectedStops.forEach(s => { if (s.role === "end"   || s.role === "startend") s.role = null; });
  if (isStart || isStartEnd) {
    selectedStops.unshift(stop);
  } else if (stop.category && routeCoords.length > 1) {
    insertStopByProximity(stop);
  } else {
    selectedStops.push(stop);
  }
  stopUndoStack.push(id);
  if (_addStopPopup) { _addStopPopup.remove(); _addStopPopup = null; }
  renderStops();
}

// ── Geocode (Nominatim) ───────────────────────────────────

function debounceGeo() {
  clearTimeout(geoDebounce);
  const q = document.getElementById("geoInput").value.trim();
  if (q.length < 3) { document.getElementById("geoResults").style.display = "none"; return; }
  geoDebounce = setTimeout(() => geocode(q), 400);
}

async function geocode(q) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const data = await res.json();
    const box = document.getElementById("geoResults");
    if (!data.length) { box.style.display = "none"; return; }
    box.style.display = "block";
    box.innerHTML = data.map(r => `
      <div class="geo-result" onclick="addFromGeo(${r.lat},${r.lon},'${escQ(r.display_name.split(",")[0])}')">
        ${r.display_name}
      </div>`).join("");
  } catch(e) {}
}

function addFromGeo(lat, lng, name) {
  document.getElementById("geoResults").style.display = "none";
  document.getElementById("geoInput").value = "";
  map.easeTo({ center: [parseFloat(lng), parseFloat(lat)], zoom: 16 });
  showAddStopPopup(parseFloat(lat), parseFloat(lng), name);
}

// ── Stop CRUD ─────────────────────────────────────────────

function addStop(name, lat, lng, id) {
  if (selectedStops.find(s => s.id === id)) return;
  pushUndo();
  const stop = { id, name, lat, lng, notes: '' };
  selectedStops.push(stop);
  stopUndoStack.push(id);
  renderStops();
}

function removeStop(idx) {
  pushUndo();
  selectedStops.splice(idx, 1);
  renderStops();
}

function clearStops() {
  selectedStops = [];
  stopUndoStack = [];
  renderStops();
}

function undoLastStop() {
  if (!stopUndoStack.length) return;
  const id = stopUndoStack.pop();
  selectedStops = selectedStops.filter(s => s.id !== id);
  renderStops();
}

function computeStopCumulDists() {
  if (routeCoords.length < 2 || selectedStops.length < 2) return null;
  const R = 6371000;
  return selectedStops.map(stop => {
    let minD = Infinity, idx = 0;
    routeCoords.forEach(([lat, lng], i) => {
      const d = (lat - stop.lat) ** 2 + (lng - stop.lng) ** 2;
      if (d < minD) { minD = d; idx = i; }
    });
    let cum = 0;
    for (let i = 1; i <= idx; i++) {
      const [la1, lo1] = routeCoords[i-1], [la2, lo2] = routeCoords[i];
      const dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180;
      const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
      cum += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    return cum;
  });
}

// ── Render stops list ─────────────────────────────────────

function renderStops() {
  const list  = document.getElementById("stopList");
  const empty = document.getElementById("emptyState");
  const badge = document.getElementById("stopCountBadge");
  const ctrl  = document.getElementById("stopControls");

  badge.textContent = selectedStops.length ? `(${selectedStops.length})` : "";
  empty.style.display = selectedStops.length ? "none" : "block";
  document.getElementById("clearStopsBtn").style.display = selectedStops.length ? "inline-flex" : "none";
  document.getElementById("routeAllBtn").style.display = selectedStops.length >= 2 ? "inline-flex" : "none";
  document.getElementById("optimiseBtn").style.display = selectedStops.length >= 3 ? "inline-flex" : "none";
  ctrl.style.display = selectedStops.length ? "flex" : "none";

  const stopCumDs = computeStopCumulDists();

  list.innerHTML = "";
  let sideNum = 1;
  selectedStops.forEach((s, i) => {
    const catOptions = Object.entries(CATEGORIES).map(([key, {label, color}]) =>
      `<button class="role-item cat-option" onclick="setStopCategory(${i},'${key}')"><svg width="12" height="12" viewBox="0 0 20 20" fill="${color}">${catIconPath(key)}</svg>${label}</button>`
    ).join('');
    const clearCatBtn = s.category ? `<button class="role-item" onclick="setStopCategory(${i},null)">Clear category</button>` : '';

    const roleBadge = s.role === "start"
      ? `<div style="background:#16a34a;color:white;padding:3px 8px;border-radius:20px;font-size:0.65rem;font-weight:700;white-space:nowrap;flex-shrink:0">Start</div>`
      : s.role === "end"
      ? `<div style="background:#dc2626;color:white;padding:3px 8px;border-radius:20px;font-size:0.65rem;font-weight:700;white-space:nowrap;flex-shrink:0">End</div>`
      : s.role === "startend"
      ? `<div style="display:flex;border-radius:20px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.12);flex-shrink:0"><div style="background:#16a34a;color:white;padding:3px 8px;font-size:0.65rem;font-weight:700;white-space:nowrap">Start</div><div style="background:#dc2626;color:white;padding:3px 8px;font-size:0.65rem;font-weight:700;white-space:nowrap">End</div></div>`
      : s.category
      ? `<div style="width:22px;height:22px;flex-shrink:0;border-radius:50%;background:#f3f4f6;border:1.5px solid #d1d5db;display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 20 20" fill="${CATEGORIES[s.category]?.color||'#6878A0'}">${catIconPath(s.category)}</svg></div>`
      : `<div class="stop-num">${sideNum++}</div>`;

    let segInfo = '';
    if (stopCumDs && i > 0) {
      const segDist = stopCumDs[i] - stopCumDs[i - 1];
      const mins = Math.round(segDist / TRAVEL_MODES[travelMode].speedMpm);
      const timeStr = mins < 1 ? '< 1 min' : `${mins} min`;
      segInfo = ` · ${(segDist / 1000).toFixed(2)} km · ${timeStr}`;
    }

    const noteVal = (s.notes || '').trim();
    const noteHtml = noteVal
      ? `<span class="stop-note-text" onclick="startEditNote(${i})">${escH(noteVal)}</span>`
      : `<button class="stop-note-add" onclick="startEditNote(${i})">Add note</button>`;

    const item = document.createElement("div");
    item.className = "stop-item";
    item.draggable = true;
    item.dataset.idx = i;
    item.innerHTML = `
      <span class="stop-drag-handle">⠿</span>
      <span onclick="locateStop(${i})" title="Show on map" style="cursor:pointer;flex-shrink:0;display:flex;align-items:center">${roleBadge}</span>
      <div style="flex:1;min-width:0">
        <div class="stop-name" id="stop-name-${i}">${escH(s.name)}</div>
        <div class="stop-coords">${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}${segInfo}</div>
        <div class="stop-note-wrap" id="stop-note-wrap-${i}">${noteHtml}</div>
      </div>
      <button class="stop-rename" onclick="startRenameStop(${i})" title="Rename">✎</button>
      <div style="position:relative">
        <button class="stop-rename" onclick="toggleRoleDropdown(event,${i})" title="Set role">⋯</button>
        <div class="stop-role-dd" id="role-dd-${i}" style="display:none">
          <button class="role-item" onclick="setStopRole(${i},'start')">Set as start</button>
          <button class="role-item" onclick="setStopRole(${i},'startend')">Set as start & end</button>
          <button class="role-item" onclick="setStopRole(${i},'end')">Set as end</button>
          <button class="role-item" onclick="setStopRole(${i},null)">Clear role</button>
          <div class="role-item-divider"></div>
          <div class="cat-picker-label">Category</div>
          ${catOptions}
          ${clearCatBtn}
        </div>
      </div>
      <button class="stop-remove" onclick="removeStop(${i})">×</button>`;
    item.addEventListener("dragstart", onDragStart);
    item.addEventListener("dragover",  onDragOver);
    item.addEventListener("drop",      onDrop);
    item.addEventListener("dragend",   onDragEnd);
    item.addEventListener("touchstart", onTouchDragStart, { passive: false });
    item.addEventListener("touchmove",  onTouchDragMove,  { passive: false });
    item.addEventListener("touchend",   onTouchDragEnd);
    list.appendChild(item);

    const hasNumbered = selectedStops.some(s => !s.category);
    if (hasNumbered) {
      if (!s.category) {
        let nextNumIdx = -1;
        for (let j = i + 1; j < selectedStops.length; j++) {
          if (!selectedStops[j].category) { nextNumIdx = j; break; }
        }
        if (nextNumIdx !== -1) {
          const connector = document.createElement('div');
          connector.className = 'stop-connector';
          connector.innerHTML = `<button class="stop-route-btn" id="routeBtn_${i}" onclick="routeSegmentToNext(${i},${nextNumIdx})">Route to next stop</button>`;
          list.appendChild(connector);
        }
      }
    } else {
      if (i < selectedStops.length - 1) {
        const connector = document.createElement('div');
        connector.className = 'stop-connector';
        connector.innerHTML = `<button class="stop-route-btn" id="routeBtn_${i}" onclick="routeSegmentToNext(${i},${i+1})">Route to next</button>`;
        list.appendChild(connector);
      }
    }
  });

  const startendIdx = selectedStops.findIndex(s => s.role === 'startend');
  if (startendIdx !== -1 && startendIdx !== selectedStops.length - 1 && selectedStops.length > 1) {
    const closeConnector = document.createElement('div');
    closeConnector.className = 'stop-connector';
    closeConnector.innerHTML = `<button class="stop-route-btn" id="loopCloseBtn" onclick="routeLoopClose()">Route to close loop</button>`;
    list.appendChild(closeConnector);
  }

  renderStopMarkers();
  saveSession();
  syncEditMenu();
}

// ── Stop editing ──────────────────────────────────────────

function toggleRoleDropdown(e, i) {
  e.stopPropagation();
  const dd = document.getElementById(`role-dd-${i}`);
  const isOpen = dd.style.display === 'block';
  document.querySelectorAll('.stop-role-dd').forEach(el => el.style.display = 'none');
  dd.style.display = isOpen ? 'none' : 'block';
}

function setStopRole(i, role) {
  pushUndo();
  if (role === 'start' || role === 'startend') selectedStops.forEach(s => { if (s.role === 'start' || s.role === 'startend') s.role = null; });
  if (role === 'end'   || role === 'startend') selectedStops.forEach(s => { if (s.role === 'end'   || s.role === 'startend') s.role = null; });
  selectedStops[i].role = role;
  renderStops();
  saveSession();
}

function setStopCategory(i, cat) {
  pushUndo();
  selectedStops[i].category = cat || null;
  renderStops();
  saveSession();
}

function startRenameStop(i) {
  const el = document.getElementById(`stop-name-${i}`);
  if (!el) return;
  const current = selectedStops[i].name;
  const input = document.createElement('input');
  input.value = current;
  input.style.cssText = 'flex:1;padding:2px 6px;border:1.5px solid #2563EB;border-radius:5px;font-size:0.81rem;font-family:inherit;font-weight:500;outline:none;background:#fff;color:#1A1614;min-width:0;width:100%';
  el.replaceWith(input);
  input.focus();
  input.select();
  let saved = false;
  const finish = () => {
    if (saved) return;
    saved = true;
    const val = input.value.trim();
    if (val && val !== current) { pushUndo(); selectedStops[i].name = val; }
    renderStops();
    saveSession();
  };
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(); }
    if (e.key === 'Escape') { saved = true; renderStops(); }
  });
}

function startEditNote(i) {
  const wrap = document.getElementById(`stop-note-wrap-${i}`);
  if (!wrap) return;
  pushUndo();
  const current = selectedStops[i].notes || '';
  const ta = document.createElement('textarea');
  ta.value = current;
  ta.placeholder = 'Add a note…';
  ta.rows = 2;
  ta.style.cssText = 'width:100%;padding:4px 6px;border:1.5px solid #2563EB;border-radius:5px;font-size:0.68rem;font-family:inherit;outline:none;background:#fff;color:#1A1614;resize:none;margin-top:2px;box-sizing:border-box';
  wrap.innerHTML = '';
  wrap.appendChild(ta);
  ta.focus();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    selectedStops[i].notes = ta.value.trim();
    renderStops();
    saveSession();
  };
  ta.addEventListener('blur', finish);
  ta.addEventListener('input', () => {
    selectedStops[i].notes = ta.value.trim();
    saveSession();
  });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { done = true; renderStops(); }
  });
}

// ── Drag to reorder (mouse) ───────────────────────────────

let dragSrc = null;
function onDragStart(e) { dragSrc = this; this.classList.add("dragging"); }
function onDragOver(e)  { e.preventDefault(); this.classList.add("drag-over"); }
function onDrop(e) {
  e.preventDefault(); this.classList.remove("drag-over");
  const from = parseInt(dragSrc.dataset.idx), to = parseInt(this.dataset.idx);
  if (from === to) return;
  pushUndo();
  const [moved] = selectedStops.splice(from, 1);
  selectedStops.splice(to, 0, moved);
  renderStops();
}
function onDragEnd() {
  document.querySelectorAll(".stop-item").forEach(el => el.classList.remove("dragging","drag-over"));
}

// ── Drag to reorder (touch) ───────────────────────────────

let _touchDragSrc = null;
let _touchDragOver = null;

function onTouchDragStart(e) {
  if (!e.target.closest('.stop-drag-handle')) return;
  e.preventDefault();
  _touchDragSrc = this;
  this.classList.add('dragging');
}

function onTouchDragMove(e) {
  if (!_touchDragSrc) return;
  e.preventDefault();
  const touch = e.touches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  const item = el && el.closest('.stop-item');
  if (_touchDragOver && _touchDragOver !== item) _touchDragOver.classList.remove('drag-over');
  if (item && item !== _touchDragSrc) {
    _touchDragOver = item;
    item.classList.add('drag-over');
  } else if (!item || item === _touchDragSrc) {
    _touchDragOver = null;
  }
}

function onTouchDragEnd() {
  if (!_touchDragSrc) return;
  const from = parseInt(_touchDragSrc.dataset.idx);
  const to   = _touchDragOver ? parseInt(_touchDragOver.dataset.idx) : -1;
  _touchDragSrc.classList.remove('dragging');
  if (_touchDragOver) _touchDragOver.classList.remove('drag-over');
  _touchDragSrc = null;
  _touchDragOver = null;
  if (to >= 0 && from !== to) {
    pushUndo();
    const [moved] = selectedStops.splice(from, 1);
    selectedStops.splice(to, 0, moved);
    renderStops();
  }
}

// ── Stop ordering helpers ─────────────────────────────────

function routeClosestIdx(stop) {
  let minDist = Infinity, closestIdx = 0;
  routeCoords.forEach((coord, i) => {
    const d = Math.hypot(coord[0] - stop.lat, coord[1] - stop.lng);
    if (d < minDist) { minDist = d; closestIdx = i; }
  });
  return closestIdx;
}

function orderStopsByRoute() {
  if (!routeCoords.length || selectedStops.length < 2) return;
  const stopsWithDist = selectedStops.map(stop => {
    let cumulDist = 0;
    const ci = routeClosestIdx(stop);
    for (let i = 1; i <= ci; i++) {
      const R = 6371000;
      const [la1, lo1] = routeCoords[i-1], [la2, lo2] = routeCoords[i];
      const dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
      const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
      cumulDist += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    return { stop, cumulDist };
  });
  stopsWithDist.sort((a, b) => a.cumulDist - b.cumulDist);
  selectedStops = stopsWithDist.map(x => x.stop);
}

function insertStopByProximity(stop) {
  if (!routeCoords.length || selectedStops.length === 0) { selectedStops.push(stop); return; }
  const newIdx = routeClosestIdx(stop);
  const positions = selectedStops.map(s => routeClosestIdx(s));
  let insertAt = selectedStops.length;
  for (let i = 0; i < positions.length; i++) {
    if (newIdx < positions[i]) { insertAt = i; break; }
  }
  selectedStops.splice(insertAt, 0, stop);
}

function fitMapToStops(stops) {
  if (!stops.length) return;
  const lats = stops.map(s=>s.lat), lngs = stops.map(s=>s.lng);
  map.fitBounds(
    [[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],
    {padding: 30}
  );
}

// ── Optimise stop order by real walking distance ──────────
// Reorders the unpinned stops into the shortest visiting sequence using a
// walking-distance matrix (ORS/OSRM, current travel mode). A stop pinned as
// Start (or loop point) stays first; a stop pinned as End stays last. Does NOT
// draw the route — use "Route all stops" afterwards.

function _tourLen(M, t) {
  let s = 0;
  for (let i = 0; i < t.length - 1; i++) s += M[t[i]][t[i + 1]];
  return s;
}

function _nnChain(M, start, pool) {
  const rem = new Set(pool);
  const tour = [start];
  let last = start;
  while (rem.size) {
    let nd = Infinity, ni = -1;
    rem.forEach(x => { if (M[last][x] < nd) { nd = M[last][x]; ni = x; } });
    tour.push(ni); rem.delete(ni); last = ni;
  }
  return tour;
}

// 2-opt that never moves the first or last position (fixed endpoints).
function _twoOptFixedEnds(M, tour) {
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < tour.length - 2; i++) {
      for (let j = i + 2; j < tour.length - 1; j++) {
        const a = tour[i], b = tour[i + 1], c = tour[j], d = tour[j + 1];
        if (M[a][b] + M[c][d] > M[a][c] + M[b][d] + 1e-9) {
          let lo = i + 1, hi = j;
          while (lo < hi) { const t = tour[lo]; tour[lo] = tour[hi]; tour[hi] = t; lo++; hi--; }
          improved = true;
        }
      }
    }
  }
  return tour;
}

// Shortest open path over matrix indices 0..n-1, optionally fixing index 0
// (lockFirst) and/or index n-1 (lockLast). Returns the visiting order.
function _solveOpenTSP(M, n, lockFirst, lockLast) {
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const mid = [];
  for (let i = 0; i < n; i++) {
    if (lockFirst && i === 0) continue;
    if (lockLast && i === n - 1) continue;
    mid.push(i);
  }
  if (lockFirst && lockLast) {
    const tour = _nnChain(M, 0, mid);
    tour.push(n - 1);
    return _twoOptFixedEnds(M, tour);
  }
  if (lockFirst) return _twoOptFixedEnds(M, _nnChain(M, 0, mid));
  if (lockLast)  return _twoOptFixedEnds(M, _nnChain(M, n - 1, mid).reverse());
  // No pins: try every start, keep the shortest tour.
  let best = null, bestLen = Infinity;
  for (let s = 0; s < n; s++) {
    const others = [];
    for (let i = 0; i < n; i++) if (i !== s) others.push(i);
    const tour = _twoOptFixedEnds(M, _nnChain(M, s, others));
    const len = _tourLen(M, tour);
    if (len < bestLen) { bestLen = len; best = tour; }
  }
  return best;
}

async function optimiseOrder() {
  if (selectedStops.length < 3) { showToast('Add at least 3 stops to optimise the order.'); return; }

  const startPin = selectedStops.find(s => s.role === 'start' || s.role === 'startend') || null;
  const endPin   = selectedStops.find(s => s.role === 'end') || null;
  const middle   = selectedStops.filter(s => s !== startPin && s !== endPin);
  if (middle.length < 2) { showToast('Need at least 2 unpinned stops to reorder.'); return; }

  // Matrix order: [start?] + middle + [end?]
  const ordered = [...(startPin ? [startPin] : []), ...middle, ...(endPin ? [endPin] : [])];
  const pts = ordered.map(s => [s.lat, s.lng]);

  const btn = document.getElementById('optimiseBtn');
  if (btn) { btn.textContent = 'Optimising…'; btn.disabled = true; }
  showToast('Measuring walking distances…');

  const prof = TRAVEL_MODES[travelMode];
  const res = await apiDistanceMatrix(pts, prof.orsProfile, prof.osrmProfile);

  if (btn) { btn.textContent = 'Optimise order'; btn.disabled = false; }
  if (!res.ok || !res.matrix) { showToast('Could not get walking distances — order unchanged.'); return; }

  // Sanitise nulls (unreachable pairs) to a large finite cost.
  const n = ordered.length;
  const M = res.matrix.map(row => row.map(v => (v == null ? 1e12 : v)));

  pushUndo();
  const order = _solveOpenTSP(M, n, !!startPin, !!endPin);
  selectedStops = order.map(i => ordered[i]);
  renderStops();
  showToast('Stops reordered by shortest walking route. Use "Route all stops" to draw it.');
}

function setAsStart(idx) {
  if (idx <= 0 || idx >= selectedStops.length) return;
  selectedStops = [...selectedStops.slice(idx), ...selectedStops.slice(0, idx)];
  renderStops();
}

function setAsEnd(idx) {
  if (idx < 0 || idx >= selectedStops.length - 1) return;
  selectedStops = [...selectedStops.slice(0, idx), ...selectedStops.slice(idx + 1), selectedStops[idx]];
  renderStops();
}
