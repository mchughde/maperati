// ═══ Discover (Overpass / OSM POI search) ════════════════

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function getBboxString() {
  const b = map.getBounds();
  return `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
}

async function searchOsmCategory(tag, mode, btn) {
  document.querySelectorAll('.osm-cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const [k, v] = tag.split('=');
  const bbox = getBboxString();
  // 'way' mode: nodes + ways (for POIs mapped as building outlines — museums, churches, parks, gardens)
  // 'node' mode: nodes only (for point POIs — cafes, restaurants, monuments, markets)
  const q = (mode === 'way')
    ? `[out:json][timeout:25];(node["${k}"="${v}"](${bbox});way["${k}"="${v}"](${bbox}););out center 50;`
    : `[out:json][timeout:15];node["${k}"="${v}"](${bbox});out 50;`;
  await _runOsmSearch(q);
}


async function _runOsmSearch(query) {
  const msg  = document.getElementById('osmSearchMsg');
  const info = document.getElementById('osmResultsInfo');
  msg.innerHTML = '<div class="msg info"><span class="spinner">⟳</span> Searching…</div>';
  clearOsmResults();
  try {
    let data;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (res.ok) { data = await res.json(); break; }
        if (res.status === 504 || res.status === 429) continue;
        throw new Error(`HTTP ${res.status}`);
      } catch(fetchErr) {
        clearTimeout(timer);
        if (fetchErr.name === 'AbortError') continue;
        throw fetchErr;
      }
    }
    if (!data) throw new Error('All search servers unavailable — try again in a moment');
    const elements = (data.elements || []).filter(el => el.lat != null || el.center);
    if (!elements.length) {
      msg.innerHTML = '<div class="msg warn">No results found in the current map view.</div>';
      return;
    }
    msg.innerHTML = '';
    info.style.display = 'block';
    document.getElementById('osmResultCount').textContent =
      `${elements.length} result${elements.length !== 1 ? 's' : ''} in view`;
    elements.forEach(el => {
      const lat  = el.lat ?? el.center.lat;
      const lon  = el.lon ?? el.center.lon;
      const name = el.tags?.name || el.tags?.['name:en'] || `Place (${el.id})`;
      const m = L.circleMarker([lat, lon], {
        radius: 5, color: '#7C3AED', fillColor: '#8B5CF6', fillOpacity: 0.85, weight: 1.5,
        pane: 'poiPane',
      }).bindTooltip(name);
      m.on('click', ev => {
        L.DomEvent.stopPropagation(ev);
        if (drawing) addRoutePoint(lat, lon);
        else showAddStopPopup(lat, lon, name);
      });
      osmPoiMarkers.addLayer(m);
    });
  } catch(e) {
    msg.innerHTML = `<div class="msg error">${e.message.startsWith('All') ? e.message : 'Search failed — try again in a moment.'}</div>`;
  }
}

function clearOsmResults() {
  osmPoiMarkers.clearLayers();
  document.getElementById('osmResultsInfo').style.display = 'none';
  document.getElementById('osmResultCount').textContent   = '';
}
