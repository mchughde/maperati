// GPX/KML/CSV/GeoJSON writers, ported from v3/static/exports.js.
// The v3 versions read module-global state (selectedStops, routeCoords) and call
// browser download(); these take an explicit session object and return a string.
// Keep logic identical to the source functions listed above each one.

import { CATEGORIES } from './session.js';

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Ported from exportGeoJSON (exports.js:31)
export function toGeoJSON(session, name) {
  const { stops, routeCoords } = session;
  const features = [];
  if (routeCoords.length > 1) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: routeCoords.map(c => [c[1], c[0]]) },
      properties: { name, stroke: '#2563EB', 'stroke-width': 4 },
    });
  }
  let num = 1;
  stops.forEach(s => {
    const label = s.category ? s.name : `${num++}. ${s.name}`;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: {
        name: label,
        ...(s.category ? { category: s.category } : {}),
        ...(s.notes ? { notes: s.notes } : {}),
      },
    });
  });
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
}

// Ported from exportGPX (exports.js:53)
export function toGPX(session, name) {
  const { stops, routeCoords } = session;
  let num = 1;
  const wpts = stops.map(s => {
    const label = s.category ? s.name : `${num++}. ${s.name}`;
    const typeTag = s.category ? `<type>${escXml(CATEGORIES[s.category] || s.category)}</type>` : '';
    return `  <wpt lat="${s.lat}" lon="${s.lng}"><name>${escXml(label)}</name>${s.notes ? `<desc>${escXml(s.notes)}</desc>` : ''}${typeTag}</wpt>`;
  }).join('\n');
  const trkpts = routeCoords.map(c => `      <trkpt lat="${c[0]}" lon="${c[1]}"/>`).join('\n');
  const trk = routeCoords.length > 1
    ? `  <trk><name>${escXml(name)}</name><trkseg>\n${trkpts}\n  </trkseg></trk>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Walking Map App" xmlns="http://www.topografix.com/GPX/1/1">
${wpts}
${trk}
</gpx>`;
}

// Ported from exportKML (exports.js:71)
export function toKML(session, name) {
  const { stops, routeCoords } = session;
  let num = 1;
  const placemarks = stops.map(s => {
    const label = s.category ? s.name : `${num++}. ${s.name}`;
    const catDesc = s.category ? `${CATEGORIES[s.category] || s.category}${s.notes ? ': ' + s.notes : ''}` : (s.notes || '');
    return `
  <Placemark>
    <name>${escXml(label)}</name>
    ${catDesc ? `<description>${escXml(catDesc)}</description>` : ''}
    <Point><coordinates>${s.lng},${s.lat},0</coordinates></Point>
  </Placemark>`;
  }).join('');
  const lineCoords = routeCoords.map(c => `${c[1]},${c[0]},0`).join(' ');
  const line = routeCoords.length > 1 ? `
  <Placemark>
    <name>${escXml(name)}</name>
    <Style><LineStyle><color>ffff863a</color><width>4</width></LineStyle></Style>
    <LineString><coordinates>${lineCoords}</coordinates></LineString>
  </Placemark>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document><name>${escXml(name)}</name>${placemarks}${line}
</Document></kml>`;
}

// Ported from exportCSV (exports.js:97)
export function toCSV(session) {
  const { stops } = session;
  let csv = 'order,name,category,lat,lng,notes\n';
  let num = 1;
  stops.forEach(s => {
    const order = s.category ? '' : num++;
    const notes = (s.notes || '').replace(/"/g, '""');
    const cat = (CATEGORIES[s.category] || '').replace(/"/g, '""');
    csv += `${order},"${s.name.replace(/"/g, '""')}","${cat}",${s.lat},${s.lng},"${notes}"\n`;
  });
  return csv;
}

const FORMAT_WRITERS = {
  geojson: { fn: toGeoJSON, ext: 'geojson' },
  gpx: { fn: toGPX, ext: 'gpx' },
  kml: { fn: toKML, ext: 'kml' },
  csv: { fn: (s) => toCSV(s), ext: 'csv' },
};

export function convert(session, format) {
  const writer = FORMAT_WRITERS[format];
  if (!writer) throw new Error(`Unknown format "${format}" (use geojson/gpx/kml/csv)`);
  const name = session.walkName || 'my_walk';
  const content = writer.fn(session, name);
  return { content, filename: `${name.replace(/\s+/g, '_')}.${writer.ext}` };
}
