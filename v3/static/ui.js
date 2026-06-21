// ═══ UI helpers, session, global event listeners ══════════

// ── Sidebar / section collapse ────────────────────────────

function toggleSection(header) {
  header.classList.toggle("open");
  const body = header.nextElementSibling;
  body.classList.toggle("open");
}

function toggleSidebar() {
  const sidebar = document.querySelector(".sidebar");
  sidebar.classList.toggle("collapsed");
  document.getElementById("sidebarToggle").textContent =
    sidebar.classList.contains("collapsed") ? "▶" : "☰";
  setTimeout(() => map.resize(), 300);
}

// ── Toolbar dropdowns ──────────────────────────────────────

function toggleEditDropdown() {
  const dd = document.getElementById("editDropdown");
  dd.style.display = dd.style.display === "block" ? "none" : "block";
}

function closeEditDropdown() {
  document.getElementById("editDropdown").style.display = "none";
}

function toggleExportDropdown() {
  const dd = document.getElementById("exportDropdown");
  dd.style.display = dd.style.display === "none" ? "block" : "none";
}

document.addEventListener("click", e => {
  const btn = document.getElementById("exportMenuBtn");
  const dd  = document.getElementById("exportDropdown");
  if (dd && !dd.contains(e.target) && e.target !== btn) {
    dd.style.display = "none";
  }
});

document.addEventListener("click", e => {
  if (!document.getElementById("geoInput").contains(e.target))
    document.getElementById("geoResults").style.display = "none";
  if (!e.target.closest('.stop-role-dd') && !e.target.closest('.stop-rename'))
    document.querySelectorAll('.stop-role-dd').forEach(el => el.style.display = 'none');
  if (!e.target.closest('#modeBar'))
    closeModeDropdown();
});

// ── Toast ─────────────────────────────────────────────────

let _toastTimer;
function showToast(msg, duration = 6000) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.opacity = "0"; }, duration);
}

// ── Add-stop mode row ─────────────────────────────────────

function updateMapClickBtnText() {
  const btn = document.getElementById("mapClickBtn");
  if (!btn) return;
  const thing = addStopMode ? 'marker' : 'stop';
  btn.textContent = mapClickMode ? `Tap map to add ${thing}` : `Click map to add ${thing}`;
}

function toggleMapClickMode() {
  mapClickMode = !mapClickMode;
  const btn = document.getElementById("mapClickBtn");
  if (mapClickMode) {
    btn.classList.add("active");
    map.getCanvas().style.cursor = "crosshair";
  } else {
    btn.classList.remove("active");
    map.getCanvas().style.cursor = "";
  }
  updateMapClickBtnText();
}

function renderAddStopModeRow() {
  const row = document.getElementById('addStopModeRow');
  if (!row) return;
  const items = [
    { key: null, title: 'Numbered',
      html: `<svg width="20" height="20" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg"><circle cx="13" cy="13" r="13" fill="#1A1D2E"/><text x="13" y="17.5" text-anchor="middle" font-size="11" font-weight="700" fill="white" font-family="-apple-system,sans-serif">1</text></svg>` },
    ...Object.entries(CATEGORIES).map(([key, {label, color}]) => ({
      key, title: label,
      html: `<svg width="20" height="20" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14" r="13" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1.5"/><g transform="translate(4,4)" fill="${color}">${catIconPath(key)}</g></svg>`
    }))
  ];
  row.innerHTML = items.map(({key, html, title}) => {
    const keyStr = key === null ? 'null' : `'${key}'`;
    const active = addStopMode === key;
    return `<button class="mode-btn${active ? ' active' : ''}" data-cat="${key ?? '__num__'}" onclick="setAddStopMode(${keyStr})"><span class="mode-btn-icon">${html}</span><span class="mode-btn-label">${title}</span></button>`;
  }).join('');
}

function setAddStopMode(cat) {
  addStopMode = cat;
  renderAddStopModeRow();
  updateMapClickBtnText();
}

function selectPopupCat(cat) {
  addStopMode = cat;
  renderAddStopModeRow();
  document.querySelectorAll('#popupCatRow .mode-btn').forEach(btn => {
    const btnCat = btn.dataset.cat === '__num__' ? null : btn.dataset.cat;
    btn.classList.toggle('active', btnCat === cat);
  });
}

// ── Map click dispatcher ──────────────────────────────────

function onMapClick(e) {
  const lat = e.lngLat.lat;
  const lng = e.lngLat.lng;

  if (printAreaMode) {
    if (!printAreaCorner1) {
      printAreaCorner1 = [lat, lng];
      const el = document.createElement('div');
      el.style.cssText = 'width:10px;height:10px;border-radius:50%;background:#2563EB;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.2);transform:translate(-5px,-5px)';
      _printAreaCornerMarker = new maplibregl.Marker({ element: el, anchor: 'top-left' })
        .setLngLat([lng, lat]).addTo(map);
      document.getElementById('printAreaBtn').textContent = 'Click second corner…';
    } else {
      if (_printAreaCornerMarker) { _printAreaCornerMarker.remove(); _printAreaCornerMarker = null; }
      printAreaBounds = makeBounds(printAreaCorner1, [lat, lng]);
      if (map.getSource('print-rect')) map.getSource('print-rect').setData(boundsToPolygon(printAreaBounds));
      printAreaMode = false;
      map.getCanvas().style.cursor = '';
      document.getElementById('printAreaBtn').textContent = 'Set image area';
      document.getElementById('printAreaBtn').classList.remove('active');
      document.getElementById('clearPrintAreaBtn').style.display = 'inline-flex';
    }
    return;
  }

  if (bboxMode) {
    if (!bboxCorner1) {
      bboxCorner1 = [lat, lng];
      document.getElementById("bboxBtn").textContent = "Click second corner…";
    } else {
      bboxBounds = makeBounds(bboxCorner1, [lat, lng]);
      if (map.getSource('bbox-rect')) map.getSource('bbox-rect').setData(boundsToPolygon(bboxBounds));
      bboxMode = false;
      map.getCanvas().style.cursor = "";
      document.getElementById("bboxBtn").textContent = "Filter by area";
      document.getElementById("bboxBtn").classList.remove("active");
      document.getElementById("clearBboxBtn").style.display = "inline-flex";
      applyFilters();
    }
    return;
  }

  if (eraseMode)    { erasePoint(lat, lng); return; }
  if (drawing)      { addRoutePoint(lat, lng); return; }
  if (mapClickMode) { showAddStopPopup(lat, lng); return; }
}

// ── Travel mode ───────────────────────────────────────────

function toggleModeDropdown() {
  document.getElementById('modeDropdown').classList.toggle('open');
}

function closeModeDropdown() {
  document.getElementById('modeDropdown').classList.remove('open');
}

function setTravelMode(mode) {
  travelMode = mode;
  const label = TRAVEL_MODES[mode].label;
  document.getElementById('modeBarBtn').textContent = label + ' ▾';
  document.querySelectorAll('.mode-bar-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  closeModeDropdown();
  updateRouteStats();
  renderStops();
  saveSession();
  if (routeCoords.length > 1) {
    showToast(`Switched to ${label.toLowerCase()}. Re-draw your route for best results.`);
  }
}

// ── New route ─────────────────────────────────────────────

function newMap() {
  if ((selectedStops.length || routeCoords.length) &&
      !confirm("Start a new route? This will clear all stops and the current route.")) return;
  localStorage.removeItem(SESSION_KEY);
  undoStack = []; redoStack = [];
  clearDrawing();
  clearStops();
  datasetStops = []; filteredStops = [];
  if (map.getSource('dataset-dots')) map.getSource('dataset-dots').setData(emptyCollection());
  poiMarkersVisible = true;
  document.getElementById("togglePOIBtn").textContent = "POI markers visible";
  document.getElementById("togglePOIBtn").classList.remove("active");
  document.getElementById("dataInfo").style.display     = "none";
  document.getElementById("searchRow").style.display    = "none";
  document.getElementById("areaFilterRow").style.display = "none";
  document.getElementById("poiToggleRow").style.display = "none";
  document.getElementById("arrFilter").style.display    = "none";
  document.getElementById("fileLabel").textContent      = "";
  document.getElementById("datasetMsg").innerHTML       = "";
  document.getElementById("filteredCount").style.display = "none";
  document.getElementById("exportName").value           = "my_walk";
  document.getElementById("exportMsg").innerHTML        = "";
  if (map.getLayer('dataset-dots-layer')) map.setLayoutProperty('dataset-dots-layer', 'visibility', 'visible');
}

// ── Full screen ───────────────────────────────────────────

function toggleFullscreen() {
  const on = document.body.classList.toggle('fullscreen');
  document.getElementById('fullscreenBtn').style.opacity = on ? '0.5' : '';
  map.resize();
}

// ── POI marker visibility ─────────────────────────────────

let poiMarkersVisible = true;
function togglePOIMarkers() {
  poiMarkersVisible = !poiMarkersVisible;
  const btn = document.getElementById("togglePOIBtn");
  const vis = poiMarkersVisible ? 'visible' : 'none';
  if (map.getLayer('dataset-dots-layer')) map.setLayoutProperty('dataset-dots-layer', 'visibility', vis);
  // stop markers are DOM elements; show/hide them
  Object.values(_stopMarkers).forEach(m => { m.getElement().style.display = poiMarkersVisible ? '' : 'none'; });
  routeEndpointMarkers.forEach(m => { m.getElement().style.display = poiMarkersVisible ? '' : 'none'; });
  if (poiMarkersVisible) {
    btn.textContent = "POI markers visible";
    btn.classList.remove("active");
  } else {
    btn.textContent = "POI markers hidden";
    btn.classList.add("active");
  }
}

// ── Session persistence ───────────────────────────────────

function _writeSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      v: 1,
      stops: selectedStops,
      routeCoords,
      routeSegments,
      routeDistM,
      customIdSeq,
      detourPoints,
      travelMode,
      walkName: document.getElementById('exportName').value,
      mapCenter: [map.getCenter().lat, map.getCenter().lng],
      mapZoom: map.getZoom(),
    }));
  } catch(e) {}
}

function saveSession() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_writeSession, 500);
}

window.addEventListener('beforeunload', () => {
  clearTimeout(_saveTimer);
  _writeSession();
});

function restoreSession() {
  let data;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    data = JSON.parse(raw);
    if (!data || data.v !== 1) return;
  } catch(e) { return; }

  if (data.customIdSeq) customIdSeq = data.customIdSeq;
  if (data.travelMode && TRAVEL_MODES[data.travelMode]) setTravelMode(data.travelMode);
  try {
    if (data.walkName) document.getElementById('exportName').value = data.walkName;
  } catch(_) {}

  if (data.routeCoords?.length > 1) {
    try {
      routeCoords   = data.routeCoords;
      routeSegments = data.routeSegments || [data.routeCoords.length];
      routeDistM    = data.routeDistM   || calcDist(routeCoords);
      dotMarkers    = routeSegments.map(() => null);
      redrawRoute();
      updateRouteStats();
      const em = document.getElementById('editMenuBtn');
      const ed = document.getElementById('editDivider');
      if (em) em.style.display = 'flex';
      if (ed) ed.style.display = 'block';
    } catch(e) { console.warn('restoreSession route error:', e); }
  }

  if (data.stops?.length) {
    try {
      selectedStops = data.stops;
      renderStops();
    } catch(e) {
      console.warn('restoreSession stops error:', e);
      try { renderStopMarkers(); } catch(_) {}
    }
  }

  if (data.detourPoints?.length) {
    try {
      data.detourPoints.forEach(p => {
        detourPoints.push(p);
        addDetourMarker(p.lat, p.lng);
      });
    } catch(e) { console.warn('restoreSession detour error:', e); }
  }

  try {
    if (data.mapCenter && data.mapZoom) {
      map.jumpTo({ center: [data.mapCenter[1], data.mapCenter[0]], zoom: data.mapZoom });
    } else if (routeCoords.length > 1) {
      fitMapToRoute(40);
    }
  } catch(_) {}
}

function setExportRes(mult) {
  exportResolutionMultiplier = mult;
  [1, 2, 3].forEach(n => {
    const btn = document.getElementById(`res-${n}x`);
    if (btn) btn.className = 'res-btn' + (n === mult ? ' res-btn-active' : '');
  });
}

// ── ORS API key modal ──────────────────────────────────────

function showOrsKeyModal() {
  const overlay = document.getElementById('orsKeyOverlay');
  const input   = document.getElementById('orsKeyInput');
  const clearRow = document.getElementById('orsKeyClearRow');
  const existing = orsKey();
  input.value = existing;
  clearRow.style.display = existing ? 'block' : 'none';
  document.getElementById('orsKeyMsg').textContent = '';
  overlay.style.display = 'flex';
  setTimeout(() => input.focus(), 50);
}

function closeOrsKeyModal() {
  document.getElementById('orsKeyOverlay').style.display = 'none';
}

function saveOrsKey() {
  const val = document.getElementById('orsKeyInput').value.trim();
  if (!val) {
    document.getElementById('orsKeyMsg').textContent = 'Please paste your API key.';
    return;
  }
  localStorage.setItem('maperati_ors_key', val);
  closeOrsKeyModal();
  showToast('API key saved.');
}

function clearOrsKey() {
  localStorage.removeItem('maperati_ors_key');
  closeOrsKeyModal();
  showToast('API key removed. Routing will fall back to OSRM.');
}

// Show modal on first load if no key is stored
window.addEventListener('load', () => {
  if (!orsKey()) showOrsKeyModal();
});
