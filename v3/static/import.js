// ═══ File import, filtering, bbox area ═══════════════════

// ── Drop zone ─────────────────────────────────────────────

const dropZone = document.getElementById("dropZone");
dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", e => {
  e.preventDefault(); dropZone.classList.remove("dragover");
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

async function handleFile(file) {
  if (!file) return;
  document.getElementById("fileLabel").textContent = file.name;
  document.getElementById("datasetMsg").innerHTML = '<div class="msg info"><span class="spinner">⟳</span> Loading…</div>';

  const ext = file.name.split('.').pop().toLowerCase();
  document.getElementById("delimRow").style.display = ext === 'csv' ? "block" : "none";

  if      (ext === 'csv')     await loadCSV(file);
  else if (ext === 'gpx')     await loadGPX(file);
  else if (ext === 'kml')     await loadKML(file);
  else if (ext === 'geojson') await loadGeoJSONFile(file);
  else if (ext === 'json')    await loadJSONFile(file);
  else document.getElementById("datasetMsg").innerHTML =
    '<div class="msg error">Unsupported format. Use CSV, GPX, KML, GeoJSON, or a Maperati session file.</div>';
}

async function loadCSV(file) {
  const delimiter = document.getElementById("delimiter").value;
  try {
    const text = await file.text();
    const data = parseCSVClient(text, delimiter);
    if (!data.stops.length) throw new Error("No rows with coordinates found. Check the delimiter setting.");
    onDataLoaded(data.stops, data.columns);
  } catch(e) {
    document.getElementById("datasetMsg").innerHTML = `<div class="msg error">Error: ${e.message}</div>`;
  }
}

function parseCSVClient(text, delimiter) {
  // Split into lines, handle \r\n and \n
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return { stops: [], columns: [], count: 0 };

  // Simple CSV parser — handles quoted fields
  function parseLine(line) {
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === delimiter && !inQ) { fields.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  }

  const headers = parseLine(lines[0]);

  function findCol(patterns) {
    for (const p of patterns)
      for (const h of headers)
        if (h.toLowerCase().includes(p.toLowerCase())) return h;
    return null;
  }

  let latCol  = findCol(['latitude', 'lat', ' y']);
  let lngCol  = findCol(['longitude', 'lng', 'lon', ' x']);
  let geoCol  = (!latCol || !lngCol) ? findCol(['geo shape', 'geometry', 'geom', 'shape']) : null;
  let ptCol   = (!latCol || !lngCol) ? findCol(['geo point', 'geopoint', 'point'])          : null;
  const nameCol = findCol(['name', 'nom', 'title', 'label', 'libelle']);
  const idCol   = findCol(['id', 'identifiant', 'code']);

  function centroidFromGeoJSON(str) {
    try {
      const geo = JSON.parse(str);
      if (geo.type === 'Point') return [geo.coordinates[1], geo.coordinates[0]];
      const coords = [];
      function collect(v) {
        if (Array.isArray(v) && typeof v[0] === 'number') coords.push(v);
        else if (Array.isArray(v)) v.forEach(collect);
      }
      collect(geo.coordinates || []);
      if (!coords.length) return null;
      return [
        coords.reduce((s, c) => s + c[1], 0) / coords.length,
        coords.reduce((s, c) => s + c[0], 0) / coords.length,
      ];
    } catch { return null; }
  }

  const stops = [];
  let seq = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseLine(lines[i]);
    const row  = {};
    headers.forEach((h, j) => { row[h] = vals[j] || ''; });

    let lat = null, lng = null;

    if (latCol && lngCol) {
      lat = parseFloat(row[latCol]);
      lng = parseFloat(row[lngCol]);
      if (isNaN(lat) || isNaN(lng)) { lat = null; lng = null; }
    }
    if (lat === null && ptCol) {
      const parts = (row[ptCol] || '').trim().split(/[,\s]+/);
      if (parts.length === 2) { lat = parseFloat(parts[0]); lng = parseFloat(parts[1]); }
      if (isNaN(lat) || isNaN(lng)) { lat = null; lng = null; }
    }
    if (lat === null && geoCol) {
      const res = centroidFromGeoJSON(row[geoCol] || '');
      if (res) { [lat, lng] = res; }
    }
    if (lat === null || lng === null) continue;

    stops.push({
      id:   idCol ? String(row[idCol] || seq) : String(seq),
      name: (nameCol ? row[nameCol] : '') || `Stop ${seq + 1}`,
      lat, lng,
    });
    seq++;
  }

  const visibleCols = headers.filter(h => !['geo shape','geometry','geom','shape'].includes(h.toLowerCase())).slice(0, 8);
  return { stops, columns: visibleCols, count: stops.length };
}

async function loadJSONFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.v === 1 && (data.routeCoords || data.stops)) {
      loadSessionFromData(data);
    } else {
      await loadGeoJSONFile(file, data);
    }
  } catch(e) {
    document.getElementById("datasetMsg").innerHTML = '<div class="msg error">Could not parse file.</div>';
  }
}

function loadSessionFromData(data) {
  clearDrawing();
  clearStops();
  clearElevation();
  if (data.customIdSeq) customIdSeq = data.customIdSeq;
  if (data.walkName) document.getElementById('exportName').value = data.walkName;
  if (data.routeCoords?.length > 1) {
    routeCoords   = data.routeCoords;
    routeSegments = data.routeSegments || [data.routeCoords.length];
    routeDistM    = data.routeDistM   || calcDist(routeCoords);
    dotMarkers    = routeSegments.map(() => null);
    redrawRoute();
    updateRouteStats();
  }
  if (data.stops?.length) {
    selectedStops = data.stops;
    renderStops();
  }
  if (data.mapCenter && data.mapZoom) {
    map.jumpTo({ center: [data.mapCenter[1], data.mapCenter[0]], zoom: data.mapZoom });
  } else if (routeCoords.length > 1) {
    fitMapToRoute(40);
  }
  syncEditMenu();
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  document.getElementById('datasetMsg').innerHTML = '<div class="msg info">Session restored.</div>';
}

async function loadGPX(file) {
  try {
    const doc = new DOMParser().parseFromString(await file.text(), "application/xml");
    let seq = 0;

    const stops = [];
    doc.querySelectorAll("wpt").forEach(wpt => {
      const lat = parseFloat(wpt.getAttribute("lat"));
      const lng = parseFloat(wpt.getAttribute("lon"));
      const name = wpt.querySelector("name")?.textContent.trim() || `Waypoint ${++seq}`;
      if (!isNaN(lat) && !isNaN(lng)) stops.push({ id:`gpx_${stops.length}`, name, lat, lng });
    });

    if (!stops.length) {
      doc.querySelectorAll("rtept").forEach(pt => {
        const lat = parseFloat(pt.getAttribute("lat"));
        const lng = parseFloat(pt.getAttribute("lon"));
        const name = pt.querySelector("name")?.textContent.trim();
        if (!isNaN(lat) && !isNaN(lng) && name)
          stops.push({ id:`gpx_${stops.length}`, name, lat, lng });
      });
    }

    const trackPts = [];
    const trackEle = [];
    doc.querySelectorAll("trkpt").forEach(pt => {
      const lat = parseFloat(pt.getAttribute("lat"));
      const lng = parseFloat(pt.getAttribute("lon"));
      if (!isNaN(lat) && !isNaN(lng)) {
        trackPts.push([lat, lng]);
        const ele = parseFloat(pt.querySelector("ele")?.textContent);
        trackEle.push(isNaN(ele) ? null : ele);
      }
    });
    if (!trackPts.length) {
      doc.querySelectorAll("rtept").forEach(pt => {
        const lat = parseFloat(pt.getAttribute("lat"));
        const lng = parseFloat(pt.getAttribute("lon"));
        if (!isNaN(lat) && !isNaN(lng)) {
          trackPts.push([lat, lng]);
          const ele = parseFloat(pt.querySelector("ele")?.textContent);
          trackEle.push(isNaN(ele) ? null : ele);
        }
      });
    }

    if (trackPts.length > 1) {
      clearDrawing();
      routeCoords = trackPts;
      routeSegments = [trackPts.length];
      routeDistM = calcDist(trackPts);
      redrawRoute();
      updateRouteStats();
      dotMarkers = [null];
      document.getElementById("editMenuBtn").style.display = "flex";
      document.getElementById("editDivider").style.display = "block";
      fitMapToRoute(40);

      const validEle = trackEle.filter(e => e !== null);
      if (validEle.length === trackPts.length) {
        elevationData   = trackEle;
        elevationDists  = cumDists(trackPts);
        elevationCoords = trackPts.slice();
      }
    }

    if (stops.length > 0) {
      onDataLoaded(stops, []);
      stops.forEach(s => { if (!selectedStops.find(x => x.id === s.id)) selectedStops.push(s); });
      if (routeCoords.length > 1) {
        orderStopsByRoute();
        renderStops();
      } else {
        renderStops();
        await autoRouteBetweenStops();
      }
    } else if (trackPts.length > 1) {
      document.getElementById("datasetMsg").innerHTML =
        `<div class="msg info">Track loaded: ${(calcDist(trackPts)/1000).toFixed(2)} km · ${trackPts.length} points. No named waypoints found.</div>`;
      document.getElementById("dataInfo").style.display = "none";
    } else {
      throw new Error("No waypoints or track points found in GPX file.");
    }
  } catch(e) {
    document.getElementById("datasetMsg").innerHTML = `<div class="msg error">GPX error: ${e.message}</div>`;
  }
}

async function loadKML(file) {
  try {
    const doc = new DOMParser().parseFromString(await file.text(), "application/xml");
    const stops = []; let seq = 0;
    doc.querySelectorAll("Placemark").forEach(pm => {
      const name = pm.querySelector("name")?.textContent.trim() || `Place ${++seq}`;
      const coordEl = pm.querySelector("Point coordinates") || pm.querySelector("Point > coordinates");
      if (!coordEl) return;
      const parts = coordEl.textContent.trim().split(",");
      if (parts.length < 2) return;
      const lng = parseFloat(parts[0]), lat = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng)) stops.push({ id:`kml_${stops.length}`, name, lat, lng });
    });
    if (!stops.length) throw new Error("No point Placemarks found in KML file.");
    onDataLoaded(stops, []);
    stops.forEach(s => { if (!selectedStops.find(x => x.id === s.id)) selectedStops.push(s); });
    renderStops();
    await autoRouteBetweenStops();
  } catch(e) {
    document.getElementById("datasetMsg").innerHTML = `<div class="msg error">KML error: ${e.message}</div>`;
  }
}

async function loadGeoJSONFile(file, parsedData) {
  try {
    const data = parsedData || JSON.parse(await file.text());
    const features = data.type === "FeatureCollection" ? data.features :
                     data.type === "Feature" ? [data] : [];
    const stops = []; let seq = 0;
    features.forEach(f => {
      if (f.geometry?.type !== "Point") return;
      const [lng, lat] = f.geometry.coordinates;
      const p = f.properties || {};
      const name = p.name || p.nom || p.title || p.label || p.Name || `Point ${++seq}`;
      if (!isNaN(lat) && !isNaN(lng))
        stops.push({ id:`gj_${stops.length}`, name:String(name), lat, lng, _row: p });
    });
    if (!stops.length) throw new Error("No Point features found in GeoJSON.");
    const cols = Object.keys(stops[0]._row || {}).slice(0, 8);
    onDataLoaded(stops, cols);
    stops.forEach(s => { if (!selectedStops.find(x => x.id === s.id)) selectedStops.push(s); });
    renderStops();
    await autoRouteBetweenStops();
  } catch(e) {
    document.getElementById("datasetMsg").innerHTML = `<div class="msg error">GeoJSON error: ${e.message}</div>`;
  }
}

function parseStopsFromRows(rows, cols) {
  const find = patterns => cols.find(c => patterns.some(p => c.toLowerCase().includes(p.toLowerCase())));
  let latCol = find(["latitude","lat"," y"]);
  let lngCol = find(["longitude","lng","lon"," x"]);
  let nameCol = find(["name","nom","title","label","libelle"]);
  let idCol   = find(["id","identifiant","code"]);
  let geoPointCol = find(["geo point","geopoint"]);

  const stops = [];
  rows.forEach((row, i) => {
    let lat = null, lng = null;
    if (latCol && lngCol) {
      lat = parseFloat(row[latCol]);
      lng = parseFloat(row[lngCol]);
    }
    if ((isNaN(lat) || lat == null) && geoPointCol) {
      const val = String(row[geoPointCol] || "").trim();
      const parts = val.split(/[,\s]+/);
      if (parts.length === 2) { lat = parseFloat(parts[0]); lng = parseFloat(parts[1]); }
    }
    if (isNaN(lat) || isNaN(lng) || lat == null) return;
    stops.push({
      id:   idCol ? String(row[idCol]) : String(i),
      name: nameCol ? String(row[nameCol] || `Stop ${i+1}`) : `Stop ${i+1}`,
      lat, lng, _row: row,
    });
  });
  return stops;
}

function onDataLoaded(stops, cols) {
  datasetStops = stops;
  document.getElementById("dataInfo").style.display = "block";
  document.getElementById("dataCount").textContent = `${stops.length.toLocaleString()} locations loaded`;
  document.getElementById("colTags").innerHTML = cols.map(c => `<span class="col-tag">${c}</span>`).join("");
  document.getElementById("searchRow").style.display = "block";
  document.getElementById("areaFilterRow").style.display = "block";
  document.getElementById("poiToggleRow").style.display = "block";
  document.getElementById("datasetMsg").innerHTML = "";
  detectArrondissements(stops);
  applyFilters();
  fitMapToStops(stops);
}

function detectArrondissements(stops) {
  const arr = document.getElementById("arrFilter");
  const sel = document.getElementById("arrSelect");
  const codes = new Set();
  stops.forEach(s => {
    const row = s._row || {};
    Object.values(row).forEach(v => {
      const m = String(v).match(/^(750[0-2]\d)$/);
      if (m) codes.add(m[1]);
    });
  });
  if (codes.size > 1) {
    sel.innerHTML = '<option value="">All arrondissements</option>';
    [...codes].sort().forEach(c => {
      const n = parseInt(c) - 75000;
      sel.innerHTML += `<option value="${c}">${n}${n===1?"er":"ème"} (${c})</option>`;
    });
    arr.style.display = "block";
  } else {
    arr.style.display = "none";
  }
}

// ── Filtering ─────────────────────────────────────────────

function applyFilters() {
  const arr    = document.getElementById("arrSelect").value;
  const search = document.getElementById("nameSearch").value.trim().toLowerCase();

  filteredStops = datasetStops.filter(s => {
    if (arr) {
      const row = s._row || {};
      const inArr = Object.values(row).some(v => String(v).trim() === arr);
      if (!inArr) return false;
    }
    if (search && !s.name.toLowerCase().includes(search)) return false;
    if (bboxBounds && !boundsContains(bboxBounds, s.lat, s.lng)) return false;
    return true;
  });

  const fc = document.getElementById("filteredCount");
  if (arr || search || bboxBounds) {
    fc.style.display = "block";
    fc.textContent = `${filteredStops.length} of ${datasetStops.length} locations shown`;
  } else {
    fc.style.display = "none";
  }

  renderDatasetMarkers();
  renderDatasetList();
}

function renderDatasetMarkers() {
  if (!map.getSource('dataset-dots')) return;
  const features = filteredStops.map(s => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    properties: { name: s.name, lat: s.lat, lng: s.lng, id: s.id },
  }));
  map.getSource('dataset-dots').setData({ type: 'FeatureCollection', features });
}

function renderDatasetList() { /* list removed — POIs visible as map dots */ }

function escQ(s) { return s.replace(/'/g, "\\'").replace(/"/g, "&quot;"); }
function escH(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

// ── Bbox area filter ──────────────────────────────────────

let _printAreaCornerMarker = null;

function toggleBboxMode() {
  bboxMode = !bboxMode;
  const btn = document.getElementById("bboxBtn");
  if (bboxMode) {
    btn.textContent = "Click first corner…";
    btn.classList.add("active");
    map.getCanvas().style.cursor = "crosshair";
    bboxCorner1 = null;
  } else {
    btn.textContent = "Filter by area";
    btn.classList.remove("active");
    map.getCanvas().style.cursor = "";
  }
}

function clearBbox() {
  bboxBounds = null; bboxCorner1 = null;
  if (map.getSource('bbox-rect')) map.getSource('bbox-rect').setData(emptyPolygon());
  document.getElementById("clearBboxBtn").style.display = "none";
  document.getElementById("bboxBtn").textContent = "Filter by area";
  applyFilters();
}

// ── Print area ────────────────────────────────────────────

function _makePrintCornerEl() {
  const el = document.createElement('div');
  el.style.cssText = 'width:10px;height:10px;border-radius:50%;background:#2563EB;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.2);transform:translate(-5px,-5px)';
  return el;
}

function togglePrintAreaMode() {
  printAreaMode = !printAreaMode;
  const btn = document.getElementById('printAreaBtn');
  if (printAreaMode) {
    btn.textContent = 'Click first corner…';
    btn.classList.add('active');
    map.getCanvas().style.cursor = 'crosshair';
    printAreaCorner1 = null;
    if (_printAreaCornerMarker) { _printAreaCornerMarker.remove(); _printAreaCornerMarker = null; }
  } else {
    btn.textContent = 'Set image area';
    btn.classList.remove('active');
    map.getCanvas().style.cursor = '';
    if (_printAreaCornerMarker) { _printAreaCornerMarker.remove(); _printAreaCornerMarker = null; }
  }
}

function clearPrintArea() {
  printAreaBounds  = null;
  printAreaCorner1 = null;
  if (_printAreaCornerMarker) { _printAreaCornerMarker.remove(); _printAreaCornerMarker = null; }
  if (map.getSource('print-rect')) map.getSource('print-rect').setData(emptyPolygon());
  document.getElementById('clearPrintAreaBtn').style.display = 'none';
  document.getElementById('printAreaBtn').textContent = 'Set image area';
}
