// ═══ Icon factories & marker rendering (MapLibre) ════════

// All elements use anchor:'center' on the Marker so MapLibre places the
// element's centre exactly at the lat/lng — no CSS translate offset needed,
// which eliminates the stray anchor-point dot that appeared beside markers.

function _makePillEl(label, color) {
  const el = document.createElement('div');
  el.style.cssText = `background:${color};color:white;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,sans-serif;white-space:nowrap;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:inline-block;pointer-events:none`;
  el.textContent = label;
  return el;
}

function _makeSplitPillEl() {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;border-radius:20px;overflow:hidden;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);font-size:11px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,sans-serif;pointer-events:none';
  el.innerHTML = '<div style="background:#16a34a;color:white;padding:4px 10px;white-space:nowrap">Start</div><div style="background:#dc2626;color:white;padding:4px 10px;white-space:nowrap">End</div>';
  return el;
}

function _makeCircleEl(num) {
  const el = document.createElement('div');
  el.style.cssText = 'width:26px;height:26px;border-radius:50%;background:#1A1D2E;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.25)';
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="13" fill="#1A1D2E"/><text x="13" y="17.5" text-anchor="middle" font-size="11" font-weight="700" fill="white" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${num}</text></svg>`;
  return el;
}

function _makeCategoryEl(cat) {
  const color = CATEGORIES[cat]?.color || '#6878A0';
  const path  = catIconPath(cat);
  const el = document.createElement('div');
  el.style.cssText = 'width:28px;height:28px;display:flex;align-items:center;justify-content:center';
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1.5"/><g transform="translate(4,4)" fill="${color}">${path}</g></svg>`;
  return el;
}

function renderStopMarkers() {
  Object.values(_stopMarkers).forEach(m => m.remove());
  _stopMarkers = {};
  let num = 1;
  selectedStops.forEach(s => {
    let el;
    if (s.role === 'start')       el = _makePillEl('Start', '#16a34a');
    else if (s.role === 'end')    el = _makePillEl('End',   '#dc2626');
    else if (s.role === 'startend') el = _makeSplitPillEl();
    else if (s.category)          el = _makeCategoryEl(s.category);
    else                          el = _makeCircleEl(num++);

    el.title = s.name;
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (eraseMode) { erasePoint(s.lat, s.lng); return; }
      if (drawing)   { addRoutePoint(s.lat, s.lng); return; }
      new maplibregl.Popup({ closeButton: false, offset: 10 })
        .setLngLat([s.lng, s.lat])
        .setHTML(`<strong>${escH(s.name)}</strong>`)
        .addTo(map);
    });

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([s.lng, s.lat])
      .addTo(map);
    _stopMarkers[s.id] = marker;
  });
  renderRouteEndpoints();
}

function locateStop(i) {
  const s = selectedStops[i];
  if (!s) return;
  map.panTo([s.lng, s.lat]);
  new maplibregl.Popup({ closeButton: false, offset: 10 })
    .setLngLat([s.lng, s.lat])
    .setHTML(`<strong>${escH(s.name)}</strong>`)
    .addTo(map);
}

function renderRouteEndpoints() {
  routeEndpointMarkers.forEach(m => m.remove());
  routeEndpointMarkers = [];
  if (routeCoords.length < 2) return;

  const makeEndpointEl = (label, color) => {
    const el = document.createElement('div');
    el.style.cssText = `background:${color};color:white;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,sans-serif;white-space:nowrap;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:inline-block`;
    el.textContent = label;
    return el;
  };

  const nearStop = (coord) => selectedStops.some(s =>
    (s.lat - coord[0]) ** 2 + (s.lng - coord[1]) ** 2 < 0.000004
  );
  const startCoord = routeCoords[0];
  const endCoord   = routeCoords[routeCoords.length - 1];
  const hasStartStop = selectedStops.some(s => s.role === 'start' || s.role === 'startend') || nearStop(startCoord);
  const hasEndStop   = selectedStops.some(s => s.role === 'end'   || s.role === 'startend') || nearStop(endCoord);

  if (!hasStartStop) {
    routeEndpointMarkers.push(
      new maplibregl.Marker({ element: makeEndpointEl('Start', '#16a34a'), anchor: 'center' })
        .setLngLat([startCoord[1], startCoord[0]])
        .addTo(map)
    );
  }
  if (!hasEndStop) {
    routeEndpointMarkers.push(
      new maplibregl.Marker({ element: makeEndpointEl('End', '#dc2626'), anchor: 'center' })
        .setLngLat([endCoord[1], endCoord[0]])
        .addTo(map)
    );
  }
}
