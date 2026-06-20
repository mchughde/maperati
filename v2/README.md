# Maperati v2

A local browser app for planning and exporting walking routes in Paris (and anywhere else). Built on MapLibre GL JS with vector and raster map styles, ORS/OSRM routing, and a full suite of export formats.

---

## Quick start

```bash
cd "/Users/diannemchugh/Library/CloudStorage/GoogleDrive-mchughde@gmail.com/My Drive/Map Generator/maperati"
python3 app.py
```

Open **http://localhost:5001/v2** in your browser.

To reload after code changes: type `location.reload(true)` in the browser console. Cmd+Shift+R does not work.

---

## Map styles

The style switcher (top-right) offers:

| Style | Type | Notes |
|-------|------|-------|
| OSM Bright | Vector | Default — crisp, detailed street map |
| Liberty | Vector | Softer colour palette |
| Positron | Vector | Minimal, light grey |
| OpenStreetMap | Raster | Standard OSM tiles |
| CartoDB Light | Raster | Clean, light background |
| CartoDB Voyager | Raster | Colourful raster street map |
| ESRI Satellite | Raster | Aerial imagery — useful for checking locations |

All styles cover the entire world. Vector styles render client-side via WebGL and look sharpest, especially at fractional zoom levels. Raster styles fetch pre-rendered tiles.

To add a new style, add one entry to `static/styles-config.js` — no other changes needed.

---

## Drawing a route

1. Click **Draw ▾** in the bottom toolbar
2. Choose **Snap** (follows roads) or **Free** (exact path)
3. Click on the map to add points
4. Click **Draw ▾ → Stop drawing** or use the Edit menu when done

**Snap mode** calls the ORS/OSRM routing API to snap each click to the nearest road node within 40m. A temporary blue dot appears at your raw click while the snap resolves.

**Free mode** draws a straight line exactly where you click — useful for footpaths, parks, and areas the router doesn't cover well.

**Zoom**: use + / − buttons (top-left) for 0.25-step zoom, or scroll wheel. Right-click drag tilts the map (useful with vector styles to see building depth).

---

## Adding stops & markers

**Method 1 — Tap map**: click "Tap map to add stop" in the sidebar, then click anywhere on the map. A popup opens where you name the stop and choose its type.

**Method 2 — Search**: type a name or address in the "Search for a place" field. Click a result to open the add-stop popup at that location.

**Method 3 — Click a dataset dot**: if you've imported a dataset, click any grey dot to add it as a stop.

**Method 4 — Click an OSM POI**: after a Discover search, click any purple dot.

### Stop types
- **Numbered** (default) — dark circle with auto-incrementing number
- **Category markers** — 19 types: Best street, Garden, Museum, Church, Monument, Cafe/restaurant, Market, Accommodation, Shop, Transport, Viewpoint, Theatre, Facilities, Bar/wine, Library, plus 4 custom colour dots (Rose, Amber, Sky, Lime)

### Stop roles
Set via the ⋯ menu on each stop in the sidebar:
- **Start** — green pill at that location
- **End** — red pill
- **Start & End** — split green/red pill for loop routes

### Stop features
- **Drag to reorder** using the ⠿ handle
- **Rename** with the ✎ button
- **Notes** — click "Add note" under any stop; saved and exported
- **Route to next** — appears between consecutive stops; routes via ORS/OSRM
- **Locate** — click the stop's badge in the sidebar to pan to it

---

## Editing the route

All editing is in **Edit ▾** (bottom toolbar, appears once a route exists):

- **Undo / Redo** — full undo/redo covering drawing, stops, erasure, reversal. Keyboard: Cmd+Z / Cmd+Shift+Z. Up to 20 undo steps.
- **Erase section** — click two points on the route; the section between them is removed and automatically rerouted
- **Reverse route** — reverses the entire line and swaps stop order
- **Clear entire route** — removes the route line (stops remain)

**Right-click on the map** (when a route exists) opens a context menu:
- **Redo route from here** — trims the route to the nearest point and resumes drawing from there
- **Route via here** — forces the route through a specific point (orange detour marker); click the marker to remove it

---

## Travel modes

The mode pill (top-centre, next to route stats) sets the routing profile:

| Mode | Profile | Speed used for time estimate |
|------|---------|------------------------------|
| Walking | ORS foot-walking | ~4.5 km/h |
| Running | ORS foot-walking | ~10 km/h |
| Hiking | ORS foot-hiking | ~3.5 km/h |
| Cycling | ORS cycling-regular | ~15 km/h |
| Driving | ORS driving-car | ~60 km/h |

Switching mode after drawing a route shows a toast to re-draw — the routing profile has changed so existing segments may not match the new mode.

---

## Discover (OSM POI search)

The **Discover** section searches OpenStreetMap for places in the current map view via the Overpass API:

Categories: Cafe, Restaurant, Museum, Church, Park, Garden, Monument, Market

Results appear as **purple dots**. Click a dot to open the add-stop popup (name pre-filled). Click **Clear** to remove them.

Primary endpoint: `overpass-api.de` — falls back to `overpass.kumi.systems` on timeout.

---

## Importing data

Drag a file onto the drop zone (or click to browse). Supported formats:

| Format | What happens |
|--------|-------------|
| **GPX** | Track/route → drawn as route line; waypoints → added as stops; elevation pre-loaded from `<ele>` tags |
| **GeoJSON** | Points → dataset dots on map; LineString → drawn as route |
| **KML** | Placemarks → dataset dots |
| **CSV** | Points → dataset dots (requires lat/lng columns); delimiter auto-detected |
| **Session JSON** | Restores a previously saved Maperati session completely |

### Dataset filters (after CSV/GeoJSON import)
- **Filter by arrondissement** — Paris 1er–20e dropdown
- **Search by name** — filters dots by name in real time
- **Filter by area** — draw a rectangle on the map to show only dots inside it
- **POI markers visible** — toggle dot visibility on/off

---

## Exports

All exports are client-side (no server involved for data formats).

### Data formats
In the **Export ▾** menu (top-right): set a file name, then choose:
- **GeoJSON** — route line + stops with colours
- **GPX** — route track + waypoints with notes
- **KML** — route + placemarks for Google Earth/Maps
- **CSV stops** — stop list with lat/lng, role, category, notes
- **Text directions** — turn-by-turn directions derived from the drawn route geometry (not re-routed between stops)

### Image export (JPG)
1. Optionally click **Set image area** to draw a rectangle defining the crop
2. Choose a **Print quality** setting:
   - **Screen** — current screen resolution (already 2× on Retina); good for on-screen use
   - **2×** — doubles the canvas size; good for A4 printing (~200 DPI on Retina)
   - **3×** — triples the canvas size; best print quality (~300 DPI on Retina)
3. Click **Export image (JPG)**

The map fits to the print area (or route bounds), then composites the MapLibre canvas with hand-drawn stop markers on top. Higher resolution settings take a few seconds longer while the map re-renders. Higher-res files are named with a suffix (`_2x.jpg`, `_3x.jpg`).

**Note on raster styles**: Vector styles (OSM Bright, Liberty, Positron) benefit fully from higher resolution — text and lines are genuinely crisper. Raster styles (OpenStreetMap, CartoDB, ESRI Satellite) use fixed-size tiles so gain less — Screen or 2× is sufficient for those.

### Session file
**Save session file** downloads a `.json` snapshot of everything — route, stops, names, roles, notes, detour points, map position. Drop it back into Import to restore exactly.

---

## Elevation profile

Once a route is drawn, click **Elevation** in the route stats pill (top-centre):
- Hover over the chart to see distance and elevation at any point; a blue marker appears on the map
- Click the chart to pan the map to that location
- Elevation data comes from GPX `<ele>` tags (if imported) or the ORS elevation API

---

## Route stats

The stats pill shows **total distance** and **estimated time** based on the active travel mode. Time is a straight calculation from distance and mode speed — not a routing estimate.

---

## Session auto-save

The session is saved automatically to `localStorage` (key: `maperati_v2_session`) after every significant action. It restores on page reload. It does not conflict with v1's session (different key).

---

## API and routing

The Flask backend at `app.py` (shared with v1) provides:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/snap-point` | Snap a click to nearest road node (ORS primary, OSRM fallback) |
| `POST /api/snap-segment` | Route between two points |
| `POST /api/elevation` | Elevation profile for route coords |
| `POST /api/match-directions` | Geometry-first text directions |
| `POST /api/upload-csv` | Server-side CSV parsing |

**ORS API key**: stored in `.env` as `ORS_API_KEY=...` (gitignored). Get a free key at openrouteservice.org. Without it, all routing falls back to public OSRM — which works but has known gaps in central Paris (Place de la Concorde, parts of Rue de Rivoli).

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+Z | Undo (or undo last draw point while drawing) |
| Cmd+Shift+Z | Redo |
| Cmd+Y | Redo (alternative) |

---

## Colour scheme

| Element | Colour |
|---------|--------|
| Route line | `#2563EB` (blue) |
| Start marker | `#16a34a` (green) |
| End marker | `#dc2626` (red) |
| UI accent / border | `#D0E3FF` |
| Background | `#F5F8FF` |
| Text | `#1A1D2E` |

---

## Project structure

```
maperati/
├── app.py              ← Flask backend (shared with v1)
├── .env                ← ORS_API_KEY (gitignored)
├── index.html          ← v1 app (untouched)
├── static/             ← v1 JS/CSS (untouched)
└── v2/
    ├── README.md       ← this file
    ├── CLAUDE.md       ← developer/AI notes
    ├── index.html
    └── static/         ← v2 JS/CSS (13 files, ~3,250 lines)
```

V1 remains fully functional at `http://localhost:5001` and is unaffected by any v2 changes.
