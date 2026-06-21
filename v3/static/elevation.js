// ═══ Elevation profile ═══════════════════════════════════

let elevationCoords  = [];
let _elevHoverMarker = null;

function sampleEvenly(arr, maxPts) {
  if (arr.length <= maxPts) return arr;
  const step = (arr.length - 1) / (maxPts - 1);
  return Array.from({length: maxPts}, (_, i) => arr[Math.round(i * step)]);
}

function cumDists(coords) {
  const R = 6371000, out = [0];
  for (let i = 1; i < coords.length; i++) {
    const [la1,lo1] = coords[i-1], [la2,lo2] = coords[i];
    const dLa=(la2-la1)*Math.PI/180, dLo=(lo2-lo1)*Math.PI/180;
    const a=Math.sin(dLa/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
    out.push(out[out.length-1] + R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
  }
  return out;
}

function niceInterval(totalM) {
  if (totalM < 2000)  return 500;
  if (totalM < 5000)  return 1000;
  if (totalM < 15000) return 2000;
  if (totalM < 30000) return 5000;
  return 10000;
}

async function fetchElevation() {
  if (routeCoords.length < 2) return;
  const sampled = sampleEvenly(routeCoords, 100);
  try {
    const data = await apiElevation(sampled);
    if (data.ok && data.elevations?.length) {
      elevationData   = data.elevations;
      elevationDists  = cumDists(sampled);
      elevationCoords = sampled;
    }
  } catch(e) {}
}

function renderElevationChart() {
  const panel = document.getElementById('elevationPanel');
  if (!elevationData.length) { panel.style.display = 'none'; return; }

  const minE = Math.min(...elevationData);
  const maxE = Math.max(...elevationData);
  const rangeE = maxE - minE || 1;
  const totalD = elevationDists[elevationDists.length - 1];

  let ascent = 0, descent = 0;
  for (let i = 1; i < elevationData.length; i++) {
    const d = elevationData[i] - elevationData[i-1];
    if (d > 0) ascent += d; else descent += Math.abs(d);
  }

  const W = 1000, H = 80;
  const pts = elevationData.map((e, i) => {
    const x = (elevationDists[i] / totalD) * W;
    const y = H - ((e - minE) / rangeE) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const fill = `M0,${H} L${pts.join(' L')} L${W},${H} Z`;
  const line = `M${pts.join(' L')}`;

  const interval = niceInterval(totalD);
  let gridSVG = '';
  let gridHTML = '';
  for (let d = interval; d < totalD; d += interval) {
    const x = (d / totalD) * W;
    gridSVG += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${H}" stroke="#E8EDF5" stroke-width="1.5" stroke-dasharray="4,3"/>`;
    const pct = (d / totalD * 100).toFixed(2);
    const lbl = d >= 1000 ? `${(d/1000).toFixed(0)}km` : `${d}m`;
    gridHTML += `<span style="position:absolute;left:${pct}%;transform:translateX(-50%)">${lbl}</span>`;
  }
  const endLbl = totalD >= 1000 ? `${(totalD/1000).toFixed(1)}km` : `${Math.round(totalD)}m`;

  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="elev-header">
      <span>Elevation profile</span>
      <span class="elev-stats">↑ ${Math.round(ascent)}m &nbsp;·&nbsp; ↓ ${Math.round(descent)}m &nbsp;·&nbsp; ${Math.round(minE)}–${Math.round(maxE)}m</span>
      <button class="elev-close" onclick="clearElevation()">×</button>
    </div>
    <div class="elev-body">
      <div class="elev-y"><span>${Math.round(maxE)}m</span><span>${Math.round(minE)}m</span></div>
      <div class="elev-chart" id="elevChart">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <defs>
            <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#2563EB" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="#2563EB" stop-opacity="0.03"/>
            </linearGradient>
          </defs>
          ${gridSVG}
          <path d="${fill}" fill="url(#eg)"/>
          <path d="${line}" fill="none" stroke="#2563EB" stroke-width="2"/>
        </svg>
        <div id="elevCursor" style="display:none;position:absolute;top:0;bottom:18px;width:1px;background:#1A1D2E;opacity:0.4;pointer-events:none"></div>
        <div id="elevTooltip" style="display:none;position:absolute;top:4px;background:#1A1D2E;color:#fff;padding:3px 8px;border-radius:6px;font-size:0.68rem;font-weight:600;pointer-events:none;white-space:nowrap;transform:translateX(-50%)"></div>
        <div class="elev-x"><span style="position:absolute;left:0">0</span>${gridHTML}<span style="position:absolute;right:0">${endLbl}</span></div>
      </div>
    </div>`;

  document.getElementById('elevChart').addEventListener('mousemove', onElevHover);
  document.getElementById('elevChart').addEventListener('mouseleave', onElevLeave);
  document.getElementById('elevChart').addEventListener('click', onElevClick);
  map.resize();
}

function elevPosFromEvent(e) {
  const chart = document.getElementById('elevChart');
  if (!chart) return null;
  const rect = chart.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const totalD = elevationDists[elevationDists.length - 1];
  const target = pct * totalD;
  let best = 0, bestDiff = Infinity;
  elevationDists.forEach((d, i) => { const diff = Math.abs(d - target); if (diff < bestDiff) { bestDiff = diff; best = i; } });
  return { x: e.clientX - rect.left, idx: best };
}

function onElevHover(e) {
  const pos = elevPosFromEvent(e);
  if (!pos) return;
  const cursor  = document.getElementById('elevCursor');
  const tooltip = document.getElementById('elevTooltip');
  cursor.style.display  = 'block';
  cursor.style.left     = pos.x + 'px';
  tooltip.style.display = 'block';
  tooltip.style.left    = pos.x + 'px';
  const d = elevationDists[pos.idx];
  const lbl = d >= 1000 ? (d/1000).toFixed(2)+'km' : Math.round(d)+'m';
  tooltip.textContent = `${lbl} · ${Math.round(elevationData[pos.idx])}m`;
  if (elevationCoords[pos.idx]) {
    const coord = elevationCoords[pos.idx];
    if (!_elevHoverMarker) {
      const el = document.createElement('div');
      el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#2563EB;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);transform:translate(-7px,-7px)';
      _elevHoverMarker = new maplibregl.Marker({ element: el, anchor: 'top-left' })
        .setLngLat([coord[1], coord[0]])
        .addTo(map);
    } else {
      _elevHoverMarker.setLngLat([coord[1], coord[0]]);
    }
  }
}

function onElevLeave() {
  const cursor  = document.getElementById('elevCursor');
  const tooltip = document.getElementById('elevTooltip');
  if (cursor)  cursor.style.display  = 'none';
  if (tooltip) tooltip.style.display = 'none';
  if (_elevHoverMarker) { _elevHoverMarker.remove(); _elevHoverMarker = null; }
}

function onElevClick(e) {
  const pos = elevPosFromEvent(e);
  if (pos && elevationCoords[pos.idx]) {
    const coord = elevationCoords[pos.idx];
    map.panTo([coord[1], coord[0]]);
  }
}

async function toggleElevationPanel() {
  const panel = document.getElementById('elevationPanel');
  const btn   = document.getElementById('elevBtn');
  if (panel.style.display === 'block') {
    panel.style.display = 'none';
    btn.style.color = '#6878A0';
    onElevLeave();
    map.resize();
    return;
  }
  if (!elevationData.length) {
    btn.textContent = 'Loading…';
    await fetchElevation();
    btn.textContent = 'Elevation';
  }
  if (elevationData.length) {
    renderElevationChart();
    btn.style.color = '#2563EB';
  }
}

function clearElevation() {
  elevationData = []; elevationDists = []; elevationCoords = [];
  onElevLeave();
  const panel = document.getElementById('elevationPanel');
  panel.style.display = 'none'; panel.innerHTML = '';
  const btn = document.getElementById('elevBtn');
  if (btn) { btn.textContent = 'Elevation'; btn.style.color = '#6878A0'; }
  map.resize();
}
