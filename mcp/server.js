#!/usr/bin/env node
// Local MCP server for Maperati v3 — a file-based bridge, not a live connection.
// v3 (~/Developer/maperati/v3) is deliberately static/serverless: all state lives in the
// browser's localStorage, and the only way in or out is the Import drop zone / Export menu.
// This server writes and reads the same session .json / GPX / KML / CSV / GeoJSON files v3
// already produces and consumes — no changes to v3 itself, no new backend for the app.

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { buildSession, readSessionFile, writeSessionFile, listSessionFiles, TRAVEL_MODES, CATEGORIES } from './session.js';
import { convert } from './formats.js';
import { geocode, findPOIs, routePath } from './geo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_DIR = path.join(__dirname, 'workspace');
mkdirSync(WORKSPACE_DIR, { recursive: true });

function loadOrsApiKey() {
  const envPath = path.join(REPO_ROOT, '.env');
  if (!existsSync(envPath)) return '';
  const text = readFileSync(envPath, 'utf-8');
  const match = text.match(/^ORS_API_KEY=(.*)$/m);
  return match ? match[1].trim() : '';
}
const ORS_API_KEY = loadOrsApiKey();

const server = new McpServer({ name: 'maperati', version: '1.0.0' });

const StopInput = z.object({
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  role: z.enum(['start', 'end', 'startend']).nullable().optional(),
  category: z.enum(Object.keys(CATEGORIES)).nullable().optional(),
  notes: z.string().optional(),
});

// ── list_sessions ──────────────────────────────────────────
server.registerTool(
  'list_sessions',
  {
    title: 'List Maperati session files',
    description: 'List Maperati v3 session .json files in the workspace directory (~/Developer/maperati/mcp/workspace).',
    inputSchema: {},
  },
  async () => {
    const sessions = await listSessionFiles(WORKSPACE_DIR);
    return { content: [{ type: 'text', text: JSON.stringify(sessions, null, 2) }] };
  }
);

// ── read_session ───────────────────────────────────────────
server.registerTool(
  'read_session',
  {
    title: 'Read a Maperati session file',
    description: 'Parse a Maperati v3 session .json file from the workspace and summarize its route, stops, and travel mode.',
    inputSchema: { filename: z.string().describe('Filename within the workspace directory, e.g. "my_walk_session.json"') },
  },
  async ({ filename }) => {
    const session = await readSessionFile(WORKSPACE_DIR, filename);
    const summary = {
      walkName: session.walkName,
      travelMode: session.travelMode,
      routeDistM: session.routeDistM,
      routePointCount: session.routeCoords.length,
      stops: session.stops.map(s => ({ name: s.name, role: s.role, category: s.category, lat: s.lat, lng: s.lng, notes: s.notes })),
      mapCenter: session.mapCenter,
      mapZoom: session.mapZoom,
    };
    return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
  }
);

// ── convert_session ────────────────────────────────────────
server.registerTool(
  'convert_session',
  {
    title: 'Convert a session file to GPX/KML/CSV/GeoJSON',
    description: 'Read a Maperati v3 session .json file and write it out as GPX, KML, CSV, or GeoJSON into the workspace directory. Same formats produced by v3\'s own Export menu.',
    inputSchema: {
      filename: z.string().describe('Session .json filename within the workspace'),
      format: z.enum(['gpx', 'kml', 'csv', 'geojson']),
    },
  },
  async ({ filename, format }) => {
    const session = await readSessionFile(WORKSPACE_DIR, filename);
    const { content, filename: outFilename } = convert(session, format);
    const outPath = path.join(WORKSPACE_DIR, outFilename);
    await import('node:fs/promises').then(fs => fs.writeFile(outPath, content, 'utf-8'));
    return { content: [{ type: 'text', text: `Wrote ${outFilename} to workspace.` }] };
  }
);

// ── geocode ────────────────────────────────────────────────
server.registerTool(
  'geocode',
  {
    title: 'Geocode a place name',
    description: 'Look up candidate lat/lng locations for a place name or address via Nominatim (OpenStreetMap), the same geocoder v3 uses.',
    inputSchema: { query: z.string() },
  },
  async ({ query }) => {
    const results = await geocode(query);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }
);

// ── find_pois ──────────────────────────────────────────────
server.registerTool(
  'find_pois',
  {
    title: 'Find points of interest in an area',
    description: 'Search OpenStreetMap (via Overpass) for POIs of a category within a bounding box. Category is an OSM tag=value pair, e.g. "amenity=cafe", "tourism=museum", "leisure=garden".',
    inputSchema: {
      tag: z.string().describe('OSM tag=value, e.g. "amenity=cafe"'),
      south: z.number(), west: z.number(), north: z.number(), east: z.number(),
      mode: z.enum(['node', 'way']).optional().describe('"node" for point POIs (cafes, shops), "way" for area POIs (museums, parks, churches)'),
    },
  },
  async ({ tag, south, west, north, east, mode }) => {
    const results = await findPOIs(tag, { south, west, north, east }, mode || 'node');
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }
);

// ── route_between ──────────────────────────────────────────
server.registerTool(
  'route_between',
  {
    title: 'Route between two points',
    description: 'Get walking/cycling/driving route geometry and distance between two [lat,lng] points via OpenRouteService (or OSRM fallback) — same routing engine v3 uses. Rejects implausible routes (distance far exceeding straight-line) and falls back to a straight line with a warning instead.',
    inputSchema: {
      from: z.tuple([z.number(), z.number()]).describe('[lat, lng]'),
      to: z.tuple([z.number(), z.number()]).describe('[lat, lng]'),
      travelMode: z.enum(Object.keys(TRAVEL_MODES)).default('walking'),
    },
  },
  async ({ from, to, travelMode }) => {
    const result = await routePath([from, to], travelMode, ORS_API_KEY);
    return { content: [{ type: 'text', text: JSON.stringify({ coords: result.coords, distanceM: Math.round(result.distanceM), warnings: result.warnings }, null, 2) }] };
  }
);

// ── build_session ──────────────────────────────────────────
server.registerTool(
  'build_session',
  {
    title: 'Build a Maperati session file',
    description: 'Build a Maperati v3 session .json file from a list of stops (in route order) and optional pre-computed route geometry, then write it to the workspace. Drag the resulting file onto the v3 Import zone to load it. If routeCoords is omitted but travelMode is set, use route_between/route_path first to get real road geometry — omitting it entirely just places the stops with no drawn route line.',
    inputSchema: {
      walkName: z.string(),
      stops: z.array(StopInput).describe('Stops in final route order — a start/startend stop must be first, an end stop must be last'),
      routeCoords: z.array(z.tuple([z.number(), z.number()])).optional().describe('[lat,lng] route line points, e.g. concatenated from route_between calls'),
      travelMode: z.enum(Object.keys(TRAVEL_MODES)).default('walking'),
      filename: z.string().optional().describe('Output filename; defaults to "<walkName>_session.json"'),
    },
  },
  async ({ walkName, stops, routeCoords, travelMode, filename }) => {
    const result = buildSession({ walkName, stops, routeCoords: routeCoords || [], travelMode });
    if (!result.ok) {
      return { content: [{ type: 'text', text: `Validation failed:\n${result.errors.join('\n')}` }], isError: true };
    }
    const outFilename = filename || `${walkName.replace(/\s+/g, '_')}_session.json`;
    const outPath = await writeSessionFile(WORKSPACE_DIR, outFilename, result.session);
    return { content: [{ type: 'text', text: `Wrote ${outFilename} to workspace (${outPath}). Drag this file onto the Maperati v3 Import zone to load it.` }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
