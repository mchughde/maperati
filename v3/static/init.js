// ═══ Initialisation (runs last, after all other scripts) ══

// Restore session and render add-stop mode row once map is ready.
// setupMapDataLayers() is already registered via map.on('load') in map-init.js
// and fires before this callback because map-init.js loads first.
map.on('load', () => {
  restoreSession();
  renderAddStopModeRow();
});

// ── TEMPORARY on-screen debug overlay for Apple Pencil ─────
// Shows what input events the iPad actually sends when you touch the map,
// so we can diagnose without any developer tools. REMOVE once drawing works.
{
  const box = document.createElement('div');
  box.id = 'pencilDebug';
  box.style.cssText =
    'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99999;' +
    'background:rgba(0,0,0,0.85);color:#3f6;font:13px/1.4 monospace;padding:9px 12px;' +
    'border-radius:8px;max-width:94vw;white-space:pre-wrap;pointer-events:none';
  box.textContent = 'DEBUG ready — turn on Draw, then tap the map';
  document.body.appendChild(box);

  const lines = [];
  window._pdlog = (msg) => {
    const t = new Date().toTimeString().slice(0, 8);
    lines.unshift(t + '  ' + msg);
    if (lines.length > 9) lines.pop();
    box.textContent = lines.join('\n');
  };

  const c = map.getCanvas();
  c.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    window._pdlog(`touchstart  n=${e.touches.length}  touchType=${t ? (t.touchType || 'none') : '-'}`);
  }, { passive: true });
  c.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    window._pdlog(`touchend    touchType=${t ? (t.touchType || 'none') : '-'}`);
  }, { passive: true });
  c.addEventListener('pointerdown',   (e) => window._pdlog(`pointerdown pointerType=${e.pointerType}`), { passive: true });
  c.addEventListener('pointerup',     (e) => window._pdlog(`pointerup   pointerType=${e.pointerType}`), { passive: true });
  c.addEventListener('pointercancel', (e) => window._pdlog(`pointercancel pointerType=${e.pointerType}`), { passive: true });

  map.on('click', () => window._pdlog(`>> MapLibre CLICK   drawing=${drawing}`));
}

// Apple Pencil support for MapLibre GL JS on Safari/iPadOS.
// Safari fires reliable PointerEvents with pointerType:"pen" for the Pencil
// (confirmed on-device), so we drive everything off those.
//
//   Free mode  : a pen DRAG draws a continuous freehand line. We disable the
//                map's drag-pan only for the duration of the stroke, so a
//                FINGER can still pan/zoom the map while the Pencil draws.
//   Snap mode  : a pen TAP drops a road-snapped point (drag pans, as normal).
//   Any mode   : a pen TAP is routed through onMapClick so add-stop / erase /
//                bbox / print-area modes keep working with the Pencil.
{
  const _canvas = map.getCanvas();
  let _penStroke = null;   // active freehand stroke: {lastClient:[x,y], count}
  let _penDown   = null;   // pen-down marker for tap detection: {x,y,time}
  let _penUpAt   = 0;      // timestamp of last handled pen-up (dedups native click)
  const MIN_PX   = 5;      // min pixel travel between sampled freehand points
  const TAP_MS   = 600;    // max contact time still counted as a tap
  const TAP_PX   = 15;     // max travel still counted as a tap

  const _xy = (clientX, clientY) => {
    const r = _canvas.getBoundingClientRect();
    return [clientX - r.left, clientY - r.top];
  };
  const _liveRoute = () => {
    if (map.getSource('route')) {
      map.getSource('route').setData(
        routeCoords.length > 1 ? routeCoordsToGeoJSON(routeCoords) : emptyCollection()
      );
    }
  };

  _canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'pen') return;
    _penDown = { x: e.clientX, y: e.clientY, time: Date.now() };

    if (drawing && drawMode === 'free') {
      // One-finger pan is already disabled for the whole Free-mode session
      // (see syncPenPanState in drawing.js), so we just collect the stroke.
      hideCtx(); closeEditDropdown(); closeDrawDropdown();
      pushUndo();
      const [x, y] = _xy(e.clientX, e.clientY);
      const ll = map.unproject([x, y]);
      routeCoords.push([ll.lat, ll.lng]);
      _penStroke = { lastClient: [e.clientX, e.clientY], count: 1 };
      _liveRoute();
      if (window._pdlog) window._pdlog('pen DOWN (free) — stroke start');
    }
  }, { passive: true });

  _canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'pen' || !_penStroke) return;
    const [lx, ly] = _penStroke.lastClient;
    if (Math.hypot(e.clientX - lx, e.clientY - ly) < MIN_PX) return;
    _penStroke.lastClient = [e.clientX, e.clientY];
    const [x, y] = _xy(e.clientX, e.clientY);
    const ll = map.unproject([x, y]);
    routeCoords.push([ll.lat, ll.lng]);
    _penStroke.count++;
    _liveRoute();
  }, { passive: true });

  _canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'pen') return;

    // Finalise a freehand stroke (Free mode)
    if (_penStroke) {
      routeSegments.push(_penStroke.count);  // whole stroke = one undo step
      dotMarkers.push(null);
      routeDistM = calcDist(routeCoords);
      const n = _penStroke.count;
      _penStroke = null;
      _penDown = null;
      _penUpAt = Date.now();
      redrawRoute();
      updateRouteStats();
      document.getElementById('editMenuBtn').style.display = 'flex';
      document.getElementById('editDivider').style.display = 'block';
      if (window._pdlog) window._pdlog(`pen UP — stroke ${n} pts`);
      return;
    }

    // Otherwise: was it a tap? (Snap mode point, add-stop, erase, bbox, etc.)
    if (_penDown) {
      const dt = Date.now() - _penDown.time;
      const moved = Math.hypot(e.clientX - _penDown.x, e.clientY - _penDown.y);
      _penDown = null;
      if (dt <= TAP_MS && moved <= TAP_PX) {
        _penUpAt = Date.now();
        const [x, y] = _xy(e.clientX, e.clientY);
        const lngLat = map.unproject([x, y]);
        hideCtx(); closeEditDropdown(); closeDrawDropdown();
        if (window._pdlog) window._pdlog(`pen TAP -> onMapClick (drawing=${drawing})`);
        onMapClick({ lngLat, originalEvent: e, point: { x, y } });
      }
      // else: it was a drag — MapLibre already panned; nothing to do.
    }
  }, { passive: true });

  _canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerType !== 'pen') return;
    if (_penStroke) {
      // Salvage whatever was drawn before the OS cancelled the stroke.
      routeSegments.push(_penStroke.count);
      dotMarkers.push(null);
      routeDistM = calcDist(routeCoords);
      _penStroke = null;
      redrawRoute();
      updateRouteStats();
    }
    _penDown = null;
  }, { passive: true });

  // Native click (finger / mouse). Skip if we just handled a pen up, so a
  // synthetic click can't double-add a point.
  map.on('click', (e) => {
    if (Date.now() - _penUpAt < 700) return;
    onMapClick(e);
  });
}
map.on("click", () => { hideCtx(); closeEditDropdown(); closeDrawDropdown(); });
map.on("contextmenu", (e) => {
  ctxLatLng = e.lngLat;
  const ctx = document.getElementById("ctxMenu");
  ctx.style.display = "block";
  ctx.style.left = (e.point.x + 8) + "px";
  ctx.style.top  = (e.point.y + 8) + "px";
  const hasRoute = routeCoords.length > 0;
  const redoEl = document.getElementById("ctxRedoFrom");
  redoEl.style.display = hasRoute ? 'block' : 'none';
  redoEl.onclick = () => redoFromHere(e.lngLat.lat, e.lngLat.lng);
  const viaEl = document.getElementById("ctxViaHere");
  viaEl.style.display = (hasRoute && !drawing) ? 'block' : 'none';
  viaEl.onclick = () => routeViaHere(e.lngLat.lat, e.lngLat.lng);
  const clearEl = document.querySelector("#ctxMenu [onclick*='clearDrawing']");
  if (clearEl) clearEl.style.display = hasRoute ? 'block' : 'none';
  document.getElementById("ctxStreetView").onclick = () => {
    window.open(`https://www.google.com/maps?layer=c&cbll=${e.lngLat.lat},${e.lngLat.lng}`, '_blank');
    hideCtx();
  };
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (drawing && drawMode === 'free') undoPoint();
    else undoAction();
  }
  if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z') || (e.shiftKey && e.key === 'z'))) {
    e.preventDefault();
    if (!drawing) redoAction();
  }
});
