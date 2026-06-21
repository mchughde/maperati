// ═══ Initialisation (runs last, after all other scripts) ══

// Restore session and render add-stop mode row once map is ready.
// setupMapDataLayers() is already registered via map.on('load') in map-init.js
// and fires before this callback because map-init.js loads first.
map.on('load', () => {
  restoreSession();
  renderAddStopModeRow();
});

map.on("click", onMapClick);
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
