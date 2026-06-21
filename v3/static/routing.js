// ═══ Segment routing ═════════════════════════════════════

async function routeSegmentToNext(idx, toIdx) {
  if (toIdx === undefined) toIdx = idx + 1;
  if (toIdx >= selectedStops.length) return;
  pushUndo();
  const a = selectedStops[idx], b = selectedStops[toIdx];
  const btn = document.getElementById(`routeBtn_${idx}`);
  if (btn) { btn.textContent = "Routing…"; btn.disabled = true; }
  try {
    const data = await apiSnapSegment(
      [a.lat, a.lng], [b.lat, b.lng],
      TRAVEL_MODES[travelMode].orsProfile,
      TRAVEL_MODES[travelMode].osrmProfile
    );
    if (data.warning) {
      if (btn) { btn.textContent = "Route →"; btn.disabled = false; }
      if (routeCoords.length === 0) {
        routeCoords.push([a.lat, a.lng]);
        routeSegments.push(1);
        redrawRoute();
        document.getElementById("editMenuBtn").style.display = "flex";
        document.getElementById("editDivider").style.display = "block";
      }
      startDraw('auto');
      showToast(`Can't auto-route here. Snap mode started — click along the path to "${b.name}", then click Stop drawing.`);
      return;
    }
    const coords = (data.ok && data.coords.length > 1) ? data.coords : [[a.lat,a.lng],[b.lat,b.lng]];
    const segCoords = routeCoords.length > 0 ? coords.slice(1) : coords;
    routeCoords.push(...segCoords);
    routeSegments.push(segCoords.length);
    dotMarkers.push(null);
    routeDistM += data.distance_m || calcDist(segCoords);
    redrawRoute();
    updateRouteStats();
    syncEditMenu();
    if (routePolyline) fitMapToRoute();
  } catch(e) {}
  if (btn) { btn.textContent = "Route →"; btn.disabled = false; }
}

async function routeLoopClose() {
  const startendStop = selectedStops.find(s => s.role === 'startend');
  if (!startendStop || selectedStops.length < 2) return;
  const lastStop = selectedStops[selectedStops.length - 1];
  if (lastStop === startendStop) return;
  pushUndo();
  const btn = document.getElementById('loopCloseBtn');
  if (btn) { btn.textContent = "Routing…"; btn.disabled = true; }
  try {
    const data = await apiSnapSegment(
      [lastStop.lat, lastStop.lng], [startendStop.lat, startendStop.lng],
      TRAVEL_MODES[travelMode].orsProfile,
      TRAVEL_MODES[travelMode].osrmProfile
    );
    if (data.warning) {
      if (btn) { btn.textContent = "Route to close loop"; btn.disabled = false; }
      startDraw('auto');
      showToast(`Can't auto-route here. Snap mode started — click along the path to "${startendStop.name}", then click Stop drawing.`);
      return;
    }
    const coords = (data.ok && data.coords.length > 1) ? data.coords : [[lastStop.lat, lastStop.lng], [startendStop.lat, startendStop.lng]];
    const segCoords = routeCoords.length > 0 ? coords.slice(1) : coords;
    routeCoords.push(...segCoords);
    routeSegments.push(segCoords.length);
    dotMarkers.push(null);
    routeDistM += data.distance_m || calcDist(segCoords);
    redrawRoute();
    updateRouteStats();
    syncEditMenu();
    if (routePolyline) fitMapToRoute();
  } catch(e) {}
  if (btn) { btn.textContent = "Route to close loop"; btn.disabled = false; }
}

async function autoRouteBetweenStops() {
  if (selectedStops.length < 2) return;
  pushUndo();
  clearDrawing();
  const btn = document.getElementById("routeAllBtn");
  const total = selectedStops.length - 1;

  for (let i = 0; i < selectedStops.length - 1; i++) {
    const a = selectedStops[i], b = selectedStops[i + 1];
    if (btn) { btn.textContent = `Routing ${i + 1} of ${total}…`; btn.disabled = true; }
    try {
      const data = await apiSnapSegment(
        [a.lat, a.lng], [b.lat, b.lng],
        TRAVEL_MODES[travelMode].orsProfile,
        TRAVEL_MODES[travelMode].osrmProfile
      );
      const coords = (data.ok && data.coords.length > 1) ? data.coords : [[a.lat, a.lng], [b.lat, b.lng]];
      const segCoords = i === 0 ? coords : coords.slice(1);
      routeCoords.push(...segCoords);
      routeSegments.push(segCoords.length);
      routeDistM += data.distance_m || calcDist(segCoords);
      dotMarkers.push(null);
    } catch(e) {}
    if (i < total - 1) await new Promise(r => setTimeout(r, 300));
  }

  redrawRoute();
  updateRouteStats();
  syncEditMenu();
  document.getElementById("editMenuBtn").style.display = "flex";
  document.getElementById("editDivider").style.display = "block";
  if (routePolyline) fitMapToRoute();
  if (btn) { btn.textContent = "Route all stops"; btn.disabled = false; }
}
