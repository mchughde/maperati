// Routing, geocoding, and POI search, ported from v3/static/api.js and v3/static/discover.js.
// Same public endpoints v3 calls directly from the browser: ORS (primary, needs a key),
// OSRM (keyless fallback), Nominatim (geocode), Overpass (POI search).
// Keep behavior identical to the source functions listed above each one, notably the
// maxRatio implausible-route guard in routeBetween — that's what stops a routing glitch
// producing a nonsense-length "walk".

const ORS_BASE = 'https://api.openrouteservice.org/v2';
const OSRM_URL = 'https://router.project-osrm.org';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const NOMINATIM_MIN_INTERVAL_MS = 1050; // Nominatim policy: max 1 req/sec
let _lastNominatimCall = 0;

function haversineM(a, b) {
  const R = 6371000;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function decodePolyline(str) {
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

// Ported from apiSnapSegment (api.js:55). p1/p2 are [lat,lng].
export async function routeBetween(p1, p2, orsProfile, osrmProfile, orsApiKey, maxRatio) {
  if (maxRatio === undefined) maxRatio = orsProfile === 'driving-car' ? 5.0 : 2.5;
  const straightM = haversineM(p1, p2);

  if (orsApiKey) {
    try {
      const body = { coordinates: [[p1[1], p1[0]], [p2[1], p2[0]]], preference: 'recommended' };
      if (orsProfile === 'driving-car') body.options = { avoid_features: ['ferries'] };
      const res = await fetch(`${ORS_BASE}/directions/${orsProfile}/geojson`, {
        method: 'POST',
        headers: { Authorization: orsApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const feat = (data.features || [])[0];
      if (feat) {
        const coords = feat.geometry.coordinates.map(c => [c[1], c[0]]);
        const dist_m = feat.properties.summary.distance;
        if (straightM > 0 && dist_m / straightM > maxRatio) {
          return { ok: false, coords: [p1, p2], distance_m: straightM, warning: 'Route unusually long — straight line used. Draw this segment manually for accuracy.' };
        }
        return { ok: true, coords, distance_m: dist_m, source: 'ors' };
      }
    } catch { /* fall through to OSRM */ }
  }

  try {
    const exclude = osrmProfile === 'car' ? '&exclude=ferry' : '';
    const res = await fetch(`${OSRM_URL}/route/v1/${osrmProfile}/${p1[1]},${p1[0]};${p2[1]},${p2[0]}?overview=full&geometries=polyline&steps=false${exclude}`);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.[0]) {
      const coords = decodePolyline(data.routes[0].geometry);
      const dist_m = data.routes[0].distance;
      if (straightM > 0 && dist_m / straightM > maxRatio) {
        return { ok: false, coords: [p1, p2], distance_m: straightM, warning: 'OSRM route unusually long — straight line used. Draw this segment manually for accuracy.' };
      }
      return { ok: true, coords, distance_m: dist_m, source: 'osrm' };
    }
  } catch { /* both failed */ }

  return { ok: false, coords: [p1, p2], source: 'straight-line' };
}

// Routes an ordered list of [lat,lng] points leg by leg, concatenating into one path.
export async function routePath(points, travelModeKey, orsApiKey) {
  const modes = {
    walking: { orsProfile: 'foot-walking', osrmProfile: 'foot' },
    running: { orsProfile: 'foot-walking', osrmProfile: 'foot' },
    hiking:  { orsProfile: 'foot-hiking',  osrmProfile: 'foot' },
    cycling: { orsProfile: 'cycling-regular', osrmProfile: 'bike' },
    driving: { orsProfile: 'driving-car',  osrmProfile: 'car' },
  };
  const mode = modes[travelModeKey] || modes.walking;
  let coords = [];
  let totalDist = 0;
  const warnings = [];
  for (let i = 0; i < points.length - 1; i++) {
    const leg = await routeBetween(points[i], points[i + 1], mode.orsProfile, mode.osrmProfile, orsApiKey);
    if (leg.warning) warnings.push(`leg ${i + 1}: ${leg.warning}`);
    const legCoords = i === 0 ? leg.coords : leg.coords.slice(1); // avoid duplicating the shared point
    coords = coords.concat(legCoords);
    totalDist += leg.distance_m ?? haversineM(points[i], points[i + 1]);
  }
  return { coords, distanceM: totalDist, warnings };
}

// Ported from geocode() in stops.js:91.
export async function geocode(query) {
  const wait = NOMINATIM_MIN_INTERVAL_MS - (Date.now() - _lastNominatimCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastNominatimCall = Date.now();

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'maperati-mcp/1.0' } });
  const data = await res.json();
  return data.map(r => ({ name: r.display_name.split(',')[0], displayName: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }));
}

// Ported from _runOsmSearch/searchOsmCategory (discover.js). bbox is {south,west,north,east}.
export async function findPOIs(tag, bbox, mode = 'node') {
  const [k, v] = tag.split('=');
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const query = (mode === 'way')
    ? `[out:json][timeout:25];(node["${k}"="${v}"](${bboxStr});way["${k}"="${v}"](${bboxStr}););out center 50;`
    : `[out:json][timeout:15];node["${k}"="${v}"](${bboxStr});out 50;`;

  let data;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController();
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
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') continue;
      throw err;
    }
  }
  if (!data) throw new Error('All Overpass search servers unavailable — try again in a moment');

  const elements = (data.elements || []).filter(el => el.lat != null || el.center);
  return elements.map(el => ({
    name: el.tags?.name || el.tags?.['name:en'] || `Place (${el.id})`,
    lat: el.lat ?? el.center.lat,
    lng: el.lon ?? el.center.lon,
  }));
}
