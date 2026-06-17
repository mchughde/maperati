#!/usr/bin/env python3
"""
Walking Map App — Flask backend (API-free version)
Run: bash start.sh  →  opens http://localhost:5001
"""

import json
import math
import os
import pathlib
import sys
import urllib.request
import urllib.error
import webbrowser
from threading import Timer

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory

load_dotenv()

BASE_DIR = pathlib.Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")

OSRM_URL     = "http://router.project-osrm.org"
OSRM_PROFILE = "foot"

ORS_API_KEY  = os.environ.get("ORS_API_KEY", "")
ORS_BASE          = "https://api.openrouteservice.org/v2"
ORS_ELEVATION_URL = "https://api.openrouteservice.org/elevation/line"

# ── Debug helper ──────────────────────────────────────────────────────────────

_DBG_LOG = BASE_DIR / "debug_directions.log"

def _dbg(msg):
    import datetime
    line = f"{datetime.datetime.now().isoformat()} {msg}\n"
    print(line, end="")
    with open(_DBG_LOG, "a") as f:
        f.write(line)


# ── Polyline decoder ─────────────────────────────────────────────────────────

def decode_polyline(encoded):
    coords = []
    index = lat = lng = 0
    while index < len(encoded):
        for is_lng in (False, True):
            shift = result = 0
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
                coords.append([lat / 1e5, lng / 1e5])  # [lat, lng]
            else:
                lat += delta
    return coords


# ── Static ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(str(BASE_DIR), "index.html")


@app.route("/api/has-api-key")
def has_api_key():
    return jsonify({"has_key": bool(os.environ.get("ANTHROPIC_API_KEY", ""))})


# ── CSV upload ────────────────────────────────────────────────────────────────

@app.route("/api/upload-csv", methods=["POST"])
def upload_csv():
    if "file" not in request.files:
        return jsonify({"error": "No file"}), 400

    f = request.files["file"]
    delimiter = request.form.get("delimiter", ";")
    encoding  = request.form.get("encoding", "utf-8-sig")

    tmp = BASE_DIR / f"_tmp_{f.filename}"
    f.save(str(tmp))

    try:
        from umap_walk_generator import load_csv
        rows = load_csv(str(tmp), delimiter=delimiter, encoding=encoding)
        tmp.unlink(missing_ok=True)
    except Exception as e:
        tmp.unlink(missing_ok=True)
        return jsonify({"error": str(e)}), 500

    stops = [
        {"id": r["_id"], "name": r["_name"], "lat": r["_lat"], "lng": r["_lng"]}
        for r in rows
    ]
    # Detect columns for UI info
    cols = list(rows[0].keys()) if rows else []
    visible_cols = [c for c in cols if not c.startswith("_")]

    return jsonify({"stops": stops, "columns": visible_cols[:8], "count": len(stops)})


# ── ORS helpers ──────────────────────────────────────────────────────────────

def _ors_headers():
    return {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json",
        "User-Agent": "walking-map-app/2.0",
    }


def _ors_snap(lat, lng):
    """Try ORS snap. Returns [lat, lng] or None."""
    if not ORS_API_KEY:
        return None
    payload = json.dumps({
        "locations": [[lng, lat]],  # ORS expects [lng, lat]
        "radius": 40,
    }).encode()
    req = urllib.request.Request(
        f"{ORS_BASE}/snap/foot-walking",
        data=payload,
        headers=_ors_headers(),
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read())
    locations = data.get("locations") or []
    if locations and locations[0]:
        loc = locations[0]
        return [loc["location"][1], loc["location"][0]]  # back to [lat, lng]
    return None


def _ors_route(p1, p2):
    """Try ORS routing. Returns (coords [[lat,lng],...], dist_m) or None."""
    if not ORS_API_KEY:
        return None
    payload = json.dumps({
        "coordinates": [[p1[1], p1[0]], [p2[1], p2[0]]],  # ORS expects [lng, lat]
        "preference": "recommended",
    }).encode()
    req = urllib.request.Request(
        f"{ORS_BASE}/directions/foot-walking/geojson",
        data=payload,
        headers=_ors_headers(),
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())
    features = data.get("features") or []
    if not features:
        return None
    geom = features[0]["geometry"]["coordinates"]  # [[lng, lat], ...]
    coords = [[c[1], c[0]] for c in geom]          # convert to [lat, lng]
    dist_m = features[0]["properties"]["summary"]["distance"]
    return coords, dist_m


# ── Elevation ────────────────────────────────────────────────────────────────

@app.route("/api/elevation", methods=["POST"])
def elevation():
    body = request.get_json()
    coords = body.get("coords", [])  # [[lat, lng], ...]
    if not coords or not ORS_API_KEY:
        return jsonify({"ok": False, "error": "No coords or API key"})
    try:
        payload = json.dumps({
            "format_in": "geojson",
            "format_out": "geojson",
            "geometry": {
                "coordinates": [[c[1], c[0]] for c in coords],  # ORS expects [lng, lat]
                "type": "LineString"
            }
        }).encode()
        req = urllib.request.Request(
            ORS_ELEVATION_URL,
            data=payload,
            headers=_ors_headers(),
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        elevations = [c[2] for c in data["geometry"]["coordinates"]]
        return jsonify({"ok": True, "elevations": elevations})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


# ── Snap point ───────────────────────────────────────────────────────────────

@app.route("/api/snap-point", methods=["POST"])
def snap_point():
    body = request.get_json()
    p = body.get("point")  # [lat, lng]
    if not p:
        return jsonify({"error": "point required"}), 400

    # Try ORS first
    if ORS_API_KEY:
        try:
            snapped = _ors_snap(p[0], p[1])
            if snapped:
                return jsonify({"ok": True, "point": snapped})
        except Exception:
            pass  # fall through to OSRM

    # OSRM fallback
    url = f"{OSRM_URL}/nearest/v1/{OSRM_PROFILE}/{p[1]},{p[0]}?number=1"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "walking-map-app/2.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        if data.get("code") == "Ok" and data.get("waypoints"):
            wp = data["waypoints"][0]
            snapped = [wp["location"][1], wp["location"][0]]  # [lat, lng]
            if wp.get("distance", 0) <= 40:
                return jsonify({"ok": True, "point": snapped, "distance": wp["distance"]})
    except Exception:
        pass

    return jsonify({"ok": False, "point": p})


# ── Snap segment ─────────────────────────────────────────────────────────────

@app.route("/api/snap-segment", methods=["POST"])
def snap_segment():
    body = request.get_json()
    p1 = body.get("from")  # [lat, lng]
    p2 = body.get("to")    # [lat, lng]
    max_ratio = float(body.get("max_ratio", 2.5))

    if not p1 or not p2:
        return jsonify({"error": "from/to required"}), 400

    straight_m = math.sqrt(
        ((p2[0] - p1[0]) * 111320) ** 2 +
        ((p2[1] - p1[1]) * 111320 * math.cos(math.radians(p1[0]))) ** 2
    )

    # Try ORS first
    if ORS_API_KEY:
        try:
            result = _ors_route(p1, p2)
            if result:
                coords, dist_m = result
                if straight_m > 0 and dist_m / straight_m > max_ratio:
                    return jsonify({"ok": False, "coords": [p1, p2], "distance_m": straight_m,
                                    "warning": "Route unusually long — straight line used. Draw this segment manually for accuracy."})
                return jsonify({"ok": True, "coords": coords, "distance_m": dist_m})
        except Exception:
            pass  # fall through to OSRM

    # OSRM fallback
    coord_str = f"{p1[1]},{p1[0]};{p2[1]},{p2[0]}"
    url = (
        f"{OSRM_URL}/route/v1/{OSRM_PROFILE}/{coord_str}"
        f"?overview=full&geometries=polyline&steps=false"
    )
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "walking-map-app/2.0 (personal use)"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        if data.get("code") != "Ok" or not data.get("routes"):
            return jsonify({"ok": False, "coords": [p1, p2]})

        coords = decode_polyline(data["routes"][0]["geometry"])
        dist_m = data["routes"][0].get("distance", 0)

        if straight_m > 0 and dist_m / straight_m > max_ratio:
            return jsonify({"ok": False, "coords": [p1, p2], "distance_m": straight_m,
                            "warning": "OSRM route unusually long — straight line used. Draw this segment manually for accuracy."})

        return jsonify({"ok": True, "coords": coords, "distance_m": dist_m})

    except Exception as e:
        return jsonify({"ok": False, "coords": [p1, p2], "error": str(e)})


# ── Directions ───────────────────────────────────────────────────────────────

@app.route("/api/directions", methods=["POST"])
def directions():
    body    = request.get_json()
    stops   = body.get("stops", [])   # [[lat, lng], ...]
    if len(stops) < 2:
        return jsonify({"ok": False, "error": "Need at least 2 stops"})
    if not ORS_API_KEY:
        return jsonify({"ok": False, "error": "No ORS API key configured"})
    try:
        payload = json.dumps({
            "coordinates": [[s[1], s[0]] for s in stops],  # ORS wants [lng, lat]
            "instructions": True,
            "language": "en",
            "units": "m",
        }).encode()
        req = urllib.request.Request(
            f"{ORS_BASE}/directions/foot-walking/geojson",
            data=payload,
            headers=_ors_headers(),
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        features = data.get("features") or []
        if not features:
            return jsonify({"ok": False, "error": "No route returned by ORS"})
        props    = features[0]["properties"]
        segments = props.get("segments") or []
        summary  = props.get("summary") or {}
        return jsonify({
            "ok": True,
            "segments": segments,
            "total_distance": summary.get("distance", 0),
            "total_duration": summary.get("duration", 0),
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


# ── Map-match helpers ────────────────────────────────────────────────────────

def _haversine_m(lat1, lng1, lat2, lng2):
    R = 6371000
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(d_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _cum_dists_m(coords):
    dists = [0.0]
    for i in range(1, len(coords)):
        dists.append(dists[-1] + _haversine_m(
            coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]))
    return dists


def _downsample_coords(coords, max_pts):
    if len(coords) <= max_pts:
        return coords
    step = (len(coords) - 1) / (max_pts - 1)
    return [coords[round(i * step)] for i in range(max_pts)]


def _bearing(a, b):
    """Compass bearing in degrees from point a to point b ([lat,lng] pairs)."""
    d_lng = math.radians(b[1] - a[1])
    lat1  = math.radians(a[0])
    lat2  = math.radians(b[0])
    x = math.sin(d_lng) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lng)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _angle_diff(b1, b2):
    """Absolute angular difference between two bearings (0–180°)."""
    d = abs(b1 - b2) % 360
    return d if d <= 180 else 360 - d


def _downsample_turn_aware(coords, max_pts, turn_threshold=15):
    """Downsample, always keeping points where bearing changes >= turn_threshold degrees."""
    if len(coords) <= max_pts:
        return coords

    # Identify turn indices (bearing change >= threshold at that point)
    must = {0, len(coords) - 1}
    for i in range(1, len(coords) - 1):
        b_in  = _bearing(coords[i - 1], coords[i])
        b_out = _bearing(coords[i],     coords[i + 1])
        if _angle_diff(b_in, b_out) >= turn_threshold:
            must.add(i)

    # If turns alone exceed budget, keep the sharpest ones
    if len(must) > max_pts:
        turns = sorted(
            (i for i in must if i not in (0, len(coords) - 1)),
            key=lambda i: _angle_diff(
                _bearing(coords[i - 1], coords[i]),
                _bearing(coords[i],     coords[i + 1])
            ),
            reverse=True
        )
        must = {0, len(coords) - 1} | set(turns[:max_pts - 2])

    # Fill remaining budget with evenly-spaced points
    remaining = max_pts - len(must)
    if remaining > 0:
        optional = [i for i in range(1, len(coords) - 1) if i not in must]
        if optional:
            step = len(optional) / remaining
            for k in range(remaining):
                must.add(optional[round(k * step)])

    return [coords[i] for i in sorted(must)]


def _osrm_step_instruction(m_type, modifier, street):
    modifiers = {
        'uturn': 'Make a U-turn', 'sharp right': 'Turn sharp right',
        'right': 'Turn right', 'slight right': 'Bear right',
        'straight': 'Continue straight', 'slight left': 'Bear left',
        'left': 'Turn left', 'sharp left': 'Turn sharp left',
    }
    on = f' on {street}' if street else ''
    if m_type == 'depart':
        return f'Head forward{on}'
    if m_type == 'arrive':
        return 'Arrive at destination'
    if m_type in ('turn', 'end of road'):
        return modifiers.get(modifier, 'Continue') + on
    if m_type == 'new name':
        return f'Continue{on}'
    if m_type in ('roundabout', 'rotary'):
        return f'At the roundabout, take exit{on}'
    if m_type == 'fork':
        side = 'right' if modifier and 'right' in modifier else 'left'
        return f'Keep {side}{on}'
    if m_type == 'merge':
        return f'Merge{on}'
    return f'Continue{on}'


def _ors_directions_steps(coords):
    """ORS directions with waypoints tracing the drawn path. Returns (steps, dist_m, dur_s) or None."""
    # ORS free tier allows up to 50 waypoints; prioritise turn points
    wpts = _downsample_turn_aware(coords, 50)
    payload = json.dumps({
        "coordinates": [[c[1], c[0]] for c in wpts],
        "instructions": True,
        "language": "en",
        "units": "m",
    }).encode()
    req = urllib.request.Request(
        f"{ORS_BASE}/directions/foot-walking/geojson",
        data=payload, headers=_ors_headers(), method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    features = data.get("features") or []
    if not features:
        return None
    props    = features[0]["properties"]
    segments = props.get("segments") or []
    summary  = props.get("summary") or {}
    geom_coords = features[0]["geometry"]["coordinates"]  # [lng, lat] pairs
    steps = []
    for seg in segments:
        for s in seg.get("steps") or []:
            if s.get("type") == 10:   # arrive step
                continue
            wp  = s.get("way_points") or [0]
            idx = wp[0] if wp else 0
            loc = geom_coords[idx] if idx < len(geom_coords) else geom_coords[0]
            steps.append({
                "instruction": s.get("instruction", ""),
                "street_name": s.get("name", ""),
                "distance_m":  s.get("distance", 0),
                "location":    [loc[1], loc[0]],   # [lat, lng]
            })
    return steps, summary.get("distance", 0), summary.get("duration", 0)


def _osrm_route_steps(coords):
    """OSRM route with waypoints tracing the drawn path. Returns (steps, dist_m, dur_s) or None."""
    coord_str = ";".join(f"{c[1]},{c[0]}" for c in coords)
    url = (f"{OSRM_URL}/route/v1/{OSRM_PROFILE}/{coord_str}"
           f"?steps=true&annotations=false&geometries=geojson&overview=full")
    req = urllib.request.Request(url, headers={"User-Agent": "walking-map-app/2.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    if data.get("code") != "Ok" or not data.get("routes"):
        return None
    route      = data["routes"][0]
    total_dist = route.get("distance", 0)
    total_dur  = route.get("duration", 0)
    steps = []
    for leg in route.get("legs") or []:
        for s in leg.get("steps") or []:
            m      = s.get("maneuver") or {}
            m_type = m.get("type", "")
            m_mod  = m.get("modifier", "")
            street = s.get("name", "")
            if m_type == "arrive":
                continue
            loc = m.get("location", [0, 0])   # [lng, lat]
            steps.append({
                "instruction": _osrm_step_instruction(m_type, m_mod, street),
                "street_name": street,
                "distance_m":  s.get("distance", 0),
                "location":    [loc[1], loc[0]],   # [lat, lng]
            })
    return steps, total_dist, total_dur


def _bearing_to_cardinal(bearing):
    dirs = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
    return dirs[round((bearing % 360) / 45) % 8]


def _angle_to_verb(angle):
    """Map signed bearing change (degrees) to a turn instruction verb."""
    a = abs(angle)
    if a < 20:
        return "Continue straight"
    side = "right" if angle > 0 else "left"
    if a < 50:
        return f"Bear {side}"
    elif a < 130:
        return f"Turn {side}"
    else:
        return f"Turn sharp {side}"


_GEO_CACHE = {}       # {(round(lat,5), round(lng,5)): name}  — survives across requests
_GEO_LAST  = [0.0]    # monotonic time of last real network call (rate-limit guard)

def _nominatim_street(lat, lng):
    """Reverse-geocode a point and return the road/street name, or empty string.

    Cached by rounded coordinate so repeated points (and repeated runs while the
    server stays up) cost nothing. A single rate-limit guard keeps real calls at
    most one per ~1.05 s, honouring Nominatim's usage policy. Neither caching nor
    the guard changes WHICH name a point returns — only how often we ask.
    """
    import time
    key = (round(lat, 5), round(lng, 5))
    if key in _GEO_CACHE:
        return _GEO_CACHE[key]

    # Space real requests >= 1.05 s apart (Nominatim allows max 1 req/sec)
    wait = 1.05 - (time.monotonic() - _GEO_LAST[0])
    if wait > 0:
        time.sleep(wait)

    url = (f"https://nominatim.openstreetmap.org/reverse"
           f"?lat={lat}&lon={lng}&format=json&zoom=17")
    req = urllib.request.Request(
        url, headers={"User-Agent": "maperati/1.0 (mchughde@gmail.com)"})
    name = ""
    try:
        with urllib.request.urlopen(req, timeout=6) as r:
            d = json.loads(r.read())
        a = d.get("address", {})
        name = (a.get("road") or a.get("pedestrian") or a.get("footway")
                or a.get("path") or a.get("square") or "")
        # Discard placeholder names OSM uses for unnamed ways: anything that has
        # no letters or digits (covers "-", "–", "—", "?", "−", blanks, etc.)
        if name and not any(c.isalnum() for c in name):
            name = ""
        name = name.strip()
    except Exception:
        name = ""
    finally:
        _GEO_LAST[0] = time.monotonic()

    _GEO_CACHE[key] = name
    return name


def _detect_turns(coords, turn_threshold=25, merge_dist_m=40, window_m=35):
    """Find significant turns in coords.

    Returns list of (coord_index, signed_angle_deg, cumulative_dist_m).
    Positive angle = clockwise = right; negative = anticlockwise = left.
    Nearby turns within merge_dist_m are merged, keeping the sharpest.
    """
    cum = _cum_dists_m(coords)
    raw = []
    for i in range(1, len(coords) - 1):
        bi = i
        while bi > 0 and cum[i] - cum[bi] < window_m:
            bi -= 1
        di = i
        while di < len(coords) - 1 and cum[di] - cum[i] < window_m:
            di += 1
        if bi == i or di == i:
            continue
        in_b  = _bearing(coords[bi], coords[i])
        out_b = _bearing(coords[i],  coords[di])
        angle = ((out_b - in_b + 180) % 360) - 180
        if turn_threshold <= abs(angle) < 165:  # ignore near-180° reversals (GPS artifacts)
            raw.append((i, angle, cum[i]))
    merged = []
    for t in raw:
        if merged and t[2] - merged[-1][2] < merge_dist_m:
            if abs(t[1]) > abs(merged[-1][1]):
                merged[-1] = t
        else:
            merged.append(t)
    return merged


def _geometry_directions(orig_coords):
    """Generate turn-by-turn directions purely from drawn route geometry.

    Turn positions come from bearing-change detection on orig_coords.
    Street names come from Nominatim reverse-geocoding a point 25 m past each turn.
    Returns (steps, total_dist_m, total_dur_s) or None on failure.
    Each step: {instruction, street_name, distance_m, location:[lat,lng]}.
    """
    import time
    if len(orig_coords) < 2:
        return None

    cum   = _cum_dists_m(orig_coords)
    n     = len(orig_coords)

    turns = _detect_turns(orig_coords)

    # Events: (coord_index, kind, angle)  kind = 'depart' | 'turn'
    events = [(0, "depart", 0.0)] + [(t[0], "turn", t[1]) for t in turns]

    steps = []
    for k, (ci, kind, angle) in enumerate(events):
        next_ci = events[k + 1][0] if k + 1 < len(events) else n - 1
        seg_dist = cum[next_ci] - cum[ci]

        # Name the street you travel AFTER this turn: the segment between this
        # turn (ci) and the next event (next_ci). Sample by FRACTION of that
        # segment and clamp strictly inside it, so a nearby following turn can
        # never steal this turn's street name (the Place-du-Louvre bug, where a
        # fixed 50 m look-ahead overshot the next turn ~50 m away).
        seg_len = cum[next_ci] - cum[ci]
        street  = ""
        gi      = min(ci + 1, n - 1)
        for frac in (0.5, 0.65, 0.35, 0.8):
            target = cum[ci] + seg_len * frac
            gj = ci
            while gj < next_ci and cum[gj] < target:
                gj += 1
            gj = max(min(gj, next_ci), min(ci + 1, n - 1))
            gi = gj
            name = _nominatim_street(orig_coords[gj][0], orig_coords[gj][1])
            if name:
                street = name
                break
            # No manual sleep: _nominatim_street enforces the rate limit centrally.

        if kind == "depart":
            out_b = _bearing(orig_coords[ci], orig_coords[gi]) if gi != ci else 0
            verb  = f"Head {_bearing_to_cardinal(out_b)}"
            on    = f" on {street}" if street else ""
        else:
            verb = _angle_to_verb(angle)
            on   = f" onto {street}" if street else ""

        steps.append({
            "instruction": f"{verb}{on}",
            "street_name": street,
            "distance_m":  seg_dist,
            "location":    list(orig_coords[ci]),
        })

    total_dist = cum[-1]
    return steps, total_dist, total_dist / 83.33   # ~5 km/h walking pace


def _inject_stop_markers(orig_coords, stops, steps):
    """Insert a stop marker entry for each stop, interleaved with the turn steps.

    Earlier this *tagged* (and consumed) the nearest turn step, one step per
    stop. When stops outnumbered the turn steps in a stretch — e.g. several POIs
    clustered near the end of a loop — the surplus stops collapsed onto the final
    step and overwrote each other, so trailing stops AND their turns vanished.

    Now each stop becomes its own marker entry inserted at the right position by
    distance-along-route; turn steps are never consumed. Result: every stop and
    every turn is preserved. Marker entries carry stop_name/stop_index with an
    empty instruction so the front-end renders the label but no turn text.

    Coord search keeps the proportional, monotonic window so loop routes still
    match a stop to the correct pass.
    """
    if not stops or not steps:
        return steps
    cum      = _cum_dists_m(orig_coords)
    n_coords = len(orig_coords)
    half_win = max(int(n_coords * 0.25), 5)

    # 1) Distance-along-route for each stop (monotonic, proportional window).
    placements    = []   # (dist_m, stop_index, stop_name, coord_index)
    min_coord_idx = 0
    for idx, stop in enumerate(stops):
        frac   = idx / max(len(stops) - 1, 1)
        center = round(frac * (n_coords - 1))
        lo     = max(min_coord_idx, center - half_win)
        hi     = min(n_coords, center + half_win + 1)
        if lo >= hi:
            hi = min(n_coords, lo + 1)
        best_j = min(
            range(lo, hi),
            key=lambda j: _haversine_m(stop["lat"], stop["lng"],
                                       orig_coords[j][0], orig_coords[j][1])
        )
        placements.append((cum[best_j], idx, stop.get("name", ""), best_j))
        min_coord_idx = best_j

    # 2) Distance-along-route at the START of each turn step.
    step_start = [0.0]
    for st in steps[:-1]:
        step_start.append(step_start[-1] + st.get("distance_m", 0))

    def _marker(p):
        d, sidx, sname, cj = p
        return {"instruction": "", "street_name": "", "distance_m": 0,
                "location": list(orig_coords[cj]),
                "stop_name": sname, "stop_index": sidx}

    # 3) Merge: insert each stop marker just before the first turn step that
    #    starts at or beyond the stop's distance. Nothing is overwritten.
    result = []
    pi = 0
    for i, st in enumerate(steps):
        while pi < len(placements) and placements[pi][0] <= step_start[i] + 1e-6:
            result.append(_marker(placements[pi]))
            pi += 1
        result.append(dict(st))
    while pi < len(placements):          # any stops past the final turn step
        result.append(_marker(placements[pi]))
        pi += 1

    return result


# ── Match directions ──────────────────────────────────────────────────────────

@app.route("/api/match-directions", methods=["POST"])
def match_directions():
    body   = request.get_json()
    coords = body.get("coords", [])   # [[lat, lng], ...]
    stops  = body.get("stops",  [])   # [{name, lat, lng}, ...]

    if len(coords) < 2:
        return jsonify({"ok": False, "error": "Need at least 2 route coordinates"})

    # Primary: geometry-first — turns detected from drawn route, street names
    # from Nominatim reverse geocoding. Accurate to the blue line by design.
    # Takes ~1 second per turn due to Nominatim rate limit.
    try:
        _dbg(f"coords count={len(coords)}, first={coords[0]}, last={coords[-1]}")
        result = _geometry_directions(coords)
        if result:
            steps, total_dist, total_dur = result
            _dbg(f"geometry_directions ok, {len(steps)} steps:")
            for s in steps:
                _dbg(f"  STEP: {s['instruction']}  [{s['distance_m']:.0f}m]")
            steps = _inject_stop_markers(coords, stops, steps)
            return jsonify({
                "ok":               True,
                "steps":            steps,
                "total_distance_m": total_dist,
                "total_duration_s": total_dur,
            })
    except Exception as e:
        import traceback
        _dbg(f"geometry_directions FAILED: {e}\n{traceback.format_exc()}")

    # Fallback: ORS or OSRM routing steps (less accurate for custom routes)
    steps = total_dist = total_dur = None

    if ORS_API_KEY:
        try:
            r = _ors_directions_steps(coords)
            if r:
                steps, total_dist, total_dur = r
        except Exception:
            pass

    if steps is None:
        osrm_coords = _downsample_turn_aware(coords, 100)
        try:
            r = _osrm_route_steps(osrm_coords)
            if r:
                steps, total_dist, total_dur = r
        except Exception:
            pass

    if steps is None:
        return jsonify({"ok": False, "error": "Could not get directions"})

    steps = _inject_stop_markers(coords, stops, steps)
    return jsonify({
        "ok":               True,
        "steps":            steps,
        "total_distance_m": total_dist or 0,
        "total_duration_s": total_dur  or 0,
    })


# ── Tile proxy (for client-side image export) ────────────────────────────────

ALLOWED_TILE_HOSTS = [
    "tile.openstreetmap.org",
    "basemaps.cartocdn.com",
    "forte.tiles.quaidorsay.fr",
    "arcgisonline.com",
]

@app.route("/api/proxy-tile")
def proxy_tile():
    url = request.args.get("url", "")
    if not url or not any(h in url for h in ALLOWED_TILE_HOSTS):
        return jsonify({"error": "disallowed"}), 403
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Referer": "http://localhost:5001/",
            "Accept": "image/png,image/*,*/*;q=0.8",
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            content      = resp.read()
            content_type = resp.headers.get("Content-Type", "image/png")
        return Response(content, content_type=content_type)
    except Exception as e:
        return jsonify({"error": str(e)}), 502


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = 5001

    def open_browser():
        webbrowser.open(f"http://localhost:{port}")

    Timer(1.2, open_browser).start()
    print(f"\n  Walking Map App → http://localhost:{port}")
    print("  Ctrl+C to stop.\n")
    app.run(port=port, debug=False)
