// ═══ Direct API helpers — v3 calls ORS and OSRM without a Flask backend ══════

function orsKey() { return localStorage.getItem('maperati_ors_key') || ''; }
const ORS_BASE         = 'https://api.openrouteservice.org/v2';
const ORS_ELEVATION_URL = 'https://api.openrouteservice.org/elevation/line';
const OSRM_URL         = 'https://router.project-osrm.org';

function _decodePolyline(str) {
  let index = 0, lat = 0, lng = 0;
  const coords = [];
  while (index < str.length) {
    let b, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

function _haversineM(a, b) {
  const R = 6371000;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

async function apiSnapPoint(lat, lng, orsProfile, osrmProfile) {
  if (orsKey()) {
    try {
      const res = await fetch(`${ORS_BASE}/snap/${orsProfile}`, {
        method: 'POST',
        headers: { 'Authorization': orsKey(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: [[lng, lat]], radius: 40 })
      });
      const data = await res.json();
      const locs = data.locations || [];
      if (locs[0]) return { ok: true, point: [locs[0].location[1], locs[0].location[0]] };
    } catch(e) {}
  }
  try {
    const res = await fetch(`${OSRM_URL}/nearest/v1/${osrmProfile}/${lng},${lat}?number=1`);
    const data = await res.json();
    if (data.code === 'Ok' && data.waypoints?.[0]) {
      const wp = data.waypoints[0];
      if (wp.distance <= 40) return { ok: true, point: [wp.location[1], wp.location[0]] };
    }
  } catch(e) {}
  return { ok: false, point: [lat, lng] };
}

async function apiSnapSegment(p1, p2, orsProfile, osrmProfile, maxRatio) {
  if (maxRatio === undefined) maxRatio = orsProfile === 'driving-car' ? 5.0 : 2.5;
  const straightM = _haversineM(p1, p2);

  if (orsKey()) {
    try {
      const body = {
        coordinates: [[p1[1], p1[0]], [p2[1], p2[0]]],
        preference: 'recommended',
      };
      if (orsProfile === 'driving-car') body.options = { avoid_features: ['ferries'] };
      const res = await fetch(`${ORS_BASE}/directions/${orsProfile}/geojson`, {
        method: 'POST',
        headers: { 'Authorization': orsKey(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      const feat = (data.features || [])[0];
      if (feat) {
        const coords = feat.geometry.coordinates.map(c => [c[1], c[0]]);
        const dist_m = feat.properties.summary.distance;
        if (straightM > 0 && dist_m / straightM > maxRatio) {
          return { ok: false, coords: [p1, p2], distance_m: straightM, warning: 'Route unusually long — straight line used. Draw this segment manually for accuracy.' };
        }
        return { ok: true, coords, distance_m: dist_m };
      }
    } catch(e) {}
  }

  try {
    const exclude = osrmProfile === 'car' ? '&exclude=ferry' : '';
    const res = await fetch(`${OSRM_URL}/route/v1/${osrmProfile}/${p1[1]},${p1[0]};${p2[1]},${p2[0]}?overview=full&geometries=polyline&steps=false${exclude}`);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.[0]) {
      const coords = _decodePolyline(data.routes[0].geometry);
      const dist_m = data.routes[0].distance;
      if (straightM > 0 && dist_m / straightM > maxRatio) {
        return { ok: false, coords: [p1, p2], distance_m: straightM, warning: 'OSRM route unusually long — straight line used. Draw this segment manually for accuracy.' };
      }
      return { ok: true, coords, distance_m: dist_m };
    }
  } catch(e) {}

  return { ok: false, coords: [p1, p2] };
}

async function apiElevation(coords) {
  if (!orsKey()) return { ok: false };
  try {
    const res = await fetch(ORS_ELEVATION_URL, {
      method: 'POST',
      headers: { 'Authorization': orsKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format_in: 'geojson',
        format_out: 'geojson',
        geometry: {
          coordinates: coords.map(([lat, lng]) => [lng, lat]),
          type: 'LineString'
        }
      })
    });
    const data = await res.json();
    const elevations = data.geometry.coordinates.map(c => c[2]);
    return { ok: true, elevations };
  } catch(e) {
    return { ok: false };
  }
}

// ═══ Geometry-first walking directions (client-side port of the Flask pipeline)
// Turns are detected from the DRAWN route geometry (routeCoords); street names
// come from Nominatim reverse-geocoding. The directions follow the blue line
// exactly — including detours and free-drawn sections — and do NOT re-route
// between stops. No ORS key required. Mirrors _geometry_directions / _detect_turns
// / _inject_stop_markers in app.py.

function _bearing(a, b) {
  // True compass bearing (deg) from a to b, each [lat, lng]. 0 = N, clockwise.
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180, lat2 = b[0] * Math.PI / 180;
  const x = Math.sin(dLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
}

function _cumDistsM(coords) {
  const d = [0];
  for (let i = 1; i < coords.length; i++) d.push(d[i - 1] + _haversineM(coords[i - 1], coords[i]));
  return d;
}

function _angleToVerb(angle) {
  // Signed bearing change → verb. Positive = clockwise = right; negative = left.
  const a = Math.abs(angle);
  if (a < 20) return 'Continue straight';
  const side = angle > 0 ? 'right' : 'left';
  if (a < 50)  return `Bear ${side}`;
  if (a < 130) return `Turn ${side}`;
  return `Turn sharp ${side}`;
}

function _bearingToCardinal(bearing) {
  const dirs = ['north','northeast','east','southeast','south','southwest','west','northwest'];
  return dirs[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

function _detectTurns(coords, turnThreshold = 25, mergeDistM = 40, windowM = 35) {
  // Significant turns: in/out bearings over a ~35 m window; merge turns within 40 m.
  const cum = _cumDistsM(coords);
  const raw = [];
  for (let i = 1; i < coords.length - 1; i++) {
    let bi = i;
    while (bi > 0 && cum[i] - cum[bi] < windowM) bi--;
    let di = i;
    while (di < coords.length - 1 && cum[di] - cum[i] < windowM) di++;
    if (bi === i || di === i) continue;
    const inB  = _bearing(coords[bi], coords[i]);
    const outB = _bearing(coords[i],  coords[di]);
    const angle = (((outB - inB + 180) % 360) + 360) % 360 - 180;
    if (Math.abs(angle) >= turnThreshold && Math.abs(angle) < 165) raw.push([i, angle, cum[i]]);
  }
  const merged = [];
  for (const t of raw) {
    const last = merged[merged.length - 1];
    if (last && t[2] - last[2] < mergeDistM) {
      if (Math.abs(t[1]) > Math.abs(last[1])) merged[merged.length - 1] = t;
    } else {
      merged.push(t);
    }
  }
  return merged;
}

// Reverse-geocode a point → road/street name (or ''). Cached by rounded coord
// (persisted to localStorage so repeats are free) and rate-limited to ≥1.05 s
// between real calls, honouring Nominatim's 1 req/sec policy.
const _GEO_CACHE = {};
const _GEO_LS_KEY = 'maperati_geocache_v1';
let _geoLast = 0;
try { Object.assign(_GEO_CACHE, JSON.parse(localStorage.getItem(_GEO_LS_KEY) || '{}')); } catch (_) {}

async function _nominatimStreet(lat, lng) {
  const key = lat.toFixed(5) + ',' + lng.toFixed(5);
  if (key in _GEO_CACHE) return _GEO_CACHE[key];
  const wait = 1050 - (Date.now() - _geoLast);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  let name = '';
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=17`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const d = await res.json();
    const a = d.address || {};
    name = (a.road || a.pedestrian || a.footway || a.path || a.square || '').trim();
    // Discard placeholder names with no letters/digits ("-", "–", "—", etc.)
    if (name && !/[\p{L}\p{N}]/u.test(name)) name = '';
  } catch (_) {
    name = '';
  }
  _geoLast = Date.now();
  _GEO_CACHE[key] = name;
  try { localStorage.setItem(_GEO_LS_KEY, JSON.stringify(_GEO_CACHE)); } catch (_) {}
  return name;
}

async function _geometryDirections(coords, onProgress) {
  if (coords.length < 2) return null;
  const cum = _cumDistsM(coords);
  const n   = coords.length;
  const turns  = _detectTurns(coords);
  const events = [[0, 'depart', 0]].concat(turns.map(t => [t[0], 'turn', t[1]]));

  const steps = [];
  for (let k = 0; k < events.length; k++) {
    const [ci, kind, angle] = events[k];
    const nextCi  = k + 1 < events.length ? events[k + 1][0] : n - 1;
    const segDist = cum[nextCi] - cum[ci];

    // Name the street travelled AFTER this turn — sample inside the segment to
    // the next event so a nearby following turn can't steal this turn's name.
    let street = '';
    let gi = Math.min(ci + 1, n - 1);
    for (const frac of [0.5, 0.65, 0.35, 0.8]) {
      const target = cum[ci] + segDist * frac;
      let gj = ci;
      while (gj < nextCi && cum[gj] < target) gj++;
      gj = Math.max(Math.min(gj, nextCi), Math.min(ci + 1, n - 1));
      gi = gj;
      const name = await _nominatimStreet(coords[gj][0], coords[gj][1]);
      if (name) { street = name; break; }
    }

    let instruction;
    if (kind === 'depart') {
      const outB = gi !== ci ? _bearing(coords[ci], coords[gi]) : 0;
      instruction = `Head ${_bearingToCardinal(outB)}` + (street ? ` on ${street}` : '');
    } else {
      instruction = _angleToVerb(angle) + (street ? ` onto ${street}` : '');
    }
    steps.push({ instruction, street_name: street, distance_m: segDist, location: coords[ci].slice() });
    if (onProgress) onProgress(k + 1, events.length);
  }
  const total = cum[n - 1];
  return { steps, total_distance_m: total, total_duration_s: total / 83.33 };
}

function _injectStopMarkers(coords, stops, steps) {
  // Insert a marker entry per stop, interleaved with turn steps by distance
  // along the route. Turn steps are never consumed/overwritten.
  if (!stops.length || !steps.length) return steps;
  const cum      = _cumDistsM(coords);
  const nCoords  = coords.length;
  const halfWin  = Math.max(Math.floor(nCoords * 0.25), 5);

  const placements = [];
  let minCoordIdx = 0;
  for (let idx = 0; idx < stops.length; idx++) {
    const stop   = stops[idx];
    const frac   = idx / Math.max(stops.length - 1, 1);
    const center = Math.round(frac * (nCoords - 1));
    const lo = Math.max(minCoordIdx, center - halfWin);
    let hi   = Math.min(nCoords, center + halfWin + 1);
    if (lo >= hi) hi = Math.min(nCoords, lo + 1);
    let bestJ = lo, bestD = Infinity;
    for (let j = lo; j < hi; j++) {
      const dd = _haversineM([stop.lat, stop.lng], coords[j]);
      if (dd < bestD) { bestD = dd; bestJ = j; }
    }
    placements.push([cum[bestJ], idx, stop.name || '', bestJ]);
    minCoordIdx = bestJ;
  }

  const stepStart = [0];
  for (let i = 0; i < steps.length - 1; i++) stepStart.push(stepStart[i] + (steps[i].distance_m || 0));

  const marker = p => ({
    instruction: '', street_name: '', distance_m: 0,
    location: coords[p[3]].slice(), stop_name: p[2], stop_index: p[1]
  });

  const result = [];
  let pi = 0;
  for (let i = 0; i < steps.length; i++) {
    while (pi < placements.length && placements[pi][0] <= stepStart[i] + 1e-6) {
      result.push(marker(placements[pi])); pi++;
    }
    result.push({ ...steps[i] });
  }
  while (pi < placements.length) { result.push(marker(placements[pi])); pi++; }
  return result;
}

async function apiMatchDirections(coords, stops, onProgress) {
  if (!coords || coords.length < 2) return null;
  try {
    const result = await _geometryDirections(coords, onProgress);
    if (!result) return null;
    const steps = _injectStopMarkers(coords, stops || [], result.steps);
    return { ok: true, steps, total_distance_m: result.total_distance_m, total_duration_s: result.total_duration_s };
  } catch (e) {
    return null;
  }
}
