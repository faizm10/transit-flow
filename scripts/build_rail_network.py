#!/usr/bin/env python3
import argparse
import json
import math
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone


DEFAULT_BBOX = (42.75, -80.95, 44.65, -77.65)  # south, west, north, east
OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"
USER_AGENT = "TransitFlowRailBuilder/1.0 (local development)"


def distance_m(a, b):
    radius = 6371000
    lat1 = math.radians(a[1])
    lat2 = math.radians(b[1])
    dlat = math.radians(b[1] - a[1])
    dlon = math.radians(b[0] - a[0])
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(h))


def parse_speed_kmh(tags):
    raw = (tags.get("maxspeed") or "").strip().lower()
    speed = None
    if raw:
        token = raw.split(";")[0].strip()
        token = token.replace("km/h", "").replace("kph", "").strip()
        multiplier = 1
        if "mph" in token:
            multiplier = 1.60934
            token = token.replace("mph", "").strip()
        try:
            speed = float(token) * multiplier
        except ValueError:
            speed = None

    if speed is None:
        usage = (tags.get("usage") or "").lower()
        service = (tags.get("service") or "").lower()
        railway = (tags.get("railway") or "").lower()
        if service in {"yard", "siding", "spur", "crossover"}:
            speed = 30
        elif usage in {"branch", "secondary"}:
            speed = 60
        elif railway == "light_rail":
            speed = 50
        else:
            speed = 80

    return max(20, min(140, round(speed)))


def chunks_for_bbox(bbox, lat_step, lon_step):
    south, west, north, east = bbox
    lat = south
    epsilon = 1e-9
    while lat < north - epsilon:
        next_lat = min(north, lat + lat_step)
        lon = west
        while lon < east - epsilon:
            next_lon = min(east, lon + lon_step)
            yield (lat, lon, next_lat, next_lon)
            lon = next_lon
        lat = next_lat


def overpass_query(bbox):
    south, west, north, east = bbox
    return f"""
[out:json][timeout:90];
(
  way["railway"~"^(rail|light_rail)$"]({south},{west},{north},{east});
);
out geom tags;
"""


def fetch_overpass_chunk(endpoint, bbox, retries=2):
    query = overpass_query(bbox)
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=data,
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                body = response.read().decode("utf-8")
            parsed = json.loads(body)
            return parsed.get("elements", [])
        except Exception as exc:
            if attempt >= retries:
                raise RuntimeError(f"Overpass chunk failed for {bbox}: {exc}") from exc
            time.sleep(2 + attempt * 3)

    return []


def load_overpass_elements(path):
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, dict):
        return data.get("elements", [])
    if isinstance(data, list):
        return data
    return []


def node_id_for(point, osm_node_id=None):
    if osm_node_id:
        return f"osm:{osm_node_id}"
    return f"pt:{point[0]:.7f},{point[1]:.7f}"


def add_node(nodes, point, osm_node_id=None):
    node_id = node_id_for(point, osm_node_id)
    if node_id not in nodes:
        nodes[node_id] = {
            "id": node_id,
            "lon": round(point[0], 7),
            "lat": round(point[1], 7),
        }
    return node_id


def edge_tags(tags):
    keys = [
        "railway",
        "usage",
        "service",
        "maxspeed",
        "name",
        "operator",
        "owner",
        "tracks",
    ]
    return {key: value for key, value in tags.items() if key in keys and value}


def build_network(elements, bbox):
    ways = {}
    for element in elements:
        if element.get("type") != "way":
            continue
        geometry = element.get("geometry") or []
        if len(geometry) < 2:
            continue
        way_id = str(element.get("id"))
        ways[way_id] = element

    nodes = {}
    edges = {}
    for way_id, way in sorted(ways.items(), key=lambda item: item[0]):
        tags = way.get("tags") or {}
        geometry = [
            (float(point["lon"]), float(point["lat"]))
            for point in (way.get("geometry") or [])
            if point.get("lon") is not None and point.get("lat") is not None
        ]
        node_ids = way.get("nodes") or []
        speed_kmh = parse_speed_kmh(tags)
        speed_mps = speed_kmh * 1000 / 3600

        for index in range(1, len(geometry)):
            a = geometry[index - 1]
            b = geometry[index]
            segment_distance = distance_m(a, b)
            if segment_distance < 1:
                continue

            from_node = add_node(nodes, a, node_ids[index - 1] if index - 1 < len(node_ids) else None)
            to_node = add_node(nodes, b, node_ids[index] if index < len(node_ids) else None)
            edge_id = f"{way_id}:{index - 1}"
            edges[edge_id] = {
                "id": edge_id,
                "way_id": way_id,
                "from": from_node,
                "to": to_node,
                "geometry": [[round(a[0], 7), round(a[1], 7)], [round(b[0], 7), round(b[1], 7)]],
                "distance_m": round(segment_distance, 2),
                "speed_kmh": speed_kmh,
                "duration_sec": round(segment_distance / speed_mps, 2),
                "tags": edge_tags(tags),
            }

    return {
        "metadata": {
            "source": "openstreetmap_overpass",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "bbox": {
                "south": bbox[0],
                "west": bbox[1],
                "north": bbox[2],
                "east": bbox[3],
            },
            "way_count": len(ways),
            "node_count": len(nodes),
            "edge_count": len(edges),
            "attribution": "Rail routing data © OpenStreetMap contributors, ODbL",
        },
        "nodes": list(nodes.values()),
        "edges": list(edges.values()),
    }


def parse_bbox(value):
    parts = [float(part.strip()) for part in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("bbox must be south,west,north,east")
    return tuple(parts)


def main():
    parser = argparse.ArgumentParser(description="Build a local OSM rail routing graph.")
    parser.add_argument(
        "--output",
        default="client/public/gotransit/derived/rail_network.json",
        help="Output rail network JSON path.",
    )
    parser.add_argument(
        "--input-overpass-json",
        help="Read an existing Overpass JSON response instead of fetching live data.",
    )
    parser.add_argument(
        "--overpass-endpoint",
        default=OVERPASS_ENDPOINT,
        help="Overpass API interpreter endpoint.",
    )
    parser.add_argument(
        "--bbox",
        type=parse_bbox,
        default=DEFAULT_BBOX,
        help="south,west,north,east bbox. Defaults to the GO/GTA service area.",
    )
    parser.add_argument("--lat-step", type=float, default=0.32)
    parser.add_argument("--lon-step", type=float, default=0.45)
    args = parser.parse_args()

    if args.input_overpass_json:
        elements = load_overpass_elements(args.input_overpass_json)
    else:
        by_way_id = {}
        chunks = list(chunks_for_bbox(args.bbox, args.lat_step, args.lon_step))
        for index, chunk in enumerate(chunks, start=1):
            print(f"Fetching rail chunk {index}/{len(chunks)} {chunk}", flush=True)
            try:
                for element in fetch_overpass_chunk(args.overpass_endpoint, chunk):
                    if element.get("type") == "way":
                        by_way_id[str(element.get("id"))] = element
            except RuntimeError as exc:
                print(str(exc))
        elements = list(by_way_id.values())

    if not elements:
        raise SystemExit("No railway ways found. Try a smaller bbox or an input Overpass JSON file.")

    network = build_network(elements, args.bbox)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(network, handle, indent=2, ensure_ascii=True)
        handle.write("\n")

    print(
        "Wrote {path}: {ways} ways, {nodes} nodes, {edges} edges".format(
            path=args.output,
            ways=network["metadata"]["way_count"],
            nodes=network["metadata"]["node_count"],
            edges=network["metadata"]["edge_count"],
        )
    )


if __name__ == "__main__":
    main()
