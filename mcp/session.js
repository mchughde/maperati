// Session read/write/validate for Maperati v3's session file format.
// Schema source of truth: v3/static/ui.js (_writeSession) and v3/static/import.js (loadSessionFromData).
// Keep in sync by hand — there is no shared module between v3 and this server.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const TRAVEL_MODES = {
  walking: { label: 'Walking', orsProfile: 'foot-walking',    osrmProfile: 'foot', speedMpm: 75 },
  running: { label: 'Running', orsProfile: 'foot-walking',    osrmProfile: 'foot', speedMpm: 167 },
  hiking:  { label: 'Hiking',  orsProfile: 'foot-hiking',     osrmProfile: 'foot', speedMpm: 58 },
  cycling: { label: 'Cycling', orsProfile: 'cycling-regular', osrmProfile: 'bike', speedMpm: 250 },
  driving: { label: 'Driving', orsProfile: 'driving-car',     osrmProfile: 'car',  speedMpm: 1000 },
};

// v3/static/state.js CATEGORIES — labels/colors kept for reference, only keys matter for validation.
export const CATEGORIES = {
  street: 'Best street', garden: 'Garden', museum: 'Museum', church: 'Church',
  monument: 'Monument', cafe: 'Cafe/restaurant', shop: 'Market', accommodation: 'Accommodation',
  shopping: 'Shop', transport: 'Transport', viewpoint: 'Viewpoint', theatre: 'Theatre',
  facilities: 'Facilities', bar: 'Bar/wine', library: 'Library',
  custom1: 'Rose', custom2: 'Amber', custom3: 'Sky', custom4: 'Lime',
};

const ROLES = new Set([null, 'start', 'end', 'startend']);

// Every write and read is confined to this directory — no path escape.
export function resolveWorkspacePath(workspaceDir, filename) {
  const resolved = path.resolve(workspaceDir, filename);
  const base = path.resolve(workspaceDir);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`Path escapes workspace: ${filename}`);
  }
  return resolved;
}

// Returns { ok: true, session } or { ok: false, errors: [...] }.
export function validateSession(data) {
  const errors = [];

  if (data.v !== 1) errors.push(`v must be 1, got ${JSON.stringify(data.v)}`);

  const stops = Array.isArray(data.stops) ? data.stops : [];
  const seenIds = new Set();
  let maxCustomIdN = 0;

  stops.forEach((s, i) => {
    if (!s.id) errors.push(`stops[${i}] missing id`);
    else if (seenIds.has(s.id)) errors.push(`stops[${i}] duplicate id "${s.id}"`);
    else seenIds.add(s.id);

    const m = /^custom_(\d+)$/.exec(s.id || '');
    if (m) maxCustomIdN = Math.max(maxCustomIdN, parseInt(m[1], 10));

    if (!s.name || typeof s.name !== 'string') errors.push(`stops[${i}] missing/invalid name`);
    if (typeof s.lat !== 'number' || typeof s.lng !== 'number') errors.push(`stops[${i}] "${s.name}" lat/lng must be numbers`);
    if (!ROLES.has(s.role ?? null)) errors.push(`stops[${i}] "${s.name}" invalid role "${s.role}" (must be null/start/end/startend)`);
    if (s.category != null && !(s.category in CATEGORIES)) errors.push(`stops[${i}] "${s.name}" unknown category "${s.category}"`);
  });

  // Stop-order invariant enforced by v3's normalizeStopOrder(): start/startend first, end last.
  stops.forEach((s, i) => {
    if ((s.role === 'start' || s.role === 'startend') && i !== 0) {
      errors.push(`stops[${i}] "${s.name}" has role "${s.role}" but is not first in the list`);
    }
    if (s.role === 'end' && i !== stops.length - 1) {
      errors.push(`stops[${i}] "${s.name}" has role "end" but is not last in the list`);
    }
  });

  const routeCoords = Array.isArray(data.routeCoords) ? data.routeCoords : [];
  routeCoords.forEach((c, i) => {
    if (!Array.isArray(c) || c.length !== 2 || typeof c[0] !== 'number' || typeof c[1] !== 'number') {
      errors.push(`routeCoords[${i}] must be [lat, lng] numbers`);
    }
  });

  const routeSegments = Array.isArray(data.routeSegments) ? data.routeSegments : [];
  if (routeCoords.length > 1) {
    if (routeSegments.length === 0) {
      errors.push('routeSegments must be present when routeCoords has >1 point');
    } else {
      const sum = routeSegments.reduce((a, b) => a + b, 0);
      if (sum !== routeCoords.length) {
        errors.push(`routeSegments sums to ${sum} but routeCoords has ${routeCoords.length} points`);
      }
    }
  }

  if (data.travelMode != null && !(data.travelMode in TRAVEL_MODES)) {
    errors.push(`invalid travelMode "${data.travelMode}" (must be one of ${Object.keys(TRAVEL_MODES).join('/')})`);
  }

  const customIdSeq = data.customIdSeq;
  if (customIdSeq != null && customIdSeq <= maxCustomIdN) {
    errors.push(`customIdSeq (${customIdSeq}) must be greater than the highest custom_N id used (${maxCustomIdN})`);
  }

  if (data.mapCenter != null) {
    if (!Array.isArray(data.mapCenter) || data.mapCenter.length !== 2) errors.push('mapCenter must be [lat, lng]');
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, session: data };
}

// Builds a schema-correct session object from a higher-level description, then validates it.
// stops: [{ name, lat, lng, role?, category?, notes? }], in final route order.
export function buildSession({ walkName, stops = [], routeCoords = [], routeSegments, travelMode = 'walking', mapCenter, mapZoom }) {
  let customIdSeq = 1;
  const builtStops = stops.map(s => ({
    id: `custom_${customIdSeq++}`,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    role: s.role ?? null,
    notes: s.notes ?? '',
    category: s.category ?? null,
  }));

  const session = {
    v: 1,
    stops: builtStops,
    routeCoords,
    routeSegments: routeSegments ?? (routeCoords.length > 1 ? [routeCoords.length] : []),
    routeDistM: haversinePathM(routeCoords),
    customIdSeq,
    detourPoints: [],
    travelMode,
    walkName: walkName ?? 'my_walk',
    mapCenter: mapCenter ?? (routeCoords[0] ?? (builtStops[0] ? [builtStops[0].lat, builtStops[0].lng] : [0, 0])),
    mapZoom: mapZoom ?? 15,
  };

  return validateSession(session);
}

function haversineM(a, b) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function haversinePathM(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversineM(coords[i - 1], coords[i]);
  return total;
}

export async function readSessionFile(workspaceDir, filename) {
  const filePath = resolveWorkspacePath(workspaceDir, filename);
  const text = await readFile(filePath, 'utf-8');
  const data = JSON.parse(text);
  const result = validateSession(data);
  if (!result.ok) throw new Error(`Invalid session file "${filename}": ${result.errors.join('; ')}`);
  return result.session;
}

export async function writeSessionFile(workspaceDir, filename, session) {
  const result = validateSession(session);
  if (!result.ok) throw new Error(`Refusing to write invalid session: ${result.errors.join('; ')}`);
  const filePath = resolveWorkspacePath(workspaceDir, filename);
  await writeFile(filePath, JSON.stringify(result.session, null, 2), 'utf-8');
  return filePath;
}

export async function listSessionFiles(workspaceDir) {
  const entries = await readdir(workspaceDir, { withFileTypes: true });
  const files = entries.filter(e => e.isFile() && e.name.endsWith('.json'));
  const results = [];
  for (const f of files) {
    try {
      const text = await readFile(path.join(workspaceDir, f.name), 'utf-8');
      const data = JSON.parse(text);
      if (data.v === 1 && (data.routeCoords || data.stops)) {
        results.push({ filename: f.name, walkName: data.walkName, stopCount: (data.stops || []).length, routeDistM: data.routeDistM });
      }
    } catch { /* not a session file or unreadable — skip */ }
  }
  return results;
}
