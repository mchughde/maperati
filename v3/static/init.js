// ═══ Initialisation (runs last, after all other scripts) ══

// Restore session and render add-stop mode row once map is ready.
// setupMapDataLayers() is already registered via map.on('load') in map-init.js
// and fires before this callback because map-init.js loads first.
map.on('load', () => {
  restoreSession();
  renderAddStopModeRow();
});

// Apple Pencil support for MapLibre GL JS
// MapLibre calls preventDefault() on pointerdown for drag handling, which suppresses
// the browser's synthetic click after a short pencil tap. Detect taps via pointerup
// and call onMapClick directly. Guard against double-fire if click does propagate.
{
  let _pencilDown = null;
  let _pencilTapPending = false;
  const _canvas = map.getCanvas();

  _canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'pen') return;
    _pencilDown = { x: e.clientX, y: e.clientY, time: Date.now() };
    _pencilTapPending = false;
  }, { passive: true });

  _canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'pen' || !_pencilDown) return;
    const dx = e.clientX - _pencilDown.x;
    const dy = e.clientY - _pencilDown.y;
    const dt = Date.now() - _pencilDown.time;
    _pencilDown = null;
    if (dt > 500 || Math.hypot(dx, dy) > 15) return;
    const rect = _canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const lngLat = map.unproject([x, y]);
    _pencilTapPending = true;
    hideCtx(); closeEditDropdown(); closeDrawDropdown();
    onMapClick({ lngLat, originalEvent: e, point: { x, y } });
  }, { passive: true });

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
