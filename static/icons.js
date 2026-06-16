// ═══ Icon factories & marker rendering ═══════════════════

function makePillIcon(label, color) {
  const html = `<div style="background:${color};color:white;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,sans-serif;white-space:nowrap;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:inline-block;pointer-events:none">${label}</div>`;
  const anchor = label === "Start" ? [28, 14] : [22, 14];
  return L.divIcon({ html, iconSize: null, iconAnchor: anchor, className: "" });
}

function makeSplitPillIcon() {
  const html = `<div style="display:flex;border-radius:20px;overflow:hidden;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);font-size:11px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,sans-serif;pointer-events:none"><div style="background:#16a34a;color:white;padding:4px 10px;white-space:nowrap">Start</div><div style="background:#dc2626;color:white;padding:4px 10px;white-space:nowrap">End</div></div>`;
  return L.divIcon({ html, iconSize: null, iconAnchor: [45, 14], className: "" });
}

function makeCircleIcon(num) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
    <circle cx="13" cy="13" r="13" fill="#1A1D2E"/>
    <text x="13" y="17.5" text-anchor="middle" font-size="11" font-weight="700" fill="white" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${num}</text>
  </svg>`;
  return L.divIcon({ html: svg, iconSize:[26,26], iconAnchor:[13,13], className:"" });
}

function makeCategoryIcon(cat) {
  const color = CATEGORIES[cat]?.color || '#6878A0';
  const path  = catIconPath(cat);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="13" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1.5"/>
    <g transform="translate(4,4)" fill="${color}">${path}</g>
  </svg>`;
  return L.divIcon({ html: svg, iconSize:[28,28], iconAnchor:[14,14], className:"" });
}

function renderStopMarkers() {
  allMarkersLayer.clearLayers();
  _stopMarkers = {};
  let num = 1;
  selectedStops.forEach(s => {
    const icon = s.role === "start"    ? makePillIcon("Start", "#16a34a")
               : s.role === "end"      ? makePillIcon("End",   "#dc2626")
               : s.role === "startend" ? makeSplitPillIcon()
               : s.category            ? makeCategoryIcon(s.category)
               : makeCircleIcon(num++);
    const marker = L.marker([s.lat, s.lng], { icon })
      .bindPopup(`<strong>${s.name}</strong>`);
    marker.on("click", (e) => {
      if (eraseMode) { L.DomEvent.stopPropagation(e); erasePoint(s.lat, s.lng); return; }
      if (drawing)   { L.DomEvent.stopPropagation(e); addRoutePoint(s.lat, s.lng); }
    });
    marker.addTo(allMarkersLayer);
    _stopMarkers[s.id] = marker;
  });
  renderRouteEndpoints();
}

function locateStop(i) {
  const s = selectedStops[i];
  if (!s) return;
  map.panTo([s.lat, s.lng]);
  const m = _stopMarkers[s.id];
  if (m) m.openPopup();
}

function renderRouteEndpoints() {
  routeEndpointMarkers.forEach(m => map.removeLayer(m));
  routeEndpointMarkers = [];
  if (routeCoords.length < 2) return;

  const makeEndpoint = (coord, color, label) => {
    const anchor = label === "Start" ? [28, 14] : [22, 14];
    const html = `<div style="background:${color};color:white;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,sans-serif;white-space:nowrap;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:inline-block;">${label}</div>`;
    return L.marker(coord, {
      icon: L.divIcon({ html, iconSize: null, iconAnchor: anchor, className: "" }),
      zIndexOffset: 1000
    }).addTo(map);
  };

  const nearStop = (coord) => selectedStops.some(s =>
    (s.lat - coord[0]) ** 2 + (s.lng - coord[1]) ** 2 < 0.000004
  );
  const startCoord = routeCoords[0];
  const endCoord   = routeCoords[routeCoords.length - 1];
  const hasStartStop = selectedStops.some(s => s.role === 'start' || s.role === 'startend') || nearStop(startCoord);
  const hasEndStop   = selectedStops.some(s => s.role === 'end'   || s.role === 'startend') || nearStop(endCoord);
  if (!hasStartStop) routeEndpointMarkers.push(makeEndpoint(startCoord, "#16a34a", "Start"));
  if (!hasEndStop)   routeEndpointMarkers.push(makeEndpoint(endCoord,   "#dc2626", "End"));
}
