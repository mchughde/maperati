// ═══ Read-only embed viewer (embed.html) ══════════════════════════════════
// Renders a route + stops passed in the URL fragment. No editing UI.
// Depends on: maplibre-gl, styles-config.js (getStyleValue, MAP_STYLES),
// state.js (CATEGORIES, catIconPath, toLngLat), share.js (decodeShareState).

(function () {
  const params = new URLSearchParams(location.search);
  const interactive = params.get('static') !== '1';   // ?static=1 → locked view
  const showStats   = params.get('stats')  !== '0';    // ?stats=0  → hide stats pill

  const errBox = document.getElementById('embedError');

  // ── Decode the route from the URL fragment ──────────────────────────────
  let data;
  try {
    const frag = location.hash.replace(/^#/, '');
    if (!frag) throw new Error('No route data in this link.');
    data = decodeShareState(frag);
  } catch (e) {
    errBox.textContent = 'This map link is empty or invalid.';
    errBox.style.display = 'flex';
    return;
  }

  const routeCoords = data.routeCoords;
  const stops = data.stops;

  // ── Map ─────────────────────────────────────────────────────────────────
  const styleId = MAP_STYLES.some(s => s.id === data.styleId) ? data.styleId : MAP_STYLES[0].id;

  const map = new maplibregl.Map({
    container: 'map',
    style: getStyleValue(styleId),
    center: [2.3488, 48.8534],
    zoom: 13,
    interactive,
    attributionControl: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

  map.on('load', () => {
    // Route line
    if (routeCoords.length > 1) {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords.map(toLngLat) } },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#2563EB', 'line-width': 5, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }

    // Stop markers
    renderStops();

    // Fit to route (or to the stops if there is no drawn line)
    const fitCoords = routeCoords.length > 1
      ? routeCoords
      : stops.map(s => [s.lat, s.lng]);
    if (fitCoords.length === 1) {
      map.jumpTo({ center: [fitCoords[0][1], fitCoords[0][0]], zoom: 15 });
    } else if (fitCoords.length > 1) {
      const lats = fitCoords.map(c => c[0]), lngs = fitCoords.map(c => c[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 48, duration: 0 }
      );
    }
  });

  // ── Stat pill ───────────────────────────────────────────────────────────
  if (showStats && routeCoords.length > 1) {
    const R = 6371000;
    let d = 0;
    for (let i = 1; i < routeCoords.length; i++) {
      const [la1, lo1] = routeCoords[i - 1], [la2, lo2] = routeCoords[i];
      const dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
      const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
      d += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    const speeds = { walking: 75, running: 167, hiking: 58, cycling: 250, driving: 1000 };
    const mins = Math.round(d / (speeds[data.travelMode] || 75));
    const pill = document.getElementById('statsPill');
    const title = data.name && data.name !== 'my_walk' ? escH(data.name) + ' · ' : '';
    pill.innerHTML = `${title}<strong>~${(d / 1000).toFixed(2)} km</strong> · ~${mins} min`;
    pill.style.display = 'block';
  }

  // ── Marker factories (mirror the editor's icons.js visuals) ─────────────
  function pillEl(label, color) {
    const el = document.createElement('div');
    el.style.cssText = `background:${color};color:white;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,sans-serif;white-space:nowrap;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25)`;
    el.textContent = label;
    return el;
  }
  function splitPillEl() {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex;border-radius:20px;overflow:hidden;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);font-size:11px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,sans-serif';
    el.innerHTML = '<div style="background:#16a34a;color:white;padding:4px 10px">Start</div><div style="background:#dc2626;color:white;padding:4px 10px">End</div>';
    return el;
  }
  function circleEl(num) {
    const el = document.createElement('div');
    el.style.cssText = 'width:26px;height:26px';
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="13" fill="#1A1D2E"/><text x="13" y="17.5" text-anchor="middle" font-size="11" font-weight="700" fill="white" font-family="-apple-system,sans-serif">${num}</text></svg>`;
    return el;
  }
  function categoryEl(cat) {
    const color = (CATEGORIES[cat] && CATEGORIES[cat].color) || '#6878A0';
    const el = document.createElement('div');
    el.style.cssText = 'width:28px;height:28px';
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1.5"/><g transform="translate(4,4)" fill="${color}">${catIconPath(cat)}</g></svg>`;
    return el;
  }

  function renderStops() {
    let num = 1;
    stops.forEach(s => {
      let el;
      if (s.role === 'start')         el = pillEl('Start', '#16a34a');
      else if (s.role === 'end')      el = pillEl('End', '#dc2626');
      else if (s.role === 'startend') el = splitPillEl();
      else if (s.category)            el = categoryEl(s.category);
      else                            el = circleEl(num++);

      el.title = s.name;
      if (s.name) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', ev => {
          ev.stopPropagation();
          new maplibregl.Popup({ closeButton: false, offset: 10 })
            .setLngLat([s.lng, s.lat])
            .setHTML(`<strong>${escH(s.name)}</strong>`)
            .addTo(map);
        });
      }
      new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([s.lng, s.lat])
        .addTo(map);
    });
  }

  function escH(x) {
    return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
