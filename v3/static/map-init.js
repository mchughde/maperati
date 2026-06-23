// ═══ Map init (MapLibre GL JS) ════════════════════════════

let currentStyleId = MAP_STYLES[0].id;

const map = new maplibregl.Map({
  container: 'map',
  style: getStyleValue(MAP_STYLES[0].id),
  center: [2.3488, 48.8534],
  zoom: 13,
  preserveDrawingBuffer: true,  // needed for canvas-based image export
  clickTolerance: 15,           // default 3px is too tight for Apple Pencil contact drift
});

// Set up GeoJSON data layers as soon as the initial style has loaded.
// Use once() so this doesn't re-fire if MapLibre emits 'load' again on setStyle().
map.once('load', setupMapDataLayers);

// Custom zoom control with 0.25 step (matches v1 Leaflet zoomDelta)
class ZoomControl {
  onAdd(m) {
    this._map = m;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const mk = (label, title, delta) => {
      const btn = document.createElement('button');
      btn.className = 'maplibregl-ctrl-icon';
      btn.title = title;
      btn.style.cssText = 'font-size:1.1rem;font-weight:700;color:#333;display:flex;align-items:center;justify-content:center;width:29px;height:29px;background:none;border:none;cursor:pointer';
      btn.textContent = label;
      btn.addEventListener('click', () => m.setZoom(m.getZoom() + delta));
      return btn;
    };
    this._container.appendChild(mk('+', 'Zoom in',  0.25));
    this._container.appendChild(mk('−', 'Zoom out', -0.25));
    return this._container;
  }
  onRemove() { this._container.parentNode?.removeChild(this._container); }
}
map.addControl(new ZoomControl(), 'top-left');

// ── Style switcher control ────────────────────────────────

class StyleSwitcher {
  onAdd(m) {
    this._map = m;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl';
    this._container.style.cssText = 'position:relative;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif;margin-top:8px;margin-right:2px';

    const btn = document.createElement('button');
    btn.id = 'bm-btn';
    btn.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 11px;background:#fff;border:1.5px solid #D0E3FF;border-radius:8px;font-size:0.74rem;font-weight:600;color:#1A1D2E;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.09);white-space:nowrap;font-family:inherit;line-height:1';
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6878A0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span id="bm-label">${MAP_STYLES[0].label}</span><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="3" stroke-linecap="round"><polyline points="6,9 12,15 18,9"/></svg>`;
    this._container.appendChild(btn);

    const dd = document.createElement('div');
    dd.id = 'bm-dd';
    dd.style.cssText = 'display:none;position:absolute;top:calc(100% + 5px);right:0;background:#fff;border:1.5px solid #D0E3FF;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,0.10);padding:4px;min-width:190px;z-index:9999';
    this._container.appendChild(dd);

    MAP_STYLES.forEach(style => {
      const row = document.createElement('button');
      row.style.cssText = 'display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border:none;border-radius:7px;background:none;font-size:0.77rem;font-weight:500;color:#1A1D2E;cursor:pointer;font-family:inherit;text-align:left';
      const dot = document.createElement('span');
      dot.className = 'bm-dot';
      dot.style.cssText = `width:7px;height:7px;border-radius:50%;flex-shrink:0;transition:background 0.15s;background:${style.id === currentStyleId ? '#2563EB' : '#E5E7EB'}`;
      row.appendChild(dot);
      row.appendChild(document.createTextNode(style.label));
      row.addEventListener('mouseover', () => { row.style.background = '#F5F8FF'; });
      row.addEventListener('mouseout',  () => { row.style.background = 'none'; });
      row.addEventListener('click', () => {
        switchMapStyle(style.id);
        dd.style.display = 'none';
      });
      dd.appendChild(row);
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', () => { dd.style.display = 'none'; });

    return this._container;
  }
  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
}
map.addControl(new StyleSwitcher(), 'top-right');

// ── North arrow ───────────────────────────────────────────

class NorthArrow {
  onAdd() {
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl north-arrow-ctrl';
    this._container.style.cssText = 'background:#fff;border:1.5px solid #D0E3FF;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.09);padding:8px 10px;display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none;user-select:none';
    this._container.innerHTML = `
      <span style="font-size:0.6rem;font-weight:700;color:#1A1D2E;letter-spacing:0.1em;line-height:1">N</span>
      <svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">
        <path d="M11 1 L15.5 14 L11 11.5 L6.5 14 Z" fill="#1A1D2E"/>
        <path d="M11 29 L15.5 16 L11 18.5 L6.5 16 Z" fill="#D1D5DB"/>
        <circle cx="11" cy="15" r="2.8" fill="none" stroke="#D0E3FF" stroke-width="1.5"/>
        <circle cx="11" cy="15" r="1.2" fill="#1A1D2E"/>
      </svg>`;
    return this._container;
  }
  onRemove() {
    this._container.parentNode.removeChild(this._container);
  }
}
map.addControl(new NorthArrow(), 'bottom-right');

// ── Style switching ───────────────────────────────────────

const _CUSTOM_SOURCES = ['route','route-preview','erase-marker','bbox-rect','print-rect','dataset-dots','osm-pois'];
const _CUSTOM_LAYERS  = ['route-line','route-preview-dot','erase-marker-dot','bbox-rect-fill','bbox-rect-line','print-rect-fill','print-rect-line','dataset-dots-layer','osm-pois-layer'];

function switchMapStyle(styleId) {
  currentStyleId = styleId;
  const style = MAP_STYLES.find(s => s.id === styleId);
  document.getElementById('bm-label').textContent = style.label;
  document.querySelectorAll('.bm-dot').forEach((dot, i) => {
    dot.style.background = MAP_STYLES[i].id === styleId ? '#2563EB' : '#E5E7EB';
  });

  // Re-render DOM markers once style settles.
  // Registered before setStyle() to avoid any race with style.load firing early.
  map.once('style.load', () => {
    renderStopMarkers();
  });

  map.setStyle(getStyleValue(styleId), {
    transformStyle: (prevStyle, nextStyle) => {
      // Vector style JSONs (OpenFreeMap) embed center/zoom/bearing/pitch.
      // Spreading them into the result causes MapLibre to jump the camera.
      // Delete them so the current view is preserved.
      const next = { ...nextStyle };
      delete next.center; delete next.zoom; delete next.bearing; delete next.pitch;

      const keepSources = {};
      const keepLayers  = [];
      if (prevStyle) {
        Object.entries(prevStyle.sources || {}).forEach(([id, src]) => {
          if (_CUSTOM_SOURCES.includes(id)) keepSources[id] = src;
        });
        (prevStyle.layers || []).forEach(layer => {
          if (_CUSTOM_LAYERS.includes(layer.id)) keepLayers.push(layer);
        });
      }
      return {
        ...next,
        sources: { ...next.sources, ...keepSources },
        layers:  [ ...(next.layers || []), ...keepLayers ],
      };
    },
  });
}

// ── GeoJSON sources and layers (added after style loads) ──

function setupMapDataLayers() {
  // Route line
  if (!map.getSource('route')) {
    map.addSource('route', { type: 'geojson', data: emptyCollection() });
  }
  if (!map.getLayer('route-line')) {
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      paint: { 'line-color': '#2563EB', 'line-width': 5, 'line-opacity': 0.9 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
  }

  // Snap-preview dot (temporary blue dot while snap API is in flight)
  if (!map.getSource('route-preview')) {
    map.addSource('route-preview', { type: 'geojson', data: emptyCollection() });
  }
  if (!map.getLayer('route-preview-dot')) {
    map.addLayer({
      id: 'route-preview-dot',
      type: 'circle',
      source: 'route-preview',
      paint: { 'circle-radius': 5, 'circle-color': '#2563EB', 'circle-opacity': 0.9 },
    });
  }

  // Erase-start marker dot
  if (!map.getSource('erase-marker')) {
    map.addSource('erase-marker', { type: 'geojson', data: emptyCollection() });
  }
  if (!map.getLayer('erase-marker-dot')) {
    map.addLayer({
      id: 'erase-marker-dot',
      type: 'circle',
      source: 'erase-marker',
      paint: { 'circle-radius': 8, 'circle-color': '#B85C38', 'circle-opacity': 0.9 },
    });
  }

  // Bbox filter rectangle
  if (!map.getSource('bbox-rect')) {
    map.addSource('bbox-rect', { type: 'geojson', data: emptyPolygon() });
  }
  if (!map.getLayer('bbox-rect-fill')) {
    map.addLayer({ id: 'bbox-rect-fill', type: 'fill', source: 'bbox-rect', paint: { 'fill-color': '#2563EB', 'fill-opacity': 0.05 } });
    map.addLayer({ id: 'bbox-rect-line', type: 'line', source: 'bbox-rect', paint: { 'line-color': '#2563EB', 'line-width': 2, 'line-dasharray': [6, 4] } });
  }

  // Print area rectangle
  if (!map.getSource('print-rect')) {
    map.addSource('print-rect', { type: 'geojson', data: emptyPolygon() });
  }
  if (!map.getLayer('print-rect-fill')) {
    map.addLayer({ id: 'print-rect-fill', type: 'fill', source: 'print-rect', paint: { 'fill-color': '#2563EB', 'fill-opacity': 0.06 } });
    map.addLayer({ id: 'print-rect-line', type: 'line', source: 'print-rect', paint: { 'line-color': '#2563EB', 'line-width': 2, 'line-dasharray': [6, 4] } });
  }

  // Imported dataset dots
  if (!map.getSource('dataset-dots')) {
    map.addSource('dataset-dots', { type: 'geojson', data: emptyCollection() });
  }
  if (!map.getLayer('dataset-dots-layer')) {
    map.addLayer({
      id: 'dataset-dots-layer',
      type: 'circle',
      source: 'dataset-dots',
      paint: { 'circle-radius': 5, 'circle-color': '#f97316', 'circle-stroke-color': '#ea580c', 'circle-stroke-width': 1.5, 'circle-opacity': 0.85 },
    });
  }

  // Overpass OSM POIs (purple)
  if (!map.getSource('osm-pois')) {
    map.addSource('osm-pois', { type: 'geojson', data: emptyCollection() });
  }
  if (!map.getLayer('osm-pois-layer')) {
    map.addLayer({
      id: 'osm-pois-layer',
      type: 'circle',
      source: 'osm-pois',
      paint: { 'circle-radius': 5, 'circle-color': '#8B5CF6', 'circle-stroke-color': '#7C3AED', 'circle-stroke-width': 1.5, 'circle-opacity': 0.85 },
    });
  }

  // Route line click — show distance popup
  map.off('click', 'route-line', _onRouteLineClick);
  map.on('click', 'route-line', _onRouteLineClick);

  // Dataset dots click
  map.off('click', 'dataset-dots-layer', _onDatasetDotClick);
  map.on('click', 'dataset-dots-layer', _onDatasetDotClick);

  // OSM POIs click
  map.off('click', 'osm-pois-layer', _onOsmPoiClick);
  map.on('click', 'osm-pois-layer', _onOsmPoiClick);

  // Hover cursors
  const hoverLayers = ['dataset-dots-layer', 'osm-pois-layer', 'route-line'];
  hoverLayers.forEach(id => {
    map.on('mouseenter', id, () => { if (!drawing && !eraseMode) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', id, () => { if (!drawing && !eraseMode) map.getCanvas().style.cursor = ''; });
  });

  // Restore route and markers after style switch
  if (routeCoords.length > 1) {
    map.getSource('route').setData(routeCoordsToGeoJSON(routeCoords));
  }
  if (bboxBounds) {
    map.getSource('bbox-rect').setData(boundsToPolygon(bboxBounds));
  }
  if (printAreaBounds) {
    map.getSource('print-rect').setData(boundsToPolygon(printAreaBounds));
  }
}

function _onRouteLineClick(e) {
  if (drawing || eraseMode) return;
  e.preventDefault();
  const dists = cumDists(routeCoords);
  const idx = findNearestRouteIndex(e.lngLat.lat, e.lngLat.lng);
  const d = dists[idx];
  const totalD = dists[dists.length - 1];
  const fmt = m => m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${Math.round(m)} m`;
  new maplibregl.Popup({ closeButton: false, className: 'route-dist-popup' })
    .setLngLat(e.lngLat)
    .setHTML(`<span class="rdp-from">${fmt(d)} from start</span><span class="rdp-sep"> · </span><span class="rdp-to">${fmt(totalD - d)} to end</span>`)
    .addTo(map);
}

function _onDatasetDotClick(e) {
  e.preventDefault();
  if (!e.features.length) return;
  const p = e.features[0].properties;
  if (drawing) { addRoutePoint(p.lat, p.lng); }
  else if (!bboxMode) { addStop(p.name, p.lat, p.lng, p.id); }
}

function _onOsmPoiClick(e) {
  e.preventDefault();
  if (!e.features.length) return;
  const p = e.features[0].properties;
  if (drawing) addRoutePoint(p.lat, p.lng);
  else showAddStopPopup(p.lat, p.lng, p.name);
}

// ── GeoJSON helpers ───────────────────────────────────────

function emptyPolygon() {
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } };
}

function emptyCollection() {
  return { type: 'FeatureCollection', features: [] };
}

function routeCoordsToGeoJSON(coords) {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords.map(toLngLat) },
  };
}

function boundsToPolygon(b) {
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[b.west,b.south],[b.east,b.south],[b.east,b.north],[b.west,b.north],[b.west,b.south]]],
    },
  };
}

function setPreviewDot(lat, lng) {
  if (!map.getSource('route-preview')) return;
  map.getSource('route-preview').setData({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] } }],
  });
}

function clearPreviewDot() {
  if (!map.getSource('route-preview')) return;
  map.getSource('route-preview').setData(emptyCollection());
}

function setEraseMarkerDot(lat, lng) {
  if (!map.getSource('erase-marker')) return;
  map.getSource('erase-marker').setData({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] } }],
  });
}

function clearEraseMarkerDot() {
  if (!map.getSource('erase-marker')) return;
  map.getSource('erase-marker').setData(emptyCollection());
}
