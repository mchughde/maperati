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

// ── Free-mode freehand drawing surface ────────────────────
// A transparent layer sits on top of the map and becomes "live" only while
// Free draw mode is active. While live it owns all pointer input (pen AND
// finger) with touch-action:none, so strokes never collide with MapLibre's
// pan/zoom — which previously caused the map to freeze and Safari to cancel
// touches. In Snap mode (or when not drawing) it's inert (pointer-events:none)
// and MapLibre handles taps and panning normally.
{
  const _canvas  = map.getCanvas();
  const _overlay = document.createElement('div');
  _overlay.id = 'freeDrawLayer';
  _overlay.style.cssText =
    'position:absolute;inset:0;touch-action:none;pointer-events:none;' +
    'background:transparent;cursor:crosshair;z-index:1';
  map.getCanvasContainer().appendChild(_overlay);

  let _stroke = null;   // active stroke: { count }
  let _id     = null;   // active pointerId (ignore extra fingers/palm)
  let _last   = [0, 0]; // last sampled client position
  let _active = 0;      // timestamp of last down/move — used to recover stuck strokes
  const MIN_PX = 4;     // min pixel travel between sampled points

  // Toggled by syncPenPanState() (drawing.js) on every draw / mode change.
  window.syncFreeDrawOverlay = () => {
    const active = drawing && drawMode === 'free';
    _overlay.style.pointerEvents = active ? 'auto' : 'none';
    if (!active) _reset();
  };

  const _unproj = (cx, cy) => {
    const r = _canvas.getBoundingClientRect();
    return map.unproject([cx - r.left, cy - r.top]);
  };
  const _live = () => {
    if (map.getSource('route')) {
      map.getSource('route').setData(
        routeCoords.length > 1 ? routeCoordsToGeoJSON(routeCoords) : emptyCollection()
      );
    }
  };
  // Detach the window listeners and clear stroke state.
  const _reset = () => {
    window.removeEventListener('pointermove', _onMove);
    window.removeEventListener('pointerup', _onEnd);
    window.removeEventListener('pointercancel', _onEnd);
    _stroke = null; _id = null;
  };
  const _onMove = (e) => {
    if (e.pointerId !== _id || !_stroke) return;
    if (Math.hypot(e.clientX - _last[0], e.clientY - _last[1]) < MIN_PX) return;
    _last = [e.clientX, e.clientY];
    _active = Date.now();
    const ll = _unproj(e.clientX, e.clientY);
    routeCoords.push([ll.lat, ll.lng]);
    _stroke.count++;
    _live();
  };
  const _onEnd = (e) => {
    if (e.pointerId !== _id) return;
    const n = _stroke ? _stroke.count : 0;
    if (_stroke) {
      routeSegments.push(_stroke.count);   // whole stroke = one undo step
      dotMarkers.push(null);
      routeDistM = calcDist(routeCoords);
    }
    _reset();
    redrawRoute();
    updateRouteStats();
    document.getElementById('editMenuBtn').style.display = 'flex';
    document.getElementById('editDivider').style.display = 'block';
    if (window._pdlog) window._pdlog(`stroke done — ${n} pts`);
  };

  _overlay.addEventListener('pointerdown', (e) => {
    if (_id !== null) {
      // Another pointer is mid-stroke. Ignore it — unless the previous stroke
      // looks stuck (no activity for >4s), in which case recover from it.
      if (Date.now() - _active < 4000) return;
      _reset();
    }
    _id = e.pointerId;
    _stroke = { count: 1 };
    _last = [e.clientX, e.clientY];
    _active = Date.now();
    hideCtx(); closeEditDropdown(); closeDrawDropdown();
    pushUndo();
    const ll = _unproj(e.clientX, e.clientY);
    routeCoords.push([ll.lat, ll.lng]);
    _live();
    // Listen on window, not the overlay: Safari can drop pointerup on the
    // element after pointer capture, which would wedge the stroke forever.
    window.addEventListener('pointermove', _onMove, { passive: true });
    window.addEventListener('pointerup', _onEnd, { passive: true });
    window.addEventListener('pointercancel', _onEnd, { passive: true });
    if (window._pdlog) window._pdlog(`draw start (${e.pointerType})`);
  });
}

// ── Pen taps in Snap / erase / add-stop modes ─────────────
// Free mode is handled by the overlay above. Here we only convert a quick
// Apple Pencil tap into an onMapClick, because MapLibre doesn't reliably
// synthesise a native click for the Pencil. A pen DRAG is left to MapLibre,
// which pans the map as usual.
{
  const _canvas = map.getCanvas();
  let _down = null;
  let _upAt = 0;
  const TAP_MS = 600, TAP_PX = 15;

  _canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'pen') return;
    if (drawing && drawMode === 'free') return;   // overlay owns Free mode
    _down = { x: e.clientX, y: e.clientY, time: Date.now() };
  }, { passive: true });

  _canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'pen' || !_down) return;
    const dt = Date.now() - _down.time;
    const moved = Math.hypot(e.clientX - _down.x, e.clientY - _down.y);
    _down = null;
    if (dt > TAP_MS || moved > TAP_PX) return;     // a drag — let MapLibre pan
    _upAt = Date.now();
    const r = _canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const lngLat = map.unproject([x, y]);
    hideCtx(); closeEditDropdown(); closeDrawDropdown();
    if (window._pdlog) window._pdlog(`pen TAP -> onMapClick (drawing=${drawing})`);
    onMapClick({ lngLat, originalEvent: e, point: { x, y } });
  }, { passive: true });

  _canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'pen') _down = null;
  }, { passive: true });

  // Native click (finger / mouse). Skip just after a pen tap to avoid double-add.
  map.on('click', (e) => {
    if (Date.now() - _upAt < 700) return;
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
