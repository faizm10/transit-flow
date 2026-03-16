#!/usr/bin/env python3
import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote


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


def build_artifacts(input_dir: Path, output_dir: Path, source: str):
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

    manifest = {
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "source": source,
        "routeCount": len(trips_by_route_short_name),
    }
    with (output_dir / "manifest.json").open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)

    for route_short_name, route_trips in trips_by_route_short_name.items():
        artifact_trips = []
        for trip in route_trips:
            trip_stop_times = sorted(stop_times_by_trip.get(trip["trip_id"], []), key=lambda item: item["seq"])
            if len(trip_stop_times) < 2:
                continue
            start_stop = trip_stop_times[0]
            end_stop = trip_stop_times[-1]
            artifact_trips.append({
                **trip,
                "stops": [
                    {
                        "t": stop["t"],
                        "lat": stop["lat"],
                        "lon": stop["lon"],
                        "seq": stop["seq"],
                        "shapeIndex": stop["shapeIndex"],
                    }
                    for stop in trip_stop_times
                ],
                "shape": shapes_by_id.get(trip["shape_id"] or "", []),
                "start_stop_name": start_stop["stop_name"],
                "end_stop_name": end_stop["stop_name"],
                "start_time": start_stop["t"],
                "end_time": end_stop["t"],
                "min_time": min(stop["t"] for stop in trip_stop_times),
                "max_time": max(stop["t"] for stop in trip_stop_times),
            })

        output = {
            "generatedAt": manifest["generatedAt"],
            "source": source,
            "routeShortName": route_short_name,
            "trips": artifact_trips,
        }
        with (routes_dir / route_artifact_filename(route_short_name)).open("w", encoding="utf-8") as handle:
            json.dump(output, handle, separators=(",", ":"))


def main():
    parser = argparse.ArgumentParser(description="Build simulation-ready GTFS artifacts.")
    parser.add_argument("--input_dir", required=True, help="GTFS input directory")
    parser.add_argument("--output_dir", required=True, help="Artifact output directory")
    parser.add_argument("--source", default="gotransit", help="Source label for generated trips")
    args = parser.parse_args()

    build_artifacts(Path(args.input_dir), Path(args.output_dir), args.source)


if __name__ == "__main__":
    main()
