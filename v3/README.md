# Maperati v3

A browser app for planning and exporting walking routes in Paris (and anywhere else). Draw a route by tapping the map, add and organise stops, and export to GPX/KML/GeoJSON, an image, or street-by-street text directions.

**v3 is a fully static app — there is no server or backend.** It runs entirely in the browser and is hosted on GitHub Pages, so it also works on an iPad (including "Add to Home Screen"). All routing, geocoding, and map data come from public web services called directly from the browser.

**Live:** https://mchughde.github.io/maperati/v3/

---

## Running it

- **Normal use:** just open the live URL above. Nothing to install.
- **On an iPad:** open the live URL in Safari, then **Share → Add to Home Screen** to launch it full-screen like an app (see [PWA](#install-on-ipad-pwa)).
- **Local development:** serve the `v3/` folder with any static file server and open it — for example:
  ```bash
  cd ".../Map Generator/maperati/v3"
  python3 -m http.server 8000     # then open http://localhost:8000/
  ```
  No Python app, Flask, or build step is involved — the server only needs to serve static files.

**Reloading after a code change:** type `location.reload(true)` in the browser console. Cmd+Shift+R does not reliably clear the cache here. (Developers: also bump the `?v=N` query on the asset links in `index.html` — see [Caching](#caching).)

---

## API key (OpenRouteService) — optional but recommended

Click **API key** in the header to paste a free [OpenRouteService](https://openrouteservice.org/dev/#/signup) (ORS) token.

- The key is saved **only in your browser** (`localStorage`) and never leaves your device or goes into the repo.
- **With a key:** road-snapping, routing, and the elevation profile use ORS, which has the best coverage in central Paris.
- **Without a key:** snapping and routing automatically fall back to the public **OSRM** service (works, but has gaps around Place de la Concorde and parts of Rue de Rivoli). The **elevation profile requires a key**.
- **Text directions do not need a key** (street names come from OpenStreetMap’s Nominatim).

Use the **API key** button again at any time to change or remove the saved key.

---

## Install on iPad (PWA)

`manifest.json` + an app icon make Maperati installable:

1. Open the live URL in Safari on the iPad.
2. **Share → Add to Home Screen.**
3. Launch from the home-screen icon — it opens standalone (no browser chrome).

Drawing is **tap-based** and works with finger or Apple Pencil (a quick pen tap adds a point; a pen drag pans the map).

---

## Map styles

The style switcher (top-right) offers seven worldwide styles:

| Style | Type | Notes |
|-------|------|-------|
| OSM Bright | Vector | Default — crisp, detailed street map |
| Liberty | Vector | Softer colour palette |
| Positron | Vector | Minimal, light grey |
| OpenStreetMap | Raster | Standard OSM tiles |
| CartoDB Light | Raster | Clean, light background |
| CartoDB Voyager | Raster | Colourful raster street map |
| ESRI Satellite | Raster | Aerial imagery — useful for checking locations |

Vector styles (from OpenFreeMap) render client-side via WebGL and look sharpest, especially at fractional zoom. Raster styles fetch pre-rendered tiles. To add a style, add one entry to `static/styles-config.js` — nothing else needs to change.

---

## Drawing a route

1. Click **Draw ▾** in the bottom toolbar.
2. Choose **Snap** (follows roads) or **Free** (exact path).
3. Tap the map to add points.
4. **Draw ▾ → Stop drawing** when done.

- **Snap mode** snaps each tap to the nearest road within 40 m (ORS, or OSRM without a key). A temporary blue dot shows your raw tap while the snap resolves.
- **Free mode** draws a straight line exactly where you tap — useful for footpaths, parks, and areas the router covers poorly.
- **Zoom:** the **+ / −** buttons (top-left) step by 0.25 for fine control; scroll/pinch also work.

---

## Adding stops & markers

- **Tap map** — click **Tap map to add stop** in the sidebar, then tap the map. A popup opens to name the stop and pick its type.
- **Search a place** — type a name or address in **Search for a place** (Nominatim, worldwide); pick a result to open the popup there.
- **Dataset dot** — after importing a dataset, tap any grey dot to add it.
- **Discover dot** — after a [Discover](#discover-osm-poi-search) search, tap any purple dot.

### Stop types
- **Numbered** (default) — dark circle with an auto-incrementing number.
- **Category markers** — 19 types: Best street, Garden, Museum, Church, Monument, Cafe/restaurant, Market, Accommodation, Shop, Transport, Viewpoint, Theatre, Facilities, Bar/wine, Library, plus four custom colour dots (Rose, Amber, Sky, Lime).

### Stop roles (⋯ menu on each stop)
- **Start** — green pill · **End** — red pill · **Start & End** — split green/red pill for loop routes.

### Working with the stop list
- **Drag to reorder** with the ⠿ handle (touch: press and hold, then drag).
- **Rename** (✎), set **role/category** (⋯), add a **note**, or **remove** (×).
- **Route to next** appears between consecutive stops — routes that leg along roads.
- **Route all stops** (footer) routes every consecutive pair in order.
- **Optimise order** (footer, with 3+ stops) reorders your stops into the shortest **walking** route between them using real road distances (ORS/OSRM); then press *Route all stops* to draw it. Any stop you’ve pinned as **Start**, **End**, or loop point stays in place — only the stops in between are reordered.
- **Locate** — tap a stop’s badge in the sidebar to pan to it.

---

## Editing the route

**Edit ▾** (bottom toolbar, appears once a route exists):

- **Undo / Redo** — covers drawing, stops, erase, reverse (up to 20 steps). Keyboard: **Cmd+Z** / **Cmd+Shift+Z**.
- **Erase section** — tap two points on the route; the bit between them is removed and re-routed.
- **Reverse route** — reverses the line and swaps stop order.
- **Clear entire route** — removes the line (stops remain).

**Right-click the map** (desktop) for a context menu:
- **Open in Street View** — opens Google Street View at that point (always available).
- **Redo route from here** — trims to the nearest route point and resumes drawing (needs a route).
- **Route via here** — forces the route through a point with an orange detour marker; tap the marker to remove it (needs a route).
- **Clear entire route**.

---

## Travel modes

The mode pill (top-centre, next to route stats) sets the routing profile and the speed used for the time estimate:

| Mode | Profile | Speed |
|------|---------|-------|
| Walking | foot-walking | ~4.5 km/h |
| Running | foot-walking | ~10 km/h |
| Hiking | foot-hiking | ~3.5 km/h |
| Cycling | cycling-regular | ~15 km/h |
| Driving | driving-car | ~60 km/h |

Switching mode after drawing shows a toast to re-draw, since the routing profile changed.

---

## Discover (OSM POI search)

**Discover** searches OpenStreetMap for places in the current map view via the Overpass API.

Categories: Cafe, Restaurant, Museum, Church, Park, Garden, Monument, Market.

Results appear as **purple dots** — tap one to open the add-stop popup (name pre-filled), or **Clear** to remove them. Primary endpoint `overpass-api.de`, falling back to `overpass.kumi.systems` on timeout.

---

## Importing data

Drag a file onto the drop zone (or click to browse):

| Format | What happens |
|--------|-------------|
| **GPX** | Track/route → route line; waypoints → stops; elevation pre-loaded from `<ele>` tags |
| **GeoJSON** | Points → dataset dots; LineString → route |
| **KML** | Placemarks → dataset dots |
| **CSV** | Points → dataset dots (needs lat/lng columns); delimiter auto-detected, parsed in-browser |
| **Session JSON** | Restores a previously saved Maperati session completely |

After a CSV/GeoJSON import you also get: **arrondissement filter** (Paris), **name search**, **filter by area** (draw a rectangle), and a **POI visibility** toggle.

---

## Exports

All exports run in the browser. Open **Export ▾** (header), set a file name, then choose:

- **GeoJSON** — route line + stops with colours.
- **GPX** — route track + waypoints with notes.
- **KML** — route + placemarks for Google Earth/Maps.
- **CSV stops** — stop list with lat/lng, role/category, notes.
- **Text directions** — street-by-street directions **derived from your drawn line** (not re-routed between stops). Street names are looked up from OpenStreetMap, so it shows `Building… n/n` progress for a few seconds, then offers the file (on iPad, tap the **“Directions ready — tap to save”** link). Needs at least 2 stops and a drawn route.
- **Image (JPG)** — optionally **Set image area** (drag a rectangle), pick a **Print quality** (Screen / 2× / 3×), then **Export image (JPG)**. Vector styles benefit most from higher quality; raster styles gain less.
- **Save session file** — a `.json` snapshot of everything (route, stops, names, roles, notes, detours, map position). Drop it back into Import to restore exactly.

---

## Elevation profile

Once a route is drawn, click **Elevation** in the route-stats pill:
- Hover the chart for distance + elevation at any point (a marker appears on the map); click to pan there.
- Data comes from GPX `<ele>` tags (if imported) or the ORS elevation API — so the live profile **requires an ORS key**.

---

## Route stats

The stats pill shows **total distance** and **estimated time** for the active travel mode. Time is distance ÷ mode speed, not a routing estimate.

---

## Session auto-save

The session is saved to `localStorage` (key `maperati_v3_session`) after every significant action and restored on reload. The key is unique to v3.

---

## Data sources & privacy

Everything runs client-side; there is no Maperati server. The app talks directly to:

| Service | Used for |
|---------|----------|
| OpenFreeMap | Vector map tiles |
| OpenStreetMap / CartoDB / ESRI | Raster map tiles |
| OpenRouteService (ORS) | Snapping, routing, elevation, distance matrix (with your key) |
| OSRM | Routing & distance-matrix fallback (no key) |
| Nominatim (OpenStreetMap) | Place search + street names for directions |
| Overpass | Discover POI search |

Your route, stops, and ORS key stay in your browser’s `localStorage`. Exported files are generated and downloaded locally.

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+Z | Undo (or undo last point while free-drawing) |
| Cmd+Shift+Z / Cmd+Y | Redo |

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
v3/
├── index.html        ← markup + script tags (load order matters)
├── manifest.json     ← PWA manifest (Add to Home Screen)
├── icon-192.svg      ← app icon
├── README.md         ← this file
├── CLAUDE.md         ← developer / AI notes
└── static/
    ├── app.css           ← all styles
    ├── styles-config.js  ← map style registry
    ├── state.js          ← globals, CATEGORIES, TRAVEL_MODES, helpers
    ├── api.js            ← ORS/OSRM/Nominatim calls + directions pipeline
    ├── map-init.js       ← MapLibre map, controls, GeoJSON layers
    ├── icons.js          ← marker elements + renderStopMarkers
    ├── drawing.js        ← draw modes, undo/redo, erase, detours
    ├── elevation.js      ← elevation chart
    ├── routing.js        ← route-between-stops helpers
    ├── stops.js          ← stop CRUD, geocode, drag-reorder
    ├── import.js         ← file parsing, filters, area/print rectangles
    ├── exports.js        ← all exports + image/print
    ├── discover.js       ← Overpass POI search
    ├── ui.js             ← sidebar, dropdowns, session, ORS-key modal
    └── init.js           ← wires events; restores session (loads last)
```

## Caching

Every asset link in `index.html` carries a `?v=N` query (currently `?v=10`). **Bump `N` on every JS/CSS change** — otherwise Safari may serve stale files, which looks like a bug.
