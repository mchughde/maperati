#!/usr/bin/env python3
"""
umap_walk_generator.py
======================
Generates a uMap-ready GeoJSON walking route from any CSV dataset.
Claude AI selects and sequences stops, writes popup descriptions,
and outputs a styled GeoJSON file you can drag straight into uMap.

Routes follow real walking paths via OSRM (Open Source Routing Machine)
by default, falling back to straight lines if OSRM is unavailable.

USAGE
-----
# AI-assisted stop selection (default, OSRM routing):
python3 umap_walk_generator.py \
    --csv espaces_verts.csv \
    --brief "Best parks in the 5th arrondissement for a 45-minute walk" \
    --output walk_5eme.geojson

# With explicit column config (for non-Paris CSVs):
python3 umap_walk_generator.py \
    --csv my_data.csv \
    --brief "Scenic viewpoints in Edinburgh for a 1-hour walk" \
    --lat-col latitude \
    --lng-col longitude \
    --name-col name \
    --delimiter "," \
    --output edinburgh_walk.geojson

# Manual stop selection (skip AI, provide row IDs):
python3 umap_walk_generator.py \
    --csv espaces_verts.csv \
    --manual-ids "40,43,38,33,10033,42" \
    --id-col "Identifiant espace vert" \
    --output my_walk.geojson

# Force straight lines (no OSRM):
python3 umap_walk_generator.py \
    --csv espaces_verts.csv \
    --brief "Parks in the 5th" \
    --no-routing \
    --output walk_straight.geojson

# Use a self-hosted OSRM instance:
python3 umap_walk_generator.py \
    --csv espaces_verts.csv \
    --brief "Parks in the 5th" \
    --osrm-url http://localhost:5000 \
    --output walk_5eme.geojson

REQUIREMENTS
------------
- Python 3.8+  (no third-party packages needed)
- ANTHROPIC_API_KEY environment variable (for AI stop selection)
- Internet access for OSRM public demo server (falls back gracefully)

OSRM NOTES
----------
Uses the public OSRM demo server (router.project-osrm.org) by default.
This is free but rate-limited — fine for occasional personal use.
For frequent/production use, self-host: https://github.com/Project-OSRM/osrm-backend

UMAP IMPORT
-----------
1. Go to https://umap.openstreetmap.fr and create a new map
2. Click the import icon (up-arrow) in the left toolbar
3. Drag your .geojson file onto the import panel
4. Click "Import" — markers and route appear immediately on OSM tiles
"""

import argparse
import csv
import json
import math
import os
import pathlib
import re
import sys
import time
import urllib.request
import urllib.error
from typing import Optional

# ─────────────────────────────────────────────
# CONFIG DEFAULTS
# ─────────────────────────────────────────────

DEFAULT_MODEL       = "claude-sonnet-4-6"
MAX_ROWS_TO_CLAUDE  = 300
MAX_STOPS           = 12
ANTHROPIC_API_URL   = "https://api.anthropic.com/v1/messages"

OSRM_PUBLIC_URL     = "https://router.project-osrm.org"
OSRM_PROFILE        = "foot"          # foot | bike | car
OSRM_TIMEOUT        = 15             # seconds per segment request
OSRM_RETRY_DELAY    = 1.5           # seconds between requests (be polite)

STOP_MARKER_COLOR   = "#3d5c3f"
ROUTE_COLOR         = "#3d5c3f"
ROUTE_OPACITY       = 0.8
ROUTE_WEIGHT        = 5
ROUTE_DASHARRAY     = ""            # solid line for real routes; set "8 6" for dashed


# ─────────────────────────────────────────────
# COORDINATE UTILITIES
# ─────────────────────────────────────────────

def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return distance in metres between two WGS-84 points."""
    R = 6_371_000
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2))
         * math.sin(d_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def decode_polyline(encoded: str) -> list[list[float]]:
    """
    Decode a Google/OSRM encoded polyline string into [[lng, lat], ...].
    OSRM returns geometry as an encoded polyline by default.
    """
    coords = []
    index = 0
    lat = 0
    lng = 0
    while index < len(encoded):
        for is_lng in (False, True):
            shift = 0
            result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if is_lng:
                lng += delta
                coords.append([lng / 1e5, lat / 1e5])  # GeoJSON: [lng, lat]
            else:
                lat += delta
    return coords


# ─────────────────────────────────────────────
# OSRM ROUTING
# ─────────────────────────────────────────────

def fetch_osrm_route(
    stops: list[dict],
    osrm_url: str = OSRM_PUBLIC_URL,
    profile: str = OSRM_PROFILE,
    timeout: int = OSRM_TIMEOUT,
) -> tuple[list[list[float]], float, bool]:
    """
    Request a walking route from OSRM for all stops in one call.
    Returns (coordinate_list, distance_metres, success).

    Uses the /route/v1/{profile}/{coords} endpoint with full geometry.
    Falls back gracefully — caller should check the success flag.
    """
    # Build coordinate string: lng,lat;lng,lat;...
    coord_str = ";".join(f"{s['_lng']},{s['_lat']}" for s in stops)
    url = (
        f"{osrm_url.rstrip('/')}/route/v1/{profile}/{coord_str}"
        f"?overview=full&geometries=polyline&steps=false"
    )

    print(f"  OSRM request: {len(stops)} stops via {osrm_url}")
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "umap-walk-generator/1.0 (personal use)"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())

        if data.get("code") != "Ok" or not data.get("routes"):
            print(f"  OSRM returned code={data.get('code')} — falling back to straight lines.")
            return [], 0, False

        route = data["routes"][0]
        distance_m = route.get("distance", 0)
        geometry = route.get("geometry", "")
        coords = decode_polyline(geometry)
        print(f"  ✓ OSRM route: {round(distance_m/1000, 2)} km, {len(coords)} geometry points")
        return coords, distance_m, True

    except Exception as e:
        print(f"  OSRM unavailable ({e}) — falling back to straight lines.")
        return [], 0, False


def straight_line_coords(stops: list[dict]) -> tuple[list[list[float]], float]:
    """Return straight-line coordinates and total distance."""
    coords = [[s["_lng"], s["_lat"]] for s in stops]
    dist = sum(
        haversine_m(stops[i-1]["_lat"], stops[i-1]["_lng"],
                    stops[i]["_lat"], stops[i]["_lng"])
        for i in range(1, len(stops))
    )
    return coords, dist


# ─────────────────────────────────────────────
# CSV LOADING
# ─────────────────────────────────────────────

def load_csv(
    path: str,
    delimiter: str = ";",
    lat_col: Optional[str] = None,
    lng_col: Optional[str] = None,
    geo_col: Optional[str] = None,
    geopoint_col: Optional[str] = None,
    name_col: Optional[str] = None,
    id_col: Optional[str] = None,
    encoding: str = "utf-8-sig",
) -> list[dict]:
    """
    Load a CSV and attach resolved (lat, lng) to each row as _lat, _lng.
    Auto-detects coordinate source if columns not specified.

    Resolution priority:
      1. Explicit --lat-col / --lng-col
      2. Explicit --geopoint-col  ('lat, lng' string)
      3. Explicit --geo-col       (GeoJSON geometry — centroid extracted)
      4. Auto-detect common column name patterns
    """
    csv.field_size_limit(10_000_000)  # handle large GeoJSON geometry columns
    rows = []
    with open(path, encoding=encoding, newline="") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        for row in reader:
            rows.append(dict(row))

    if not rows:
        raise ValueError("CSV appears to be empty.")

    cols = list(rows[0].keys())
    print(f"  Loaded {len(rows)} rows, {len(cols)} columns.")
    print(f"  Columns: {cols[:10]}{'...' if len(cols) > 10 else ''}")

    def find_col(patterns):
        for p in patterns:
            for c in cols:
                if p.lower() in c.lower():
                    return c
        return None

    if not any([lat_col, lng_col, geo_col, geopoint_col]):
        lat_col = find_col(["latitude", "lat", " y"])
        lng_col = find_col(["longitude", "lng", "lon", " x"])
        if not lat_col or not lng_col:
            lat_col, lng_col = None, None
            geo_col      = find_col(["geo shape", "geometry", "geom", "shape"])
            geopoint_col = find_col(["geo point", "geopoint", "point"])

    if not name_col:
        name_col = find_col(["name", "nom", "title", "label", "libelle"])
    if not id_col:
        id_col = find_col(["id", "identifiant", "code"])

    src = (f"lat={lat_col}, lng={lng_col}" if lat_col else
           f"geopoint={geopoint_col}" if geopoint_col else
           f"geo_shape={geo_col}" if geo_col else "unknown")
    print(f"  Coordinate source: {src}")
    print(f"  Name column: {name_col}")

    resolved, skipped = [], 0
    for row in rows:
        lat = lng = None

        if lat_col and lng_col:
            try:
                lat = float(row.get(lat_col, ""))
                lng = float(row.get(lng_col, ""))
            except (ValueError, TypeError):
                pass

        if lat is None and geopoint_col:
            val = row.get(geopoint_col, "").strip()
            if val:
                parts = re.split(r"[,\s]+", val)
                if len(parts) == 2:
                    try:
                        lat, lng = float(parts[0]), float(parts[1])
                    except ValueError:
                        pass

        if lat is None and geo_col:
            val = row.get(geo_col, "")
            if val:
                result = _centroid_from_geojson(val)
                if result:
                    lat, lng = result

        if lat is None or lng is None:
            skipped += 1
            continue

        row["_lat"]  = lat
        row["_lng"]  = lng
        row["_name"] = (row.get(name_col, "") if name_col else "") or f"Stop {len(resolved)+1}"
        row["_id"]   = str(row.get(id_col, len(resolved))) if id_col else str(len(resolved))
        resolved.append(row)

    print(f"  Resolved: {len(resolved)} rows ({skipped} skipped — no coordinates)")
    return resolved


def _centroid_from_geojson(geo_str: str) -> Optional[tuple[float, float]]:
    try:
        geo = json.loads(geo_str)
    except (json.JSONDecodeError, TypeError):
        return None
    coords = []

    def collect(obj):
        if isinstance(obj, list):
            if obj and isinstance(obj[0], (int, float)):
                coords.append(obj)
            else:
                for item in obj:
                    collect(item)

    if geo.get("type") == "Point":
        c = geo.get("coordinates", [])
        return (c[1], c[0]) if len(c) >= 2 else None
    collect(geo.get("coordinates", []))
    if not coords:
        return None
    return sum(c[1] for c in coords) / len(coords), sum(c[0] for c in coords) / len(coords)


# ─────────────────────────────────────────────
# MANUAL SELECTION
# ─────────────────────────────────────────────

def select_manual(rows: list[dict], id_col: str, id_list: list[str]) -> list[dict]:
    lookup = {str(r.get(id_col, r["_id"])).strip(): r for r in rows}
    selected = []
    for id_str in id_list:
        id_str = id_str.strip()
        if id_str in lookup:
            selected.append(lookup[id_str])
        else:
            print(f"  WARNING: ID '{id_str}' not found — skipping.")
    return selected


# ─────────────────────────────────────────────
# CLAUDE API
# ─────────────────────────────────────────────

def call_claude(system: str, user: str, api_key: str, max_tokens: int = 3000) -> str:
    payload = json.dumps({
        "model": DEFAULT_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }).encode("utf-8")

    req = urllib.request.Request(
        ANTHROPIC_API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read())["content"][0]["text"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Claude API error {e.code}: {e.read().decode()}") from e


def select_stops_with_claude(
    rows: list[dict],
    brief: str,
    api_key: str,
    max_stops: int = MAX_STOPS,
) -> tuple[list[dict], str, dict]:

    sample = rows[:MAX_ROWS_TO_CLAUDE]
    skip_heavy = {"Geo Shape", "geometry", "geom", "shape", "URL_PLAN"}

    row_summaries = []
    for r in sample:
        s = {"_id": r["_id"], "_name": r["_name"],
             "_lat": round(r["_lat"], 5), "_lng": round(r["_lng"], 5)}
        for k, v in r.items():
            if k.startswith("_") or k in skip_heavy:
                continue
            v = str(v).strip()
            if v:
                s[k] = v[:80]
        row_summaries.append(s)

    system = (
        "You are a specialist in urban geography and walking route design. "
        "Given a dataset of places and a brief, select the best stops, sequence them "
        "into a logical walking route, and write a short popup description for each. "
        "Respond with valid JSON only — no prose, no markdown fences."
    )

    user = f"""BRIEF: {brief}

DATASET:
{json.dumps(row_summaries, ensure_ascii=False)}

Select 4–{max_stops} stops that best satisfy the brief.
Sequence them to minimise backtracking.
Write a 2–3 sentence popup_description for each stop.

Return exactly this JSON:
{{
  "reasoning": "Paragraph explaining selection logic and route design.",
  "walk_title": "Short evocative title (max 10 words)",
  "walk_summary": "One sentence describing the walk.",
  "stops": [
    {{
      "_id": "id from dataset",
      "popup_description": "2–3 sentence description."
    }}
  ]
}}"""

    print("  Calling Claude to select and sequence stops...")
    response = call_claude(system, user, api_key)
    # Extract JSON block from anywhere in the response
    json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", response, re.DOTALL)
    if json_match:
        response = json_match.group(1)
    else:
        # Find the first { and last } and extract that
        start = response.find("{")
        end = response.rfind("}") + 1
        if start != -1 and end > start:
            response = response[start:end]

    try:
        data = json.loads(response)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Claude returned invalid JSON: {e}\n{response}") from e

    id_lookup = {r["_id"]: r for r in rows}
    selected = []
    for spec in data.get("stops", []):
        sid = str(spec["_id"])
        if sid in id_lookup:
            row = dict(id_lookup[sid])
            row["_popup"] = spec.get("popup_description", "")
            selected.append(row)
        else:
            print(f"  WARNING: Claude selected unknown ID '{sid}' — skipping.")

    meta = {
        "title":   data.get("walk_title", "Walking Route"),
        "summary": data.get("walk_summary", ""),
    }
    return selected, data.get("reasoning", ""), meta


# ─────────────────────────────────────────────
# GEOJSON GENERATION
# ─────────────────────────────────────────────

def build_geojson(
    stops: list[dict],
    walk_title: str = "Walking Route",
    walk_summary: str = "",
    route_coords: Optional[list[list[float]]] = None,
    distance_m: float = 0,
    routed: bool = False,
    route_color: str = ROUTE_COLOR,
    marker_color: str = STOP_MARKER_COLOR,
) -> dict:
    """
    Build a uMap-compatible GeoJSON FeatureCollection with:
      - One LineString for the route (OSRM or straight-line)
      - One Point per stop with popup description
    """
    features = []

    if route_coords is None:
        route_coords, distance_m = straight_line_coords(stops)

    dist_km    = round(distance_m / 1000, 2)
    est_mins   = round(distance_m / 80)   # ~80 m/min walking pace
    route_note = "Real walking route via OpenStreetMap" if routed else "Straight-line approximation"

    # ── Route LineString ──
    features.append({
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": route_coords},
        "properties": {
            "name": walk_title,
            "description": (
                f"{walk_summary}\n\n"
                f"Distance: ~{dist_km} km · Estimated time: ~{est_mins} min\n"
                f"_{route_note}_"
            ),
            "_umap_options": {
                "color":       route_color,
                "opacity":     ROUTE_OPACITY,
                "weight":      ROUTE_WEIGHT,
                "dashArray":   ROUTE_DASHARRAY,
                "smoothFactor": 1,
                "interactive": True,
                "showLabel":   False,
            },
        },
    })

    # ── Stop markers ──
    skip_keys = {
        "Geo Shape", "geometry", "geom", "shape", "URL_PLAN",
        "_lat", "_lng", "_name", "_id", "_popup",
    }
    for i, stop in enumerate(stops, start=1):
        extra = []
        for k, v in stop.items():
            if k in skip_keys or k.startswith("_"):
                continue
            v = str(v).strip()
            if v and len(v) < 120:
                extra.append(f"**{k}**: {v}")

        desc_parts = [f"**Stop {i} of {len(stops)}**"]
        if stop.get("_popup"):
            desc_parts.append(stop["_popup"])
        if extra:
            desc_parts.append("\n---\n" + "\n\n".join(extra[:6]))

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [stop["_lng"], stop["_lat"]]},
            "properties": {
                "name": f"{i}. {stop['_name']}",
                "description": "\n\n".join(desc_parts),
                "_umap_options": {
                    "color":            marker_color,
                    "iconClass":        "Circle",
                    "showLabel":        True,
                    "labelDirection":   "top",
                    "labelInteractive": False,
                },
            },
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "_umap_options": {
            "name":        walk_title,
            "description": walk_summary,
            "tilelayer": {
                "url_template": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "maxZoom": 19,
                "attribution": "© OpenStreetMap contributors",
                "name": "OpenStreetMap",
            },
            "zoom": 15,
            "miniMap": False,
            "moreControl": True,
            "scrollWheelZoom": True,
        },
    }


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description="Generate a uMap-ready GeoJSON walking route from any CSV dataset.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    # Input
    p.add_argument("--csv",       required=True, help="Path to input CSV")
    p.add_argument("--delimiter", default=";",   help="CSV delimiter (default: ;)")
    p.add_argument("--encoding",  default="utf-8-sig", help="CSV encoding")

    # Column config
    p.add_argument("--lat-col",      help="Latitude column name")
    p.add_argument("--lng-col",      help="Longitude column name")
    p.add_argument("--geo-col",      help="GeoJSON geometry column name")
    p.add_argument("--geopoint-col", help="'lat, lng' string column name")
    p.add_argument("--name-col",     help="Place name column")
    p.add_argument("--id-col",       help="Unique row ID column")

    # Stop selection (mutually exclusive)
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--brief",      help="Natural language brief for AI stop selection")
    mode.add_argument("--manual-ids", help="Comma-separated row IDs in desired order")

    # AI
    p.add_argument("--api-key",   help="Anthropic API key (or ANTHROPIC_API_KEY env var)")
    p.add_argument("--max-stops", type=int, default=MAX_STOPS, help=f"Max stops (default: {MAX_STOPS})")

    # Routing
    p.add_argument("--no-routing",  action="store_true", help="Skip OSRM; use straight lines")
    p.add_argument("--osrm-url",    default=OSRM_PUBLIC_URL, help=f"OSRM base URL (default: {OSRM_PUBLIC_URL})")
    p.add_argument("--osrm-profile",default=OSRM_PROFILE,   help=f"OSRM profile: foot|bike|car (default: {OSRM_PROFILE})")

    # Output / styling
    p.add_argument("--output",       default="walk.geojson", help="Output file path")
    p.add_argument("--marker-color", default=STOP_MARKER_COLOR)
    p.add_argument("--route-color",  default=ROUTE_COLOR)

    args = p.parse_args()

    print("\n── uMap Walk Generator ─────────────────────────────")
    print(f"  Input:   {args.csv}")
    print(f"  Output:  {args.output}")
    print(f"  Mode:    {'AI-assisted' if args.brief else 'Manual'}")
    print(f"  Routing: {'straight lines (--no-routing)' if args.no_routing else args.osrm_url}")
    print("────────────────────────────────────────────────────\n")

    # 1. Load CSV
    print("→ Loading CSV...")
    rows = load_csv(
        path=args.csv, delimiter=args.delimiter, encoding=args.encoding,
        lat_col=args.lat_col, lng_col=args.lng_col,
        geo_col=args.geo_col, geopoint_col=args.geopoint_col,
        name_col=args.name_col, id_col=args.id_col,
    )
    if not rows:
        sys.exit("ERROR: No rows with coordinates found. Check column config.")

    # 2. Select stops
    walk_meta = {"title": "Walking Route", "summary": ""}

    if args.brief:
        api_key = args.api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            sys.exit("ERROR: --api-key or ANTHROPIC_API_KEY required for AI mode.")
        print("\n→ Selecting stops with Claude AI...")
        selected, reasoning, walk_meta = select_stops_with_claude(
            rows, args.brief, api_key, args.max_stops
        )
        print(f"\n── Claude's reasoning ──────────────────────────────")
        print(reasoning)
        print("────────────────────────────────────────────────────\n")
    else:
        print("\n→ Manual stop selection...")
        id_col = args.id_col or "_id"
        selected = select_manual(rows, id_col,
                                 [x.strip() for x in args.manual_ids.split(",")])
        for stop in selected:
            stop.setdefault("_popup", "")

    if not selected:
        sys.exit("ERROR: No stops selected.")

    print(f"\n→ Selected {len(selected)} stops:")
    for i, s in enumerate(selected, 1):
        suffix = ""
        if i > 1:
            d = haversine_m(selected[i-2]["_lat"], selected[i-2]["_lng"],
                            s["_lat"], s["_lng"])
            suffix = f"  ({round(d)}m from previous, straight-line)"
        print(f"  {i}. {s['_name']}{suffix}")

    # 3. Route via OSRM (or straight lines)
    route_coords = None
    distance_m   = 0
    routed       = False

    if not args.no_routing:
        print(f"\n→ Fetching walking route from OSRM ({args.osrm_profile})...")
        route_coords, distance_m, routed = fetch_osrm_route(
            selected, osrm_url=args.osrm_url, profile=args.osrm_profile
        )

    if not routed:
        route_coords, distance_m = straight_line_coords(selected)
        print(f"  Using straight-line route: {round(distance_m/1000, 2)} km")

    # 4. Build & write GeoJSON
    print("\n→ Building GeoJSON...")
    geojson = build_geojson(
        selected,
        walk_title   = walk_meta.get("title", "Walking Route"),
        walk_summary = walk_meta.get("summary", ""),
        route_coords = route_coords,
        distance_m   = distance_m,
        routed       = routed,
        route_color  = args.route_color,
        marker_color = args.marker_color,
    )

    out_path = pathlib.Path(args.output)
    out_path.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")

    est_mins = round(distance_m / 80)
    print(f"\n── Done ────────────────────────────────────────────")
    print(f"  File:     {out_path.resolve()}")
    print(f"  Stops:    {len(selected)}")
    print(f"  Distance: ~{round(distance_m/1000, 2)} km ({'routed' if routed else 'straight-line'})")
    print(f"  Time:     ~{est_mins} min walking")
    print(f"\n  ✓ Drag '{out_path.name}' into uMap to import.")
    print(f"    https://umap.openstreetmap.fr")
    print("────────────────────────────────────────────────────\n")


if __name__ == "__main__":
    main()
