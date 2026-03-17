#!/usr/bin/env python3
from __future__ import annotations
import argparse
import csv
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


ARTIFACT_VERSION = 2
DEFAULT_SHARD_TARGET_BYTES = 8 * 1024 * 1024


def load_csv_rows(path: Path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_time_to_seconds(value: str | None):
    if not value:
        return None
    parts = value.strip().split(":")
    if len(parts) < 2:
        return None
    try:
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = int(parts[2]) if len(parts) > 2 else 0
    except ValueError:
        return None
    return hours * 3600 + minutes * 60 + seconds


def route_artifact_filename(route_short_name: str):
    return f"route-{quote(route_short_name, safe='')}.json"


def route_shard_filename(route_short_name: str, shard_index: int):
    encoded = quote(route_short_name, safe="")
    return f"route-{encoded}.shard-{shard_index}.json"


def compact_dumps(value):
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def stable_pattern_id(stop_ids: list[str]):
    digest = hashlib.sha1("|".join(stop_ids).encode("utf-8")).hexdigest()[:16]
    return f"p-{digest}"


def finalize_trip_stop_times(raw_trip_stops):
    if len(raw_trip_stops) < 2:
        return None
    trip_stop_times = sorted(raw_trip_stops, key=lambda item: item["seq"])
    start_stop = trip_stop_times[0]
    end_stop = trip_stop_times[-1]
    return {
        "stops": trip_stop_times,
        "start_stop_name": start_stop["stop_name"],
        "end_stop_name": end_stop["stop_name"],
        "start_time": start_stop["t"],
        "end_time": end_stop["t"],
        "min_time": min(stop["t"] for stop in trip_stop_times),
        "max_time": max(stop["t"] for stop in trip_stop_times),
    }


def split_trip_payloads(route_short_name: str, trip_payloads: list[dict], target_bytes: int):
    if not trip_payloads:
        return []

    shards = []
    current_trips = []
    current_size = 2  # []

    for trip in trip_payloads:
        trip_size = len(compact_dumps(trip))
        additional = trip_size + (1 if current_trips else 0)
        if current_trips and current_size + additional > target_bytes:
            shard_index = len(shards) + 1
            shards.append({
                "id": f"{route_short_name}-{shard_index}",
                "file": route_shard_filename(route_short_name, shard_index),
                "trips": current_trips,
                "tripCount": len(current_trips),
            })
            current_trips = []
            current_size = 2
            additional = trip_size

        current_trips.append(trip)
        current_size += additional

    if current_trips:
        shard_index = len(shards) + 1
        shards.append({
            "id": f"{route_short_name}-{shard_index}",
            "file": route_shard_filename(route_short_name, shard_index),
            "trips": current_trips,
            "tripCount": len(current_trips),
        })

    return shards


def build_artifacts(input_dir: Path, output_dir: Path, source: str, shard_target_bytes: int):
    routes = {row["route_id"]: row for row in load_csv_rows(input_dir / "routes.txt")}
    stops = {row["stop_id"]: row for row in load_csv_rows(input_dir / "stops.txt")}
    trips_rows = load_csv_rows(input_dir / "trips.txt")
    calendar_rows = load_csv_rows(input_dir / "calendar_dates.txt")
    stop_times_rows = load_csv_rows(input_dir / "stop_times.txt")
    shapes_rows = load_csv_rows(input_dir / "shapes.txt")

    service_dates: dict[str, set[str]] = defaultdict(set)
    for row in calendar_rows:
        service_id = (row.get("service_id") or "").strip()
        date = (row.get("date") or "").strip()
        exception_type = (row.get("exception_type") or "1").strip()
        if not service_id or not date:
            continue
        if exception_type == "2":
            service_dates[date].discard(service_id)
        else:
            service_dates[date].add(service_id)

    trips_by_id = {}
    trips_by_route_short_name: dict[str, list[dict]] = defaultdict(list)
    for row in trips_rows:
        route = routes.get((row.get("route_id") or "").strip())
        if not route:
            continue
        trip = {
            "trip_id": (row.get("trip_id") or "").strip(),
            "route_id": (row.get("route_id") or "").strip(),
            "route_short_name": (route.get("route_short_name") or "").strip(),
            "route_long_name": (route.get("route_long_name") or "").strip(),
            "route_type": str(route.get("route_type") or "").strip(),
            "direction_id": int((row.get("direction_id") or "0").strip() or "0"),
            "shape_id": (row.get("shape_id") or "").strip() or None,
            "service_id": (row.get("service_id") or "").strip(),
            "source": source,
        }
        if not trip["trip_id"] or not trip["route_short_name"]:
            continue
        trips_by_id[trip["trip_id"]] = trip
        trips_by_route_short_name[trip["route_short_name"]].append(trip)

    shapes_by_id: dict[str, list[dict]] = defaultdict(list)
    for row in shapes_rows:
        shape_id = (row.get("shape_id") or "").strip()
        if not shape_id:
            continue
        try:
            lat = float(row.get("shape_pt_lat") or "")
            lon = float(row.get("shape_pt_lon") or "")
            seq = int(float(row.get("shape_pt_sequence") or "0"))
        except ValueError:
            continue
        shapes_by_id[shape_id].append({
            "lat": lat,
            "lon": lon,
            "seq": seq,
        })

    for points in shapes_by_id.values():
        points.sort(key=lambda item: item["seq"])

    stop_times_by_trip: dict[str, list[dict]] = defaultdict(list)
    for row in stop_times_rows:
        trip_id = (row.get("trip_id") or "").strip()
        stop_id = (row.get("stop_id") or "").strip()
        stop = stops.get(stop_id)
        if not trip_id or not stop:
            continue
        try:
            seq = int(float(row.get("stop_sequence") or "0"))
            lat = float(stop.get("stop_lat") or "")
            lon = float(stop.get("stop_lon") or "")
        except ValueError:
            continue
        departure = parse_time_to_seconds(row.get("departure_time") or row.get("arrival_time"))
        if departure is None:
            continue
        stop_times_by_trip[trip_id].append({
            "stop_id": stop_id,
            "t": departure,
            "lat": lat,
            "lon": lon,
            "seq": seq,
            "shapeIndex": None,
            "stop_name": (stop.get("stop_name") or "").strip(),
        })

    routes_dir = output_dir / "routes"
    service_dates_dir = output_dir / "service-dates"
    routes_dir.mkdir(parents=True, exist_ok=True)
    service_dates_dir.mkdir(parents=True, exist_ok=True)

    for date, service_ids in service_dates.items():
        with (service_dates_dir / f"{date}.json").open("w", encoding="utf-8") as handle:
            json.dump(sorted(service_ids), handle, separators=(",", ":"))

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    manifest = {
        "generatedAt": generated_at,
        "source": source,
        "routeCount": len(trips_by_route_short_name),
        "artifactVersion": ARTIFACT_VERSION,
        "shardTargetBytes": shard_target_bytes,
    }
    with (output_dir / "manifest.json").open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)

    for route_short_name, route_trips in trips_by_route_short_name.items():
        artifact_trips = []
        route_shape_ids: set[str] = set()
        patterns = {}
        pattern_ids_by_signature = {}

        for trip in route_trips:
            trip_stop_bundle = finalize_trip_stop_times(stop_times_by_trip.get(trip["trip_id"], []))
            if not trip_stop_bundle:
                continue

            trip_stop_times = trip_stop_bundle["stops"]
            stop_ids = [stop["stop_id"] for stop in trip_stop_times]
            candidate_pattern_id = stable_pattern_id(stop_ids)
            pattern_id = candidate_pattern_id
            signature = tuple(stop_ids)

            if pattern_id in patterns and pattern_ids_by_signature.get(signature) != pattern_id:
                suffix = 2
                while f"{candidate_pattern_id}-{suffix}" in patterns:
                    suffix += 1
                pattern_id = f"{candidate_pattern_id}-{suffix}"

            if pattern_id not in patterns:
                pattern_ids_by_signature[signature] = pattern_id
                patterns[pattern_id] = {
                    "stops": [
                        {
                            "stop_id": stop["stop_id"],
                            "stop_name": stop["stop_name"],
                            "lat": stop["lat"],
                            "lon": stop["lon"],
                            "seq": stop["seq"],
                            "shapeIndex": stop["shapeIndex"],
                        }
                        for stop in trip_stop_times
                    ],
                }

            if trip["shape_id"]:
                route_shape_ids.add(trip["shape_id"])

            artifact_trips.append({
                **trip,
                "patternId": pattern_id,
                "times": [stop["t"] for stop in trip_stop_times],
            })

        route_shapes = {
            shape_id: shapes_by_id[shape_id]
            for shape_id in route_shape_ids
            if shape_id in shapes_by_id
        }

        base_payload = {
            "version": ARTIFACT_VERSION,
            "generatedAt": generated_at,
            "source": source,
            "routeShortName": route_short_name,
            "shapes": route_shapes,
            "patterns": patterns,
        }

        single_payload = {
            **base_payload,
            "kind": "route",
            "trips": artifact_trips,
        }
        single_bytes = len(compact_dumps(single_payload))

        route_file_path = routes_dir / route_artifact_filename(route_short_name)
        if single_bytes <= shard_target_bytes:
            with route_file_path.open("w", encoding="utf-8") as handle:
                json.dump(single_payload, handle, separators=(",", ":"))
            continue

        shards = split_trip_payloads(route_short_name, artifact_trips, shard_target_bytes)
        route_manifest = {
            **base_payload,
            "kind": "route-manifest",
            "shards": [
                {
                    "id": shard["id"],
                    "file": shard["file"],
                    "tripCount": shard["tripCount"],
                }
                for shard in shards
            ],
        }
        with route_file_path.open("w", encoding="utf-8") as handle:
            json.dump(route_manifest, handle, separators=(",", ":"))

        for shard in shards:
            shard_payload = {
                "version": ARTIFACT_VERSION,
                "kind": "route-shard",
                "generatedAt": generated_at,
                "source": source,
                "routeShortName": route_short_name,
                "shardId": shard["id"],
                "trips": shard["trips"],
            }
            with (routes_dir / shard["file"]).open("w", encoding="utf-8") as handle:
                json.dump(shard_payload, handle, separators=(",", ":"))


def main():
    parser = argparse.ArgumentParser(description="Build simulation-ready GTFS artifacts.")
    parser.add_argument("--input_dir", required=True, help="GTFS input directory")
    parser.add_argument("--output_dir", required=True, help="Artifact output directory")
    parser.add_argument("--source", default="gotransit", help="Source label for generated trips")
    parser.add_argument(
        "--shard_target_bytes",
        type=int,
        default=DEFAULT_SHARD_TARGET_BYTES,
        help="Maximum approximate bytes per route artifact or shard",
    )
    args = parser.parse_args()

    build_artifacts(
        Path(args.input_dir),
        Path(args.output_dir),
        args.source,
        args.shard_target_bytes,
    )


if __name__ == "__main__":
    main()
