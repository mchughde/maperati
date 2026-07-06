# Maperati v3

A browser app for planning and exporting walking routes in Paris (and anywhere else). Draw a route by tapping the map, add and organise stops, and export to GPX/KML/GeoJSON, an image, or an embeddable interactive map you can drop into any website. For turn-by-turn navigation, export a **GPX track** and open it in a nav app such as OsmAnd.

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
- Setting a role also moves the stop to the right place in the list: **Start** jumps to the top, **End** to the bottom. The list order is the route order.

### Working with the stop list
- **Drag to reorder** with the ⠿ handle (touch: press and hold, then drag).
- **Rename** (✎), set **role/category** (⋯), add a **note**, or **remove** (×).
- **Route to next** appears between consecutive stops — routes that leg along roads and stitches it into the right place in the existing line by stop order (so you can add a **Start** or **End** *after* drawing the rest of the route, then route just that leg — no need to clear and start over).
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

**Right-click the map** (desktop) — or **press and hold** it (iPad/touch) — for a context menu:
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

Categories: Cafe, Restaurant, Museum, Church, Park, Garden, Monument, Market, Metro, Accommodation.

Results appear as **purple dots** — tap one to open the add-stop popup (name pre-filled), or **Clear** to remove them. Primary endpoint `overpass-api.de`, falling back to `overpass.kumi.systems` on timeout. (Metro dots are named stations; Accommodation searches `tourism=hotel` and includes both point- and building-mapped hotels.)

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
- **GPX** — your drawn line as a `<trk>` **track** (point-by-point), plus stops as `<wpt>` waypoints with notes. The track is written whenever a route line exists; import it into a nav app such as **OsmAnd** (choose *navigate along track*) for turn-by-turn that follows your exact line. This replaces the old in-app text directions.
- **KML** — route + placemarks for Google Earth/Maps.
- **CSV stops** — stop list with lat/lng, role/category, notes.
- **Image (JPG)** — optionally **Set image area** (drag a rectangle), pick a **Print quality** (Screen / 2× / 3×), then **Export image (JPG)**. Vector styles benefit most from higher quality; raster styles gain less.
- **Embed / share on a website** — generates a copy-paste `<iframe>` snippet and a direct link that show your route in a read-only interactive map. The whole route lives inside the link (no account or server), so it works anywhere you can paste HTML. **Preview** opens it in a new tab. See [Embedding on a website](#embedding-on-a-website).
- **Save session file** — a `.json` snapshot of everything (route, stops, names, roles, notes, detours, map position). Drop it back into Import to restore exactly.

---

## Embedding on a website

**Export ▾ → Embed / share on a website** turns your current route into a read-only interactive map you can put on any web page.

- **Embed code** — a copy-paste `<iframe>` snippet. Paste it into any site or CMS and visitors get a live map they can pan, zoom, and tap (stops show their names). They can't edit.
- **Direct link** — the same map as its own page (`embed.html`), handy for sharing or opening full-screen.
- **Preview** opens the embed in a new tab so you can check it before copying.

How it works: the entire route (line + stops + basemap choice) is encoded into the link itself — there is no Maperati server storing it. Because v3 is static, this keeps everything self-contained; the generated link points at wherever the app is hosted (e.g. the GitHub Pages `embed.html`).

Optional URL tweaks you can append to an embed link:

| Add to the link | Effect |
|-----------------|--------|
| `?static=1` (before the `#`) | Locks the map — no drag/zoom, just a fixed picture of the route |
| `?stats=0` (before the `#`) | Hides the distance/time pill |

**Note:** very long routes make a long link. The dialog warns you past ~8000 characters — most browsers and platforms handle it, but a few CMSes cap URL length, in which case simplify the route.

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
| Nominatim (OpenStreetMap) | Place search (geocoding) |
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
├── embed.html        ← standalone read-only viewer for website embeds
├── manifest.json     ← PWA manifest (Add to Home Screen)
├── icon-192.svg      ← app icon
├── README.md         ← this file
├── CLAUDE.md         ← developer / AI notes
└── static/
    ├── app.css           ← all styles
    ├── styles-config.js  ← map style registry
    ├── state.js          ← globals, CATEGORIES, TRAVEL_MODES, helpers
    ├── share.js          ← embed-link encode/decode (shared by app + embed.html)
    ├── api.js            ← ORS/OSRM/Nominatim calls (snap, route, matrix, geocode)
    ├── map-init.js       ← MapLibre map, controls, GeoJSON layers
    ├── icons.js          ← marker elements + renderStopMarkers
    ├── drawing.js        ← draw modes, undo/redo, erase, detours
    ├── elevation.js      ← elevation chart
    ├── routing.js        ← route-between-stops helpers
    ├── stops.js          ← stop CRUD, geocode, drag-reorder
    ├── import.js         ← file parsing, filters, area/print rectangles
    ├── exports.js        ← all exports + image/print + embed/share
    ├── discover.js       ← Overpass POI search
    ├── ui.js             ← sidebar, dropdowns, session, ORS-key modal
    ├── embed.js          ← embed.html viewer logic
    └── init.js           ← wires events; restores session (loads last)
```

## Caching

Every asset link in `index.html` carries a `?v=N` query (bumped per file as it changes). **Bump the `?v=N` on every JS/CSS file you edit** — otherwise Safari may serve stale files, which looks like a bug. (Cached files masquerading as bugs is a recurring gotcha: confirm the loaded version before chasing a "still broken" report.)
