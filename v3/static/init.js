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

// Apple Pencil support for MapLibre GL JS on Safari/iPadOS
// Two-path approach: Safari fires TouchEvents with touchType:"stylus" AND/OR
// PointerEvents with pointerType:"pen" for Apple Pencil. clickTolerance:15 (in
// map-init.js) widens MapLibre's tap window, but we also intercept directly here
// in case the native click is still suppressed by drag capture.
// _pencilTapPending guards against double-fire if both paths trigger.
{
  let _tapStart = null;
  let _pencilTapPending = false;
  const _canvas = map.getCanvas();

  function _firePencilClick(clientX, clientY, originalEvent) {
    const rect = _canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const lngLat = map.unproject([x, y]);
    _pencilTapPending = true;
    if (window._pdlog) window._pdlog(`** PENCIL handler fired -> onMapClick (drawing=${drawing})`);
    hideCtx(); closeEditDropdown(); closeDrawDropdown();
    onMapClick({ lngLat, originalEvent, point: { x, y } });
  }

  // Path 1: Safari TouchEvents — touchType:"stylus" identifies Apple Pencil.
  // When touchType is NOT 'stylus' we just return without touching _tapStart —
  // the pointerdown path may have already set it and we must not clear it.
  _canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.touchType !== 'stylus') return;
    _tapStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    _pencilTapPending = false;
  }, { passive: true });

  _canvas.addEventListener('touchend', (e) => {
    if (e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    if (t.touchType !== 'stylus') return;  // leave _tapStart for pointerup to handle
    const start = _tapStart;
    _tapStart = null;
    if (_pencilTapPending || !start) return;
    const dt = Date.now() - start.time;
    if (dt > 500 || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 20) return;
    _firePencilClick(t.clientX, t.clientY, e);
  }, { passive: true });

  // Path 2: Standard PointerEvents — pointerType:"pen".
  // Always (re)set _tapStart on pointerdown so each pencil touch gets a fresh baseline.
  _canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'pen') return;
    _tapStart = { x: e.clientX, y: e.clientY, time: Date.now() };
    _pencilTapPending = false;
  }, { passive: true });

  _canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'pen') return;
    const start = _tapStart;
    _tapStart = null;
    if (_pencilTapPending || !start) return;
    const dt = Date.now() - start.time;
    if (dt > 500 || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 20) return;
    _firePencilClick(e.clientX, e.clientY, e);
  }, { passive: true });

  // Clear stale state if the OS cancels the touch (e.g. system gesture)
  _canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'pen') _tapStart = null;
  }, { passive: true });

  // Guard: if we already handled the tap above, skip the native map.click
  map.on("click", (e) => {
    if (_pencilTapPending) { _pencilTapPending = false; return; }
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
