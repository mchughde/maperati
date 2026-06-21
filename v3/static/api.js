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

async function apiMatchDirections(coords, stops) {
  if (!orsKey() || stops.length < 2) return null;
  try {
    const profile = TRAVEL_MODES[travelMode].orsProfile;
    const res = await fetch(`${ORS_BASE}/directions/${profile}`, {
      method: 'POST',
      headers: { 'Authorization': orsKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coordinates: stops.map(s => [s.lng, s.lat]),
        instructions: true,
        language: 'en',
        units: 'm',
        preference: 'recommended',
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const route = (data.routes || [])[0];
    if (!route) return null;

    const steps = [];
    const segs = route.segments || [];

    for (let si = 0; si < stops.length; si++) {
      steps.push({
        stop_index: si,
        stop_name: stops[si].name,
        instruction: '',
        street_name: '',
        distance_m: 0,
        location: [stops[si].lat, stops[si].lng]
      });
      if (si < segs.length) {
        for (const step of segs[si].steps || []) {
          if (step.type === 10 || !step.instruction) continue;
          steps.push({
            instruction: step.instruction,
            street_name: step.name || '-',
            distance_m: step.distance || 0,
            location: null
          });
        }
      }
    }

    return { ok: true, steps };
  } catch(e) {
    return null;
  }
}
