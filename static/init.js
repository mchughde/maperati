// ═══ Initialisation (runs last, after all other scripts) ══

// Map click and context menu
map.on("click", onMapClick);
map.on("click", () => { hideCtx(); closeEditDropdown(); closeDrawDropdown(); });
map.on("contextmenu", (e) => {
  if (!routeCoords.length) return;
  ctxLatLng = e.latlng;
  const ctx = document.getElementById("ctxMenu");
  ctx.style.display = "block";
  ctx.style.left = (e.originalEvent.offsetX + 8) + "px";
  ctx.style.top  = (e.originalEvent.offsetY + 8) + "px";
  document.getElementById("ctxRedoFrom").onclick =
    () => redoFromHere(e.latlng.lat, e.latlng.lng);
  const viaEl = document.getElementById("ctxViaHere");
  viaEl.style.display = drawing ? 'none' : 'block';
  viaEl.onclick = () => routeViaHere(e.latlng.lat, e.latlng.lng);
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

// Apple Pencil support
// Leaflet captures pointer events for drag detection, which prevents the browser's
// synthetic click from firing after a short pencil tap. We detect short taps ourselves.
{
  let _pencilDown = null;
  const _mc = map.getContainer();

  _mc.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'pen') return;
    _pencilDown = { x: e.clientX, y: e.clientY, time: Date.now() };
  }, { passive: true });

  _mc.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'pen' || !_pencilDown) return;
    const dx = e.clientX - _pencilDown.x;
    const dy = e.clientY - _pencilDown.y;
    const dt = Date.now() - _pencilDown.time;
    _pencilDown = null;
    if (dt > 500 || Math.hypot(dx, dy) > 15) return;
    const point = map.mouseEventToContainerPoint(e);
    const latlng = map.containerPointToLatLng(point);
    hideCtx(); closeEditDropdown(); closeDrawDropdown();
    onMapClick({ latlng, originalEvent: e });
  }, { passive: true });
}

// Restore previous session and render add-stop mode row
restoreSession();
renderAddStopModeRow();
