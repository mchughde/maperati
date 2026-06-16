// ═══ Map init ════════════════════════════════════════════
const map = L.map("map", { zoomDelta: 0.25, zoomSnap: 0.25 }).setView([48.856, 2.352], 13);

const tileOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors", maxZoom: 19
});
const tilePositron = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: "© OpenStreetMap contributors © CARTO", maxZoom: 19
});
const tileDarkMatter = L.tileLayer("https://{s}.forte.tiles.quaidorsay.fr/en/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors — Quai d'Orsay", maxZoom: 19
});
const tileSatellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Tiles © Esri", maxZoom: 19
});
const tileVoyager = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
  attribution: "© OpenStreetMap contributors © CARTO", maxZoom: 19
});
tileDarkMatter.addTo(map);

// Basemap picker
const BasemapPicker = L.Control.extend({
  options: { position: 'topright' },
  onAdd(map) {
    const basemaps = [
      { label: 'OpenStreetMap',   layer: tileOSM },
      { label: 'CartoDB Positron', layer: tilePositron },
      { label: 'CartoDB Voyager', layer: tileVoyager },
      { label: 'OSM Forte EN',    layer: tileDarkMatter },
      { label: 'ESRI Satellite',  layer: tileSatellite },
    ];
    let currentLabel = 'OSM Forte EN';

    const wrap = L.DomUtil.create('div');
    wrap.style.cssText = 'position:relative;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif;margin-top:8px;margin-right:2px';
    L.DomEvent.disableClickPropagation(wrap);
    L.DomEvent.disableScrollPropagation(wrap);

    const btn = document.createElement('button');
    btn.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 11px;background:#fff;border:1.5px solid #D0E3FF;border-radius:8px;font-size:0.74rem;font-weight:600;color:#1A1D2E;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.09);white-space:nowrap;font-family:inherit;line-height:1';
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6878A0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span id="bm-label">OSM Forte EN</span><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="3" stroke-linecap="round"><polyline points="6,9 12,15 18,9"/></svg>`;
    wrap.appendChild(btn);

    const dd = document.createElement('div');
    dd.style.cssText = 'display:none;position:absolute;top:calc(100% + 5px);right:0;background:#fff;border:1.5px solid #D0E3FF;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,0.10);padding:4px;min-width:190px;z-index:9999';
    wrap.appendChild(dd);

    basemaps.forEach(({ label, layer }) => {
      const row = document.createElement('button');
      row.style.cssText = 'display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border:none;border-radius:7px;background:none;font-size:0.77rem;font-weight:500;color:#1A1D2E;cursor:pointer;font-family:inherit;text-align:left';
      const dot = document.createElement('span');
      dot.className = 'bm-dot';
      dot.style.cssText = `width:7px;height:7px;border-radius:50%;flex-shrink:0;transition:background 0.15s;background:${label === currentLabel ? '#2563EB' : '#E5E7EB'}`;
      row.appendChild(dot);
      row.appendChild(document.createTextNode(label));
      row.addEventListener('mouseover', () => { row.style.background = '#F5F8FF'; });
      row.addEventListener('mouseout',  () => { row.style.background = 'none'; });
      row.addEventListener('click', () => {
        basemaps.forEach(b => map.removeLayer(b.layer));
        layer.addTo(map);
        currentLabel = label;
        document.getElementById('bm-label').textContent = label;
        dd.querySelectorAll('.bm-dot').forEach((d, i) => {
          d.style.background = basemaps[i].label === label ? '#2563EB' : '#E5E7EB';
        });
        dd.style.display = 'none';
      });
      dd.appendChild(row);
    });

    btn.addEventListener('click', () => {
      dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', e => {
      if (!wrap.contains(e.target)) dd.style.display = 'none';
    });

    return wrap;
  }
});
new BasemapPicker().addTo(map);

// North arrow
const NorthArrow = L.Control.extend({
  options: { position: 'bottomright' },
  onAdd() {
    const div = L.DomUtil.create('div');
    div.style.cssText = 'background:#fff;border:1.5px solid #D0E3FF;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.09);padding:8px 10px;display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none;user-select:none';
    div.innerHTML = `
      <span style="font-size:0.6rem;font-weight:700;color:#1A1D2E;letter-spacing:0.1em;line-height:1">N</span>
      <svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">
        <path d="M11 1 L15.5 14 L11 11.5 L6.5 14 Z" fill="#1A1D2E"/>
        <path d="M11 29 L15.5 16 L11 18.5 L6.5 16 Z" fill="#D1D5DB"/>
        <circle cx="11" cy="15" r="2.8" fill="none" stroke="#D0E3FF" stroke-width="1.5"/>
        <circle cx="11" cy="15" r="1.2" fill="#1A1D2E"/>
      </svg>`;
    return div;
  }
});
new NorthArrow().addTo(map);

// POI pane sits above the route polyline (z-index 400)
map.createPane('poiPane');
map.getPane('poiPane').style.zIndex = 450;

datasetMarkers.addTo(map);
allMarkersLayer.addTo(map);
osmPoiMarkers.addTo(map);
