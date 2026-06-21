// ═══ Initialisation (runs last, after all other scripts) ══

// Restore session and render add-stop mode row once map is ready.
// setupMapDataLayers() is already registered via map.on('load') in map-init.js
// and fires before this callback because map-init.js loads first.
map.on('load', () => {
  restoreSession();
  renderAddStopModeRow();
});

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
    hideCtx(); closeEditDropdown(); closeDrawDropdown();
    onMapClick({ lngLat, originalEvent, point: { x, y } });
  }

  // Path 1: Safari TouchEvents — touchType:"stylus" identifies Apple Pencil
  _canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { _tapStart = null; return; }
    const t = e.touches[0];
    if (t.touchType !== 'stylus') { _tapStart = null; return; }
    _tapStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    _pencilTapPending = false;
  }, { passive: true });

  _canvas.addEventListener('touchend', (e) => {
    if (!_tapStart || e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    if (t.touchType !== 'stylus') { _tapStart = null; return; }
    const dx = t.clientX - _tapStart.x;
    const dy = t.clientY - _tapStart.y;
    const dt = Date.now() - _tapStart.time;
    _tapStart = null;
    if (dt > 500 || Math.hypot(dx, dy) > 20) return;
    _firePencilClick(t.clientX, t.clientY, e);
  }, { passive: true });

  // Path 2: Standard PointerEvents — pointerType:"pen"
  _canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'pen') return;
    if (!_tapStart) _tapStart = { x: e.clientX, y: e.clientY, time: Date.now() };
    _pencilTapPending = false;
  }, { passive: true });

  _canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'pen' || _pencilTapPending || !_tapStart) return;
    const dx = e.clientX - _tapStart.x;
    const dy = e.clientY - _tapStart.y;
    const dt = Date.now() - _tapStart.time;
    _tapStart = null;
    if (dt > 500 || Math.hypot(dx, dy) > 20) return;
    _firePencilClick(e.clientX, e.clientY, e);
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
