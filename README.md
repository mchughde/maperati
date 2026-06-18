# Maperati

A local browser app for planning and exporting walking routes on OpenStreetMap. Built with Flask and Leaflet.js.

## What Maperati is for

Maperati is a **route planning and export tool**. It is designed for drawing, refining, and exporting walking routes — placing stops, adding detour waypoints, annotating points of interest, and producing map images and data files.

It is not a navigation app. It does not provide live GPS tracking or turn-by-turn guidance on the ground. For that, export your route as GPX and open it in a dedicated navigation app (see [Navigation](#navigation) below).

---

## Navigation

Once you have planned your route in Maperati, export it as GPX and import it into a navigation app to get turn-by-turn guidance and accurate street-level directions. These apps use vector map data — a queryable database of roads and street names — which allows them to match your GPX track to real roads and generate precise instructions.

Recommended free options:

- **[OsmAnd](https://osmand.net)** (iOS and Android) — navigates along the imported GPX track exactly as drawn, with voice prompts and real-time position tracking. Works offline. This is the recommended choice.
- **[Organic Maps](https://organicmaps.app)** (iOS and Android) — similar to OsmAnd, lightweight, fully offline.
- **[Komoot](https://komoot.com)** — good for walking and cycling routes; imports GPX and provides turn-by-turn.

The recommended workflow is:

1. Plan and refine your route in Maperati
2. Export as GPX (Export ▾ → GPX)
3. Import into OsmAnd or another navigation app for on-the-ground use

**About Maperati's built-in text directions.** Text directions are now generated from the **line you actually drew** — turns are detected directly from the route geometry, so detours, manual routing, and free-drawn sections are all reflected. Street names are added by reverse-geocoding each turn against OpenStreetMap.

Because the names come from map data rather than the line itself, a few caveats apply: near large squares or courtyards a turn may be labelled with a neighbouring street, and if the drawn line sits slightly off a street's centreline the name can be approximate (the turn *direction* is always correct — only the *name* is affected). For guaranteed on-the-ground accuracy, still use the GPX → OsmAnd workflow above.

---

## Requirements

- Python 3.9+
- A free [OpenRouteService API key](https://openrouteservice.org) (40 req/min on free tier)

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/mchughde/maperati.git
cd maperati

# 2. Install dependencies
pip install -r requirements.txt

# 3. Add your ORS API key
echo "ORS_API_KEY=your_key_here" > .env

# 4. Run
python3 app.py
```

Opens automatically at `http://localhost:5001`. The `.env` file is gitignored — never commit your API key.

The `+` / `−` zoom buttons step by **0.25** per click for fine-grained control.

---

## Travel mode

A compact dropdown pill sits below the route stats bar. Choose the travel mode that matches your planned activity:

| Mode | Speed used for time estimates | Routing profile |
|------|------------------------------|-----------------|
| **Walking** | 4.5 km/h | ORS foot-walking |
| **Running** | 10 km/h | ORS foot-walking |
| **Hiking** | 3.5 km/h | ORS foot-hiking |
| **Cycling** | 15 km/h | ORS cycling-regular |
| **Driving** | 60 km/h | ORS driving-car (ferries avoided) |

The active mode is shown on the pill. Click to expand, click a mode to switch. Switching when a route exists shows a reminder to re-draw for best results, since the routing profile has changed.

Mode is saved to your session and restored on reload.

---

## Drawing a route

Click **Draw ▾** in the bottom toolbar and choose a mode:

| Mode | Behaviour |
|------|-----------|
| **Snap** | Each click snaps to the nearest road node; ORS routes between points. A temporary dot appears at your click while routing is in progress. Each snap segment is a separate undo step. |
| **Free** | Line goes exactly where you click — useful for parks, plazas, alleys |

You can mix modes in the same route. Click **Stop drawing** when done.

While drawing is active, the **Tap map to add stop** button in the sidebar is disabled to prevent accidental stop creation.

**Edit ▾** gives you:
- **Undo / Redo** — full undo/redo system covering all major actions (drawing, stops, routes, erasures, reversals). Keyboard shortcuts: **Cmd+Z** (undo), **Cmd+Shift+Z** or **Cmd+Y** (redo)
- **Erase section** — click two points on the route; the section between them is removed and automatically rerouted
- **Reverse route** — flips the direction of the entire route and stop order; swaps Start/End roles
- **Clear entire route** — resets the drawn line

Right-click on the map (once a route exists) to:
- **Redo route from here** — trim the line and resume drawing from that point
- **Route via here** — force the route through that road by snapping and re-routing that segment
- **Clear entire route** — reset the drawn line

Click anywhere on the blue route line to see how far from the start that point is.

### Detour waypoints

Use **Route via here** to force the route through a specific road without manual redrawing.

- Right-click on any road (when a route exists, not while drawing) and select **Route via here**
- The app snaps to the nearest road node and re-routes the segment containing the nearest route point through that point
- An orange circle marker appears on the map — click it to remove the detour
- The detour is saved to your session and restored on reload
- Distance in the stats pill reflects the actual detoured path
- Use **Cmd+Z** to undo the detour and restore the original routing

---

## Stops & markers

Stops are named points that carry through to all exports. They can be numbered (sequenced along the route) or category markers (descriptive icons for points of interest).

### Adding stops
- **Tap map to add stop** — places a stop at the clicked location; a popup appears with a name field, a type grid, start/end options, and an **Add** button
- **Type row** in the sidebar sets the default type for new stops: Stop (numbered) or one of the category types; the popup grid reflects the current selection
- **Search for a place** — geocodes a name or address and adds it as a stop

### Stop types
| Type | Marker | Behaviour |
|------|--------|-----------|
| Stop (default) | Dark numbered circle | Sequenced; counted in route-to-next chain |
| Best street | Purple letter icon | Category; ordered by route proximity |
| Garden | Green icon | Category; ordered by route proximity |
| Museum | Blue icon | Category; ordered by route proximity |
| Church | Purple icon | Category; ordered by route proximity |
| Monument | Brown icon | Category; ordered by route proximity |
| Cafe/restaurant | Red icon | Category; ordered by route proximity |
| Market | Teal icon | Category; ordered by route proximity |

Category markers auto-insert between the nearest numbered stops when a route exists. In a mixed list, **Route to next** connects numbered stops only; if the list has only category markers, they are all connected in sequence.

### Managing stops
- Drag ⠿ to reorder; click ✎ to rename; click × to remove
- Click a stop's badge/icon in the sidebar to pan the map and open its popup
- Click ⋯ to set role (**Start** / **End** / **Set as start & end** loop) or change category
- Click **Add note** to add a free-text note (exported in all formats)
- Each stop shows walking distance and time from the previous stop
- **Route to next** button between consecutive numbered stops — auto-routes via ORS/OSRM

### Loop routes

Mark a stop as **Start & End** (via ⋯ → Set as start & end) to designate it as both the beginning and end of a loop route. It shows a split green/red pill marker. If that stop is not the last in your list, a **Route to close loop** button appears after the final stop — click it to automatically route back to the loop point and complete the circuit.

While drawing, clicking a stop marker or an imported POI dot routes the line through that exact location.

---

## Discover

The **Discover** sidebar section searches OpenStreetMap for nearby points of interest:

- Choose a category — **Cafe, Restaurant, Museum, Church, Park, Garden, Monument, Market** — to search the current map view
- Or type a name in the search box
- Results appear as purple markers; click one to add it as a stop (or as a route point if drawing)
- Click **Clear** to remove the results

Searches use the public Overpass API with an automatic fallback server, so if one endpoint is slow it retries against a second one transparently.

---

## Elevation profile

Click **Elevation** in the route stats pill (appears once a route is drawn) to open the profile panel.

- Distance grid lines show where elevations occur along the route
- Hover over the chart to see elevation and distance at any point; a marker moves on the map in sync
- Click on the chart to pan the map to that position
- GPX files with embedded `<ele>` tags use those values directly; otherwise elevation is fetched from ORS

---

## Importing

Drag a file onto the Import area or click to browse. Supported formats:

| Format | Route | Stops / waypoints |
|--------|-------|-------------------|
| **GPX** | Track / route points drawn as route line | `<wpt>` elements added as stops |
| **KML** | `<LineString>` drawn as route | `<Placemark>` points added as stops |
| **GeoJSON** | LineString features drawn as route | Point features added as stops |
| **CSV** | — | Rows with lat/lng shown as filterable POI dots |

CSV files use Paris open-data format (semicolon-delimited) by default.

---

## Exporting

Click **Export ▾**, enter a file name, and choose:

| Format | Contents |
|--------|----------|
| **GeoJSON** | Route line + stops as a FeatureCollection |
| **GPX** | Route as a track, stops as waypoints |
| **KML** | Route + stops for Google Earth / Maps |
| **CSV stops** | Stops table with name, lat, lng |
| **Export image (JPG)** | Map image of the export area with route and stop markers drawn on top |

All file exports are client-side — no data is sent anywhere.

For turn-by-turn navigation, export as GPX and import into OsmAnd or another navigation app — see [Navigation](#navigation) above.

### Image export

The JPG export stitches map tiles directly in the browser using the HTML5 Canvas API. To control exactly what area is captured:

1. Open **Export ▾** → click **Set image area** — cursor becomes a crosshair
2. Click the first corner, then the opposite corner — a dashed blue rectangle appears
3. Open **Export ▾** → click **Export image (JPG)**

Click **Clear area** to remove the rectangle and redefine. If no area is set, the export uses the route bounds.

**Tile CORS note:** OSM, CartoDB Positron, and ESRI Satellite all support cross-origin canvas access. The OSM Forte EN basemap does not — if it is active when you export, CartoDB Positron is substituted silently.

---

## Session persistence

The current route and stops are auto-saved to browser localStorage (`maperati_session`) after every change. They are restored automatically on page reload. Click **New route** to clear the session and start fresh.

To make a durable backup or move your work between machines:
- Click **Export ▾** → **Save session file** to download a `.json` snapshot
- Drop that file back into the Import area to restore everything exactly as you left it (editable route, named and roled stops, map position)

---

## Basemaps

The picker (top-right of map) switches between:

- **OSM Forte EN** (default) — detailed English-label style from Quai d'Orsay
- **OpenStreetMap** — standard OSM
- **CartoDB Positron** — clean minimal light style
- **CartoDB Voyager** — detailed street map with muted colours
- **ESRI Satellite** — aerial imagery

---

## Routing

[OpenRouteService](https://openrouteservice.org) (foot-walking profile) is the primary engine for both snapping and segment routing. If ORS fails or no key is set, the app falls back silently to the public [OSRM](http://router.project-osrm.org) server. ORS gives better coverage in central Paris where OSRM has known gaps.

Geocoding uses [Nominatim](https://nominatim.openstreetmap.org).

---

## File structure

```
maperati/
  index.html               — HTML structure
  static/
    app.css                — all styles
    state.js               — global state variables and CATEGORIES constant
    map-init.js            — Leaflet map, tile layers, basemap picker, north arrow
    icons.js               — marker icon factories and renderStopMarkers
    drawing.js             — undo/redo, draw modes, erase, route stats
    elevation.js           — elevation profile chart and fetch
    routing.js             — segment routing (ORS/OSRM)
    stops.js               — stop management, geocode, add-stop popup, reorder
    import.js              — file handling (CSV, GPX, KML, GeoJSON, session)
    exports.js             — GeoJSON/GPX/KML/CSV/directions/image exports
    discover.js            — Overpass API POI search with fallback endpoint
    ui.js                  — UI helpers, session persistence, map click dispatch
    init.js                — wires all event listeners, restores session on load
  app.py                   — Flask backend: routing proxy, elevation, CSV upload
  umap_walk_generator.py   — CSV parsing helper
  requirements.txt
  .env                     — ORS_API_KEY (gitignored, create locally)
```

---

## Notes

- Not yet optimised for mobile
- Tested on macOS with Safari
- The Discover section uses two Overpass API servers (`overpass-api.de` primary, `overpass.kumi.systems` fallback) with a 12-second timeout per attempt, so searches reliably complete even when one server is slow
