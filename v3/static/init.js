// ═══ Initialisation (runs last, after all other scripts) ══

// Restore session and render add-stop mode row once map is ready.
// setupMapDataLayers() is already registered via map.on('load') in map-init.js
// and fires before this callback because map-init.js loads first.
map.on('load', () => {
  restoreSession();
  renderAddStopModeRow();
});

// ── Context menu (right-click on desktop, long-press on touch) ────────────
// Both entry points call showCtxMenu(lngLat, point). On the iPad there is no
// right-click, so a finger long-press opens the same menu (Street View, Redo
// route from here, Route via here, Clear).
function showCtxMenu(lngLat, point) {
  ctxLatLng = lngLat;
  const ctx = document.getElementById("ctxMenu");
  ctx.style.display = "block";
  ctx.style.left = (point.x + 8) + "px";
  ctx.style.top  = (point.y + 8) + "px";
  const hasRoute = routeCoords.length > 0;
  const redoEl = document.getElementById("ctxRedoFrom");
  redoEl.style.display = hasRoute ? 'block' : 'none';
  redoEl.onclick = () => redoFromHere(lngLat.lat, lngLat.lng);
  const viaEl = document.getElementById("ctxViaHere");
  viaEl.style.display = (hasRoute && !drawing) ? 'block' : 'none';
  viaEl.onclick = () => routeViaHere(lngLat.lat, lngLat.lng);
  const clearEl = document.querySelector("#ctxMenu [onclick*='clearDrawing']");
  if (clearEl) clearEl.style.display = hasRoute ? 'block' : 'none';
  document.getElementById("ctxStreetView").onclick = () => {
    window.open(`https://www.google.com/maps?layer=c&cbll=${lngLat.lat},${lngLat.lng}`, '_blank');
    hideCtx();
  };
}
map.on("contextmenu", (e) => showCtxMenu(e.lngLat, e.point));

// ── Touch / Apple Pencil input ────────────────────────────
// Drawing is tap-based: each tap adds a point (Snap = snapped, Free = straight
// line), a drag pans. Safari doesn't reliably synthesise a click for the Apple
// Pencil, so we detect a quick pen tap and route it through onMapClick. A
// finger held still for ~500 ms opens the context menu (the touch equivalent of
// a right-click). The pen path is unchanged. (Freehand drag-drawing was
// abandoned — iPad Safari drops pointermove mid-stroke; see git history.)
{
  const _canvas = map.getCanvas();
  let _down = null;
  let _upAt = 0;          // time of last pen tap / long-press, to suppress the trailing click
  let _lpTimer = null;
  let _longPressed = false;
  let _pointers = 0;
  const TAP_MS = 600, TAP_PX = 15, LP_MS = 500, LP_PX = 12;
  const cancelLongPress = () => { if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; } };

  _canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'pen' && e.pointerType !== 'touch') return;
    _pointers++;
    cancelLongPress();
    if (_pointers > 1) { _down = null; return; }   // pinch / multi-touch — no tap, no long-press
    _down = { x: e.clientX, y: e.clientY, time: Date.now() };
    _longPressed = false;
    if (e.pointerType === 'touch') {               // finger long-press → context menu
      const sx = e.clientX, sy = e.clientY;
      _lpTimer = setTimeout(() => {
        _lpTimer = null; _longPressed = true; _upAt = Date.now(); _down = null;
        const r = _canvas.getBoundingClientRect();
        const x = sx - r.left, y = sy - r.top;
        closeEditDropdown(); closeDrawDropdown();
        showCtxMenu(map.unproject([x, y]), { x, y });
      }, LP_MS);
    }
  }, { passive: true });

  _canvas.addEventListener('pointermove', (e) => {
    if (_down && Math.hypot(e.clientX - _down.x, e.clientY - _down.y) > LP_PX) cancelLongPress();
  }, { passive: true });

  _canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'pen' && e.pointerType !== 'touch') return;
    _pointers = Math.max(0, _pointers - 1);
    cancelLongPress();
    if (_longPressed) { _longPressed = false; _down = null; _upAt = Date.now(); return; }  // menu opened
    if (e.pointerType !== 'pen' || !_down) { _down = null; return; }   // finger taps go via map 'click'
    const dt = Date.now() - _down.time;
    const moved = Math.hypot(e.clientX - _down.x, e.clientY - _down.y);
    _down = null;
    if (dt > TAP_MS || moved > TAP_PX) return;     // a pen drag — let MapLibre pan
    _upAt = Date.now();
    const r = _canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    hideCtx(); closeEditDropdown(); closeDrawDropdown();
    onMapClick({ lngLat: map.unproject([x, y]), originalEvent: e, point: { x, y } });
  }, { passive: true });

  _canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerType !== 'pen' && e.pointerType !== 'touch') return;
    _pointers = Math.max(0, _pointers - 1);
    cancelLongPress();
    _down = null; _longPressed = false;
  }, { passive: true });

  // Native click (finger / mouse). Skip the trailing click just after a pen tap
  // or long-press; otherwise dismiss any open menu/dropdowns and dispatch.
  map.on('click', (e) => {
    if (Date.now() - _upAt < 700) return;
    hideCtx(); closeEditDropdown(); closeDrawDropdown();
    onMapClick(e);
  });
}

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
