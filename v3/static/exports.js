// ═══ Exports ══════════════════════════════════════════════

function getExportName() {
  return (document.getElementById("exportName").value.trim() || "my_walk");
}

function download(content, filename, mime) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], {type: mime}));
  a.download = filename;
  a.click();
}

async function exportAs(fmt) {
  const name = getExportName();
  const msg  = document.getElementById("exportMsg");
  if (!selectedStops.length && !routeCoords.length) {
    msg.innerHTML = '<div class="msg warn">Nothing to export yet — add stops or draw a route.</div>';
    return;
  }
  msg.innerHTML = "";
  if (fmt === "geojson")    exportGeoJSON(name);
  if (fmt === "gpx")        exportGPX(name);
  if (fmt === "kml")        exportKML(name);
  if (fmt === "csv")        exportCSV(name);
  if (fmt === "directions") await exportDirections(name);
}

function exportGeoJSON(name) {
  const features = [];
  if (routeCoords.length > 1) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: routeCoords.map(c=>[c[1],c[0]]) },
      properties: { name: name, stroke: "#2563EB", "stroke-width": 4 }
    });
  }
  let num = 1;
  selectedStops.forEach(s => {
    const label = s.category ? s.name : `${num++}. ${s.name}`;
    const color = s.category ? (CATEGORIES[s.category]?.color || '#6878A0') : '#2563EB';
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: { name: label, "marker-color": color, ...(s.category ? { category: s.category } : {}), ...(s.notes ? { notes: s.notes } : {}) }
    });
  });
  download(JSON.stringify({type:"FeatureCollection",features},null,2), name+".geojson", "application/json");
}

function exportGPX(name) {
  let num = 1;
  const wpts = selectedStops.map(s => {
    const label   = s.category ? s.name : `${num++}. ${s.name}`;
    const typeTag = s.category ? `<type>${escXml(CATEGORIES[s.category]?.label || s.category)}</type>` : '';
    return `  <wpt lat="${s.lat}" lon="${s.lng}"><name>${escXml(label)}</name>${s.notes ? `<desc>${escXml(s.notes)}</desc>` : ''}${typeTag}</wpt>`;
  }).join("\n");
  const trkpts = routeCoords.map(c => `      <trkpt lat="${c[0]}" lon="${c[1]}"/>`).join("\n");
  const trk = routeCoords.length > 1
    ? `  <trk><name>${escXml(name)}</name><trkseg>\n${trkpts}\n  </trkseg></trk>` : "";
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Walking Map App" xmlns="http://www.topografix.com/GPX/1/1">
${wpts}
${trk}
</gpx>`;
  download(gpx, name+".gpx", "application/gpx+xml");
}

function exportKML(name) {
  let num = 1;
  const placemarks = selectedStops.map(s => {
    const label   = s.category ? s.name : `${num++}. ${s.name}`;
    const catDesc = s.category ? `${CATEGORIES[s.category]?.label || s.category}${s.notes ? ': ' + s.notes : ''}` : (s.notes || '');
    return `
  <Placemark>
    <name>${escXml(label)}</name>
    ${catDesc ? `<description>${escXml(catDesc)}</description>` : ''}
    <Point><coordinates>${s.lng},${s.lat},0</coordinates></Point>
  </Placemark>`;
  }).join("");
  const lineCoords = routeCoords.map(c=>`${c[1]},${c[0]},0`).join(" ");
  const line = routeCoords.length > 1 ? `
  <Placemark>
    <name>${escXml(name)}</name>
    <Style><LineStyle><color>ffff863a</color><width>4</width></LineStyle></Style>
    <LineString><coordinates>${lineCoords}</coordinates></LineString>
  </Placemark>` : "";
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document><name>${escXml(name)}</name>${placemarks}${line}
</Document></kml>`;
  download(kml, name+".kml", "application/vnd.google-earth.kml+xml");
}

function exportCSV(name) {
  let csv = "order,name,category,lat,lng,notes\n";
  let num = 1;
  selectedStops.forEach(s => {
    const order = s.category ? '' : num++;
    const notes = (s.notes || '').replace(/"/g,'""');
    const cat   = (CATEGORIES[s.category]?.label || '').replace(/"/g,'""');
    csv += `${order},"${s.name.replace(/"/g,'""')}","${cat}",${s.lat},${s.lng},"${notes}"\n`;
  });
  download(csv, name+".csv", "text/csv");
}

function escXml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function sampleRouteSegment(coords, maxPts = 12) {
  if (coords.length <= maxPts) return coords;
  const step = (coords.length - 1) / (maxPts - 1);
  return Array.from({length: maxPts}, (_, i) => coords[Math.round(i * step)]);
}

async function exportDirections(name) {
  const msg = document.getElementById("exportMsg");
  if (!selectedStops.length) {
    msg.innerHTML = '<div class="msg warn">Add stops first to export directions.</div>';
    return;
  }
  if (selectedStops.length < 2) {
    msg.innerHTML = '<div class="msg warn">Add at least 2 stops to export directions.</div>';
    return;
  }
  if (!routeCoords.length) {
    msg.innerHTML = '<div class="msg warn">Draw a route first to export directions.</div>';
    return;
  }
  msg.innerHTML = '<div class="msg info"><span class="spinner">⟳</span> Fetching street-by-street directions…</div>';

  const sep = "─".repeat(52);
  let txt = `WALKING DIRECTIONS: ${name.toUpperCase()}\n${sep}\n\n`;

  const totalDist = routeDistM || (routeCoords.length > 1 ? calcDist(routeCoords) : 0);
  if (totalDist > 0) {
    txt += `Total distance:  ~${(totalDist / 1000).toFixed(2)} km\n`;
    txt += `Estimated time:  ~${Math.round(totalDist / TRAVEL_MODES[travelMode].speedMpm)} min at ${TRAVEL_MODES[travelMode].label.toLowerCase()} pace\n\n`;
  }
  txt += sep + "\n\n";

  let matchSteps = null;
  try {
    const data = await apiMatchDirections(
      routeCoords,
      selectedStops.map(s => ({ name: s.name, lat: s.lat, lng: s.lng }))
    );
    if (data?.ok && data.steps?.length) matchSteps = data.steps;
  } catch (_) {}

  let _n = 0;
  const stopNumbers = selectedStops.map(s =>
    (s.role === 'start' || s.role === 'end' || s.role === 'startend') ? null : ++_n
  );

  if (matchSteps) {
    const filtered = matchSteps.filter(step =>
      step.stop_index !== undefined ||
      (step.instruction && (step.distance_m || 0) >= 30)
    );
    const merged = [];
    for (const step of filtered) {
      const prev = merged[merged.length - 1];
      if (prev &&
          step.stop_index === undefined && prev.stop_index === undefined &&
          step.street_name && step.street_name !== '-' &&
          step.street_name === prev.street_name) {
        prev.distance_m += step.distance_m || 0;
      } else {
        merged.push({ ...step });
      }
    }
    for (const step of merged) {
      if (step.stop_index !== undefined) {
        const s = selectedStops[step.stop_index];
        if (!s) continue;
        const isLast  = step.stop_index === selectedStops.length - 1;
        const onRoute = distToRoute(s) <= 120;
        if (onRoute) {
          txt += "\n";
          const label = s.role === 'start'    ? 'START'       :
                        s.role === 'end'      ? 'END'         :
                        s.role === 'startend' ? 'START / END' :
                        `STOP ${stopNumbers[step.stop_index]}`;
          txt += `${label}  —  ${s.name}\n`;
          if (s.notes) txt += `  Note: ${s.notes}\n`;
          if (isLast)  txt += "(final destination)\n";
          txt += "\n";
        }
        if (!isLast && step.instruction && step.street_name && step.street_name !== '-' && (step.distance_m || 0) >= 30) {
          const d    = step.distance_m || 0;
          const dist = d >= 20 ? ` (${d >= 1000 ? ((d/1000).toFixed(1)+' km') : (Math.round(d)+' m')})` : '';
          txt += `  ${step.instruction}${dist}\n`;
        }
      } else {
        const inst = step.instruction || '';
        const d    = step.distance_m  || 0;
        const dist = d >= 20 ? ` (${d >= 1000 ? ((d/1000).toFixed(1)+' km') : (Math.round(d)+' m')})` : '';
        if (inst) txt += `  ${inst}${dist}\n`;
      }
    }
  } else {
    for (let i = 0; i < selectedStops.length; i++) {
      const s     = selectedStops[i];
      const label = s.role === 'start'    ? 'START'       :
                    s.role === 'end'      ? 'END'         :
                    s.role === 'startend' ? 'START / END' :
                    `STOP ${stopNumbers[i]}`;
      txt += `${label}  —  ${s.name}\n`;
      if (s.notes) txt += `  Note: ${s.notes}\n`;
      if (i < selectedStops.length - 1) {
        const next = selectedStops[i + 1];
        const d    = straightLineDist(s, next);
        txt += `${"─".repeat(36)}\n`;
        txt += `~${(d / 1000).toFixed(2)} km · ~${Math.round(d / TRAVEL_MODES[travelMode].speedMpm)} min (straight-line estimate)\n`;
        txt += `\n  → ${next.name}\n`;
      } else {
        txt += "(final destination)\n";
      }
      txt += "\n";
    }
  }

  txt += sep + "\n";
  txt += `Generated by Maperati · ${new Date().toLocaleDateString()}\n`;
  txt += "Map data © OpenStreetMap contributors\n";
  download(txt, name + "_directions.txt", "text/plain");
  msg.innerHTML = '<div class="msg info">Directions saved.</div>';
  setTimeout(() => { msg.innerHTML = ""; }, 3000);
}

function distToRoute(stop) {
  let min = Infinity;
  for (const c of routeCoords) {
    const d = straightLineDist(stop, { lat: c[0], lng: c[1] });
    if (d < min) min = d;
  }
  return min;
}

function straightLineDist(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function saveSessionFile() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) { showToast('Nothing to save — draw a route or add stops first.'); return; }
  const name = (document.getElementById('exportName').value || 'my_walk').replace(/\s+/g,'_');
  download(raw, name + '_session.json', 'application/json');
  document.getElementById('exportDropdown').style.display = 'none';
}

// Image export — composites MapLibre canvas + stop markers drawn via Canvas 2D API.
// The route line is already rendered in the MapLibre canvas (GeoJSON layer).
// Stop markers are DOM elements and must be drawn on top manually.
async function exportMapImage() {
  const bounds = printAreaBounds || (routeCoords.length > 1 ? getRouteBounds() : null);
  if (!bounds) { showToast('Set a print area or draw a route first.'); return; }

  const prevCenter = [map.getCenter().lng, map.getCenter().lat];
  const prevZoom   = map.getZoom();

  if (printAreaBounds) {
    try { map.setLayoutProperty('print-rect-fill', 'visibility', 'none'); } catch(_) {}
    try { map.setLayoutProperty('print-rect-line', 'visibility', 'none'); } catch(_) {}
  }

  await new Promise(resolve => {
    map.once('idle', resolve);
    map.fitBounds(
      [[bounds.west, bounds.south], [bounds.east, bounds.north]],
      { padding: printAreaBounds ? 20 : 40, animate: false }
    );
  });

  await new Promise(r => setTimeout(r, 200));

  showToast('Generating image…');

  const baseDpr = window.devicePixelRatio || 1;
  const mult    = exportResolutionMultiplier || 1;
  const effectiveDpr = baseDpr * mult;

  // Temporarily increase pixel ratio for higher-res export
  if (mult > 1) {
    map.setPixelRatio(effectiveDpr);
    await new Promise(resolve => map.once('idle', resolve));
    await new Promise(r => setTimeout(r, 150));
  }

  const restore = () => {
    if (mult > 1) map.setPixelRatio(baseDpr);
    map.jumpTo({ center: prevCenter, zoom: prevZoom });
    if (printAreaBounds) {
      try { map.setLayoutProperty('print-rect-fill', 'visibility', 'visible'); } catch(_) {}
      try { map.setLayoutProperty('print-rect-line', 'visibility', 'visible'); } catch(_) {}
    }
  };

  try {
    const mapCanvas = map.getCanvas();
    const W = mapCanvas.width, H = mapCanvas.height;

    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');

    // Base layer: the rendered MapLibre map (tiles + route line from GeoJSON)
    ctx.drawImage(mapCanvas, 0, 0);

    // map.project() returns CSS logical pixels; the canvas is in physical pixels.
    // Compute the actual scale from canvas size / container size — this is correct
    // regardless of pixel ratio or setPixelRatio() having been called.
    const container = map.getContainer();
    const scaleX = W / container.clientWidth;
    const scaleY = H / container.clientHeight;
    function toPx(lat, lng) {
      const p = map.project([lng, lat]);
      return [p.x * scaleX, p.y * scaleY];
    }

    // Draw stop markers on top — mirrors renderStopMarkers() exactly
    const circleR  = Math.max(10, W / 120);
    const circleFs = Math.round(circleR * 0.85);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    let num = 1;
    selectedStops.forEach(s => {
      const [px, py] = toPx(s.lat, s.lng);

      if (s.role === 'startend') {
        const pillFs = Math.max(11, Math.round(circleR * 0.85));
        ctx.font = `bold ${pillFs}px -apple-system,sans-serif`;
        const pad  = pillFs * 0.9;
        const twS  = ctx.measureText('Start').width;
        const twE  = ctx.measureText('End').width;
        const hwS  = twS + pad * 2, hwE = twE + pad * 2;
        const pw   = hwS + hwE, ph = pillFs * 1.8, rad = ph / 2;
        const px0  = px - pw / 2, py0 = py - ph / 2, mid = px0 + hwS;
        const bw   = Math.max(1.5, W / 800);

        ctx.beginPath(); ctx.fillStyle = '#16a34a';
        ctx.moveTo(px0 + rad, py0); ctx.lineTo(mid, py0); ctx.lineTo(mid, py0 + ph); ctx.lineTo(px0 + rad, py0 + ph);
        ctx.arc(px0 + rad, py0 + rad, rad, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = '#dc2626';
        ctx.moveTo(mid, py0); ctx.lineTo(px0 + pw - rad, py0);
        ctx.arc(px0 + pw - rad, py0 + rad, rad, -Math.PI / 2, Math.PI / 2); ctx.lineTo(mid, py0 + ph); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'white'; ctx.lineWidth = bw;
        ctx.beginPath(); ctx.moveTo(px0 + rad, py0); ctx.lineTo(px0 + pw - rad, py0);
        ctx.arc(px0 + pw - rad, py0 + rad, rad, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(px0 + rad, py0 + ph); ctx.arc(px0 + rad, py0 + rad, rad, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mid, py0 + bw); ctx.lineTo(mid, py0 + ph - bw); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillText('Start', px0 + hwS / 2, py); ctx.fillText('End', mid + hwE / 2, py);

      } else if (s.role === 'start' || s.role === 'end') {
        const label  = s.role === 'start' ? 'Start' : 'End';
        const color  = s.role === 'start' ? '#16a34a' : '#dc2626';
        const pillFs = Math.max(11, Math.round(circleR * 0.85));
        ctx.font = `bold ${pillFs}px -apple-system,sans-serif`;
        const tw = ctx.measureText(label).width;
        const ph = pillFs * 1.8, pw = tw + pillFs * 1.8, rad = ph / 2;
        const px0 = px - pw / 2, py0 = py - ph / 2;
        ctx.beginPath(); ctx.fillStyle = color;
        ctx.moveTo(px0 + rad, py0); ctx.lineTo(px0 + pw - rad, py0);
        ctx.arc(px0 + pw - rad, py0 + rad, rad, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(px0 + rad, py0 + ph); ctx.arc(px0 + rad, py0 + rad, rad, Math.PI / 2, -Math.PI / 2);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'white'; ctx.lineWidth = Math.max(1.5, W / 800); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillText(label, px, py);

      } else if (s.category) {
        const catColor = CATEGORIES[s.category]?.color || '#6878A0';
        const catLabel = { street:'★', garden:'G', museum:'M', church:'+', monument:'▲', cafe:'F', shop:'S', accommodation:'H', shopping:'B', transport:'T', viewpoint:'V', theatre:'Th', facilities:'WC', bar:'W', library:'L', custom1:'●', custom2:'●', custom3:'●', custom4:'●' }[s.category] || '?';
        ctx.beginPath(); ctx.fillStyle = '#f3f4f6'; ctx.arc(px, py, circleR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = Math.max(1, W / 600); ctx.stroke();
        ctx.font = `bold ${circleFs}px -apple-system,sans-serif`;
        ctx.fillStyle = catColor; ctx.fillText(catLabel, px, py);

      } else {
        ctx.font = `bold ${circleFs}px -apple-system,sans-serif`;
        ctx.beginPath(); ctx.fillStyle = '#1A1D2E'; ctx.arc(px, py, circleR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(String(num), px, py);
        num++;
      }
    });

    out.toBlob(blob => {
      restore();
      if (!blob) { showToast('Export failed.'); return; }
      const suffix = mult > 1 ? `_${mult}x` : '';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (document.getElementById('exportName').value || 'map') + suffix + '.jpg';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      showToast('Image downloaded.');
    }, 'image/jpeg', 0.92);

  } catch(e) {
    restore();
    showToast('Export failed: ' + e.message);
  }
}

function printMap() {
  const prevCenter = [map.getCenter().lng, map.getCenter().lat];
  const prevZoom   = map.getZoom();

  // Hide print rect border
  try { map.setLayoutProperty('print-rect-fill', 'visibility', 'none'); } catch(_) {}
  try { map.setLayoutProperty('print-rect-line', 'visibility', 'none'); } catch(_) {}

  const bounds = printAreaBounds || getRouteBounds();
  if (bounds) {
    map.fitBounds(
      [[bounds.west, bounds.south], [bounds.east, bounds.north]],
      { padding: printAreaBounds ? [20, 20] : [50, 50], animate: false }
    );
  }

  let pageStyleEl = null;
  if (printAreaBounds) {
    const ne = map.project([printAreaBounds.east, printAreaBounds.north]);
    const sw = map.project([printAreaBounds.west, printAreaBounds.south]);
    const w  = Math.abs(ne.x - sw.x);
    const h  = Math.abs(ne.y - sw.y);
    const orientation = w >= h ? 'landscape' : 'portrait';
    pageStyleEl = document.createElement('style');
    pageStyleEl.textContent = `@page { size: ${orientation}; margin: 0; }`;
    document.head.appendChild(pageStyleEl);
  }

  window.addEventListener('afterprint', function () {
    try { map.setLayoutProperty('print-rect-fill', 'visibility', 'visible'); } catch(_) {}
    try { map.setLayoutProperty('print-rect-line', 'visibility', 'visible'); } catch(_) {}
    if (pageStyleEl) pageStyleEl.remove();
    map.jumpTo({ center: prevCenter, zoom: prevZoom, animate: false });
  }, { once: true });

  let printed = false;
  function doPrint() { if (printed) return; printed = true; window.print(); }
  map.once('idle', () => setTimeout(doPrint, 300));
  setTimeout(doPrint, 4000);
}
