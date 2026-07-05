// ═══ Shareable-link encoding (used by the editor AND embed.html) ══════════
// v3 is fully static — there is no server to store a route. So the whole
// route travels inside the URL fragment of an embed link. To keep that URL
// short even for long routes, the polyline is delta-encoded (Google encoded
// polyline, precision 5) and the payload is base64url-encoded.
//
// This file defines NO globals that run on load — only pure functions — so it
// is safe to load in both index.html and embed.html.

// ── Encoded polyline (canonical @mapbox/polyline algorithm, precision 5) ──

function _py2round(v) { return Math.floor(Math.abs(v) + 0.5) * (v >= 0 ? 1 : -1); }

function _plEncodeVal(current, previous, factor) {
  current = _py2round(current * factor);
  previous = _py2round(previous * factor);
  let coord = (current - previous) * 2;
  if (coord < 0) coord = -coord - 1;
  let out = '';
  while (coord >= 0x20) {
    out += String.fromCharCode((0x20 | (coord & 0x1f)) + 63);
    coord /= 32;
  }
  out += String.fromCharCode((coord | 0) + 63);
  return out;
}

function polylineEncode(coords, precision) {
  if (!coords.length) return '';
  const factor = Math.pow(10, Number.isInteger(precision) ? precision : 5);
  let out = _plEncodeVal(coords[0][0], 0, factor) + _plEncodeVal(coords[0][1], 0, factor);
  for (let i = 1; i < coords.length; i++) {
    out += _plEncodeVal(coords[i][0], coords[i - 1][0], factor);
    out += _plEncodeVal(coords[i][1], coords[i - 1][1], factor);
  }
  return out;
}

function polylineDecode(str, precision) {
  let index = 0, lat = 0, lng = 0, shift, result, byte;
  const coords = [], factor = Math.pow(10, Number.isInteger(precision) ? precision : 5);
  while (index < str.length) {
    shift = 0; result = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

// ── base64url (unicode-safe) ──────────────────────────────────────────────

function _b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return decodeURIComponent(escape(atob(s)));
}

// ── Role <-> compact code ─────────────────────────────────────────────────

const _ROLE_CODES = { start: 1, end: 2, startend: 3 };
const _ROLE_NAMES = { 1: 'start', 2: 'end', 3: 'startend' };

// ── Public: encode / decode a shareable route ─────────────────────────────
// state = { name, travelMode, styleId, routeCoords:[[lat,lng],...], stops:[{lat,lng,role,category,name},...] }

function encodeShareState(state) {
  const payload = {
    v: 1,
    n: state.name || '',
    m: state.travelMode || 'walking',
    t: state.styleId || '',
    r: polylineEncode(state.routeCoords || []),
    s: (state.stops || []).map(s => [
      +s.lat.toFixed(5),
      +s.lng.toFixed(5),
      _ROLE_CODES[s.role] || 0,
      s.category || '',
      s.name || '',
    ]),
  };
  return _b64urlEncode(JSON.stringify(payload));
}

function decodeShareState(str) {
  const payload = JSON.parse(_b64urlDecode(str));
  if (!payload || payload.v !== 1) throw new Error('Unsupported share payload');
  return {
    name: payload.n || '',
    travelMode: payload.m || 'walking',
    styleId: payload.t || '',
    routeCoords: polylineDecode(payload.r || ''),
    stops: (payload.s || []).map((a, i) => ({
      id: 'share-' + i,
      lat: a[0],
      lng: a[1],
      role: _ROLE_NAMES[a[2]] || null,
      category: a[3] || null,
      name: a[4] || '',
    })),
  };
}
