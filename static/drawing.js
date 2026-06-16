// ═══ Drawing, undo/redo, erase, context menu, stats ══════

// ── Undo / Redo ──────────────────────────────────────────

function snapshotState() {
  return {
    routeCoords:   routeCoords.map(c => [c[0], c[1]]),
    routeSegments: [...routeSegments],
    routeDistM:    routeDistM,
    dotMarkersLen: dotMarkers.length,
    stops:         selectedStops.map(s => ({...s})),
    stopUndoStack: [...stopUndoStack],
  };
}

function pushUndo() {
  undoStack.push(snapshotState());
  if (undoStack.length > 20) undoStack.shift();
  redoStack = [];
  syncEditMenu();
}

function applySnapshot(snap) {
  routeCoords   = snap.routeCoords.map(c => [c[0], c[1]]);
  routeSegments = [...snap.routeSegments];
  routeDistM    = snap.routeDistM;
  dotMarkers    = new Array(snap.dotMarkersLen).fill(null);
  selectedStops = snap.stops.map(s => ({...s}));
  stopUndoStack = [...snap.stopUndoStack];
  clearElevation();
  redrawRoute();
  renderStops();
  if (routeCoords.length > 1) updateRouteStats();
  else document.getElementById('routeStats').style.display = 'none';
  syncEditMenu();
}

function undoAction() {
  if (!undoStack.length) return;
  redoStack.push(snapshotState());
  applySnapshot(undoStack.pop());
}

function redoAction() {
  if (!redoStack.length) return;
  undoStack.push(snapshotState());
  applySnapshot(redoStack.pop());
}

function clearRouteAction() {
  if (!routeCoords.length) return;
  pushUndo();
  clearDrawing();
  closeEditDropdown();
}

function syncEditMenu() {
  const hasRoute = routeCoords.length > 0;
  const hasUndo  = undoStack.length > 0;
  const hasRedo  = redoStack.length > 0;
  const show = hasRoute || hasUndo || hasRedo;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.style.display = val; };
  const dis = (id, val) => { const el = document.getElementById(id); if (el) el.disabled = val; };
  set('editMenuBtn',   show ? 'flex'  : 'none');
  set('editDivider',   show ? 'block' : 'none');
  set('undoActionBtn', show ? 'flex'  : 'none');
  set('redoActionBtn', show ? 'flex'  : 'none');
  dis('undoActionBtn', !hasUndo);
  dis('redoActionBtn', !hasRedo);
  set('reverseBtn',    hasRoute ? 'flex' : 'none');
}

function reverseRoute() {
  if (routeCoords.length < 2) return;
  pushUndo();
  routeCoords.reverse();
  routeSegments = [routeCoords.length];
  dotMarkers    = [null];
  selectedStops.reverse();
  selectedStops.forEach(s => {
    if (s.role === 'start') s.role = 'end';
    else if (s.role === 'end') s.role = 'start';
  });
  routeDistM = calcDist(routeCoords);
  clearElevation();
  redrawRoute();
  renderStops();
  updateRouteStats();
  saveSession();
  showToast('Route reversed.');
}

// ── Drawing ───────────────────────────────────────────────

function toggleDraw() {
  drawing = !drawing;
  const btn = document.getElementById("drawBtn");
  if (drawing) {
    btn.textContent = drawMode === 'auto' ? "Snap ▾" : "Free ▾";
    btn.classList.add("active");
    map.getContainer().style.cursor = "crosshair";
    if (mapClickMode) toggleMapClickMode();
  } else {
    btn.textContent = "Draw ▾";
    btn.classList.remove("active");
    map.getContainer().style.cursor = "";
    updateRouteStats();
  }
}

function setDrawMode(mode) { drawMode = mode; }

function toggleDrawDropdown() {
  const dd = document.getElementById("drawDropdown");
  const isOpen = dd.style.display === "block";
  closeDrawDropdown();
  if (!isOpen) {
    document.getElementById("stopDrawDivider").style.display = drawing ? "block" : "none";
    document.getElementById("stopDrawItem").style.display   = drawing ? "flex"  : "none";
    dd.style.display = "block";
  }
}

function closeDrawDropdown() {
  document.getElementById("drawDropdown").style.display = "none";
}

function startDraw(mode) {
  setDrawMode(mode);
  if (!drawing) {
    pushUndo();
    toggleDraw();
  } else {
    document.getElementById("drawBtn").textContent = mode === 'auto' ? "Snap ▾" : "Free ▾";
  }
  closeDrawDropdown();
}

function stopDrawFromMenu() {
  if (drawing) toggleDraw();
  closeDrawDropdown();
}

async function addRoutePoint(lat, lng) {
  const prev = routeCoords.length ? routeCoords[routeCoords.length-1] : null;
  let newCoords = [[lat, lng]];
  let segDist = 0;

  if (drawMode === 'auto') {
    try {
      const res = await fetch("/api/snap-point", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ point: [lat, lng] }),
      });
      const data = await res.json();
      if (data.ok && data.point) { lat = data.point[0]; lng = data.point[1]; }
    } catch(e) {}
    newCoords = [[lat, lng]];
  }

  if (segDist === 0 && prev) {
    const R = 6371000;
    const dLat=(lat-prev[0])*Math.PI/180, dLng=(lng-prev[1])*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(prev[0]*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLng/2)**2;
    segDist = R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  routeCoords.push(...newCoords);
  routeSegments.push(newCoords.length);
  routeDistM += segDist;
  redrawRoute();
  dotMarkers.push(null);
  document.getElementById("editMenuBtn").style.display = "flex";
  document.getElementById("editDivider").style.display = "block";
  updateRouteStats();
}

function redrawRoute() {
  if (routePolyline) map.removeLayer(routePolyline);
  if (routeCoords.length > 1) {
    routePolyline = L.polyline(routeCoords, {color:"#2563EB",weight:5,opacity:0.9}).addTo(map);
    routePolyline.on('click', function(e) {
      if (drawing || eraseMode) return;
      L.DomEvent.stopPropagation(e);
      const dists = cumDists(routeCoords);
      const idx = findNearestRouteIndex(e.latlng.lat, e.latlng.lng);
      const d = dists[idx];
      const totalD = dists[dists.length - 1];
      const fmt = m => m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${Math.round(m)} m`;
      L.popup({closeButton:false, className:'route-dist-popup'})
        .setLatLng(e.latlng)
        .setContent(`<span class="rdp-from">${fmt(d)} from start</span><span class="rdp-sep"> · </span><span class="rdp-to">${fmt(totalD - d)} to end</span>`)
        .openOn(map);
    });
  }
  renderRouteEndpoints();
  saveSession();
}

function undoPoint() {
  if (!dotMarkers.length) return;
  const d = dotMarkers.pop(); if (d) map.removeLayer(d);
  const n = routeSegments.pop() || 1;
  routeCoords.splice(routeCoords.length - n, n);
  routeDistM = calcDist(routeCoords);
  redrawRoute();
  if (!dotMarkers.length) {
    document.getElementById("routeStats").style.display = "none";
    closeEditDropdown();
  } else {
    updateRouteStats();
  }
  syncEditMenu();
}

function clearDrawing() {
  dotMarkers.forEach(d => { if (d) map.removeLayer(d); });
  dotMarkers = []; routeCoords = []; routeSegments = []; routeDistM = 0;
  if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }
  routeEndpointMarkers.forEach(m => map.removeLayer(m));
  routeEndpointMarkers = [];
  document.getElementById("routeStats").style.display = "none";
  closeEditDropdown();
  hideCtx();
  clearElevation();
  syncEditMenu();
  saveSession();
}

// ── Erase ─────────────────────────────────────────────────

function toggleEraseMode() {
  eraseMode = !eraseMode;
  const menuBtn = document.getElementById("editMenuBtn");
  if (eraseMode) {
    menuBtn.textContent = "Erasing… ▾";
    menuBtn.classList.add("erase-active");
    map.getContainer().style.cursor = "crosshair";
    if (drawing) toggleDraw();
    eraseStart = null;
  } else {
    menuBtn.textContent = "Edit ▾";
    menuBtn.classList.remove("erase-active");
    map.getContainer().style.cursor = "";
    if (eraseMarker) { map.removeLayer(eraseMarker); eraseMarker = null; }
    eraseStart = null;
  }
}

async function erasePoint(lat, lng) {
  let nearest = 0, minD = Infinity;
  routeCoords.forEach(([rlat, rlng], i) => {
    const d = Math.hypot(rlat - lat, rlng - lng);
    if (d < minD) { minD = d; nearest = i; }
  });

  if (eraseStart === null) {
    eraseStart = nearest;
    eraseMarker = L.circleMarker(routeCoords[nearest], {
      radius: 8, color: "#B85C38", fillColor: "#B85C38", fillOpacity: 0.9, weight: 2
    }).addTo(map);
    document.getElementById("editMenuBtn").textContent = "Click end point…";
  } else {
    pushUndo();
    const from = Math.min(eraseStart, nearest);
    const to   = Math.max(eraseStart, nearest);

    const p1 = from > 0 ? routeCoords[from - 1] : null;
    const p2 = to < routeCoords.length - 1 ? routeCoords[to + 1] : null;

    routeCoords.splice(from, to - from + 1);

    if (eraseMarker) { map.removeLayer(eraseMarker); eraseMarker = null; }
    eraseStart = null;
    eraseMode  = false;
    const menuBtn = document.getElementById("editMenuBtn");
    menuBtn.classList.remove("erase-active");
    map.getContainer().style.cursor = "";

    if (p1 && p2) {
      menuBtn.textContent = "Routing gap…";
      try {
        const res  = await fetch('/api/snap-segment', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({from: p1, to: p2}),
        });
        const data = await res.json();
        if (data.coords && data.coords.length > 2) {
          routeCoords.splice(from, 0, ...data.coords.slice(1, -1));
        }
        if (data.warning) showToast(data.warning);
      } catch(e) {}
    }

    menuBtn.textContent = "Edit ▾";
    routeDistM = calcDist(routeCoords);
    redrawRoute();
    if (routeCoords.length > 1) updateRouteStats();
    else document.getElementById("routeStats").style.display = "none";
    syncEditMenu();
  }
}

// ── Context menu ──────────────────────────────────────────

function hideCtx() { document.getElementById("ctxMenu").style.display = "none"; }

function redoFromHere(lat, lng) {
  hideCtx();
  pushUndo();
  let closest = 0, minD = Infinity;
  routeCoords.forEach(([rlat,rlng], i) => {
    const d = Math.hypot(rlat-lat, rlng-lng);
    if (d < minD) { minD = d; closest = i; }
  });
  routeCoords = routeCoords.slice(0, closest + 1);
  routeDistM = calcDist(routeCoords);
  while (dotMarkers.length > 1) { map.removeLayer(dotMarkers.pop()); routeSegments.pop(); }
  redrawRoute();
  updateRouteStats();
  if (!drawing) toggleDraw();
}

// ── Distance / stats ─────────────────────────────────────

function calcDist(coords) {
  let d = 0; const R = 6371000;
  for (let i=1;i<coords.length;i++) {
    const [la1,lo1]=coords[i-1],[la2,lo2]=coords[i];
    const dLa=(la2-la1)*Math.PI/180, dLo=(lo2-lo1)*Math.PI/180;
    const a=Math.sin(dLa/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
    d += R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  return d;
}

function updateRouteStats() {
  if (routeCoords.length < 2) return;
  const dist = calcDist(routeCoords);
  document.getElementById("statsDist").textContent = `~${(dist/1000).toFixed(2)} km`;
  document.getElementById("statsTime").textContent = `~${Math.round(dist/80)} min`;
  document.getElementById("routeStats").style.display = "block";
}

function findNearestRouteIndex(lat, lng) {
  let best = 0, bestDist = Infinity;
  routeCoords.forEach(([rlat, rlng], i) => {
    const d = (rlat - lat) ** 2 + (rlng - lng) ** 2;
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best;
}
