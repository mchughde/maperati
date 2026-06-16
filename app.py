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
