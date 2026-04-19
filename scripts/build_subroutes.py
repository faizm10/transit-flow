#!/usr/bin/env python3
import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta


def parse_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_service_date(value):
    try:
        return datetime.strptime(value, "%Y%m%d").date()
    except (TypeError, ValueError):
        return None


def format_service_date(value):
    return value.strftime("%Y-%m-%d") if value else None


def open_csv(path):
    return open(path, newline="", encoding="utf-8-sig")


def suffix_for_index(index):
    if index < 26:
        return chr(ord("A") + index)
    return f"V{index + 1}"


def load_routes(routes_path):
    routes = []
    route_id_to_short = {}
    route_id_to_long = {}
    route_id_to_type = {}

    with open_csv(routes_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            route_id = (row.get("route_id") or "").strip()
            if not route_id:
                continue
            route_short_name = (row.get("route_short_name") or "").strip()
            route_long_name = (row.get("route_long_name") or "").strip()
            route_type_raw = (row.get("route_type") or "").strip()
            route_type = (
                int(route_type_raw) if route_type_raw.isdigit() else route_type_raw
            )
            routes.append(
                {
                    "route_id": route_id,
                    "route_short_name": route_short_name,
                    "route_long_name": route_long_name,
                    "route_type": route_type,
                }
            )
            route_id_to_short[route_id] = route_short_name
            route_id_to_long[route_id] = route_long_name
            route_id_to_type[route_id] = route_type

    def sort_key(route):
        rt = route["route_type"]
        if isinstance(rt, int):
            route_type_key = (0, rt)
        else:
            route_type_key = (1, str(rt))
        return (route_type_key, route["route_short_name"] or route["route_id"])

    routes.sort(key=sort_key)
    return routes, route_id_to_short, route_id_to_long, route_id_to_type


def load_trips(trips_path):
    trips = {}
    with open_csv(trips_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            trip_id = (row.get("trip_id") or "").strip()
            if not trip_id:
                continue
            route_id = (row.get("route_id") or "").strip()
            service_id = (row.get("service_id") or "").strip()
            direction_id = parse_int((row.get("direction_id") or "").strip(), 0)
            shape_id = (row.get("shape_id") or "").strip() or None
            trip_headsign = (row.get("trip_headsign") or "").strip()
            route_variant = (row.get("route_variant") or "").strip()
            trips[trip_id] = {
                "route_id": route_id,
                "service_id": service_id,
                "direction_id": direction_id,
                "shape_id": shape_id,
                "trip_headsign": trip_headsign,
                "route_variant": route_variant,
            }
    return trips


def load_stop_times(stop_times_path):
    trip_stop_times = defaultdict(list)
    with open_csv(stop_times_path) as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            trip_id = (row.get("trip_id") or "").strip()
            stop_id = (row.get("stop_id") or "").strip()
            if not trip_id or not stop_id:
                continue
            stop_sequence = parse_int((row.get("stop_sequence") or "").strip(), 0)
            trip_stop_times[trip_id].append((stop_sequence, idx, stop_id))
    return trip_stop_times


def load_stops(stops_path):
    stops = {}
    if not os.path.exists(stops_path):
        return stops
    with open_csv(stops_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            stop_id = (row.get("stop_id") or "").strip()
            if not stop_id:
                continue
            stops[stop_id] = {
                "stop_name": (row.get("stop_name") or "").strip(),
                "stop_lat": parse_float((row.get("stop_lat") or "").strip()),
                "stop_lon": parse_float((row.get("stop_lon") or "").strip()),
            }
    return stops


def load_shapes(shapes_path, shape_ids):
    shape_points = defaultdict(list)
    if not os.path.exists(shapes_path):
        return shape_points
    with open_csv(shapes_path) as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            shape_id = (row.get("shape_id") or "").strip()
            if shape_id not in shape_ids:
                continue
            seq = parse_int((row.get("shape_pt_sequence") or "").strip(), 0)
            lat = parse_float((row.get("shape_pt_lat") or "").strip())
            lon = parse_float((row.get("shape_pt_lon") or "").strip())
            if lat is None or lon is None:
                continue
            shape_points[shape_id].append((seq, idx, lon, lat))
    return shape_points


def find_latest_service_week(calendar_dates_path):
    if not os.path.exists(calendar_dates_path):
        return None, {
            "basis": "full_feed_no_calendar_dates",
            "start_date": None,
            "end_date": None,
            "service_dates": [],
            "service_day_count": 0,
        }

    service_dates = defaultdict(set)
    with open_csv(calendar_dates_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            service_id = (row.get("service_id") or "").strip()
            service_date = parse_service_date((row.get("date") or "").strip())
            if not service_id or service_date is None:
                continue

            exception_type = (row.get("exception_type") or "1").strip()
            if exception_type == "2":
                service_dates[service_id].discard(service_date)
            else:
                service_dates[service_id].add(service_date)

    active_dates = sorted({date for dates in service_dates.values() for date in dates})
    if not active_dates:
        return None, {
            "basis": "full_feed_no_service_dates",
            "start_date": None,
            "end_date": None,
            "service_dates": [],
            "service_day_count": 0,
        }

    active_date_set = set(active_dates)
    min_date = active_dates[0]
    max_date = active_dates[-1]
    candidate = max_date - timedelta(days=max_date.weekday())
    selected_dates = None
    basis = "latest_full_week"

    while candidate >= min_date:
        week_dates = [candidate + timedelta(days=offset) for offset in range(7)]
        if all(date in active_date_set for date in week_dates):
            selected_dates = week_dates
            break
        candidate -= timedelta(days=7)

    if selected_dates is None:
        basis = "latest_seven_available_dates"
        selected_dates = active_dates[-7:]

    selected_date_set = set(selected_dates)
    weekly_service_ids = {
        service_id
        for service_id, dates in service_dates.items()
        if dates.intersection(selected_date_set)
    }
    metadata = {
        "basis": basis,
        "start_date": format_service_date(min(selected_dates)),
        "end_date": format_service_date(max(selected_dates)),
        "service_dates": [format_service_date(date) for date in selected_dates],
        "service_day_count": len(selected_dates),
    }
    return weekly_service_ids, metadata


def build_variants(trips, trip_stop_times, weekly_service_ids):
    variants = {}

    for trip_id in sorted(trip_stop_times.keys()):
        trip = trips.get(trip_id)
        if trip is None:
            continue
        stops_list = sorted(trip_stop_times[trip_id], key=lambda x: (x[0], x[1]))
        if not stops_list:
            continue
        ordered_stop_ids = [stop_id for _, __, stop_id in stops_list]
        signature = "|".join(ordered_stop_ids)
        route_id = trip["route_id"]
        direction_id = trip["direction_id"]
        shape_id = trip["shape_id"]
        headsign = trip["trip_headsign"]
        route_variant = trip["route_variant"]
        key = (route_id, direction_id, signature)

        group = variants.get(key)
        if group is None:
            group = {
                "route_id": route_id,
                "direction_id": direction_id,
                "signature": signature,
                "trip_count": 0,
                "weekly_trip_count": 0,
                "representative_trip_id": trip_id,
                "shape_id": shape_id,
                "headsign": headsign if headsign else "",
                "headsign_trip_id": trip_id if headsign else None,
                "route_variant": route_variant if route_variant else "",
                "route_variant_trip_id": trip_id if route_variant else None,
                "stop_sequence": [(seq, stop_id) for seq, _, stop_id in stops_list],
                "last_stop_id": ordered_stop_ids[-1],
            }
            variants[key] = group
        else:
            if shape_id and (group["shape_id"] is None or shape_id < group["shape_id"]):
                group["shape_id"] = shape_id
            if headsign and (
                group["headsign_trip_id"] is None
                or trip_id < group["headsign_trip_id"]
            ):
                group["headsign"] = headsign
                group["headsign_trip_id"] = trip_id
            if route_variant and (
                group["route_variant_trip_id"] is None
                or trip_id < group["route_variant_trip_id"]
            ):
                group["route_variant"] = route_variant
                group["route_variant_trip_id"] = trip_id

        group["trip_count"] += 1
        if weekly_service_ids is None or trip["service_id"] in weekly_service_ids:
            group["weekly_trip_count"] += 1

    return variants


def main():
    parser = argparse.ArgumentParser(description="Build GTFS subroute variants.")
    parser.add_argument("--input_dir", required=True)
    parser.add_argument("--output_dir", required=True)
    args = parser.parse_args()

    input_dir = args.input_dir
    output_dir = args.output_dir

    routes_path = os.path.join(input_dir, "routes.txt")
    trips_path = os.path.join(input_dir, "trips.txt")
    stop_times_path = os.path.join(input_dir, "stop_times.txt")
    calendar_dates_path = os.path.join(input_dir, "calendar_dates.txt")
    stops_path = os.path.join(input_dir, "stops.txt")
    shapes_path = os.path.join(input_dir, "shapes.txt")

    missing = [
        path
        for path in [routes_path, trips_path, stop_times_path, shapes_path]
        if not os.path.exists(path)
    ]
    if missing:
        missing_list = ", ".join(missing)
        print(f"Missing required GTFS files: {missing_list}", file=sys.stderr)
        sys.exit(1)

    routes, route_id_to_short, _, _ = load_routes(routes_path)
    trips = load_trips(trips_path)
    trip_stop_times = load_stop_times(stop_times_path)
    weekly_service_ids, trip_count_basis = find_latest_service_week(calendar_dates_path)
    stops = load_stops(stops_path)

    variants = build_variants(trips, trip_stop_times, weekly_service_ids)

    excluded_variants = {"18M", "18N", "18R", "18L"}
    variants_by_short = defaultdict(list)
    for _, group in variants.items():
        route_id = group["route_id"]
        route_short_name = route_id_to_short.get(route_id, "").strip() or route_id
        if route_short_name == "18" and group["route_variant"] in excluded_variants:
            continue
        variants_by_short[route_short_name].append(group)

    variants_index = {}
    variants_ordered = []
    for route_short_name in sorted(variants_by_short.keys()):
        groups = variants_by_short[route_short_name]

        def sort_key(group):
            shape_sort = group["shape_id"] if group["shape_id"] else "~~~"
            return (
                -group["trip_count"],
                group["direction_id"],
                shape_sort,
                group["representative_trip_id"],
            )

        groups.sort(key=sort_key)

        variant_list = []
        for idx, group in enumerate(groups):
            suffix = suffix_for_index(idx)
            variant_id = f"{route_short_name}{suffix}"
            if group["headsign"]:
                label = group["headsign"]
            else:
                stop_name = ""
                last_stop = stops.get(group["last_stop_id"])
                if last_stop:
                    stop_name = last_stop.get("stop_name") or ""
                if stop_name:
                    label = f"to {stop_name}"
                else:
                    label = f"{route_short_name} variant {suffix}"

            entry = {
                "variant_id": variant_id,
                "label": label,
                "route_id": group["route_id"],
                "direction_id": group["direction_id"],
                "shape_id": group["shape_id"],
                "trip_count": group["trip_count"],
                "weekly_trip_count": group["weekly_trip_count"],
                "representative_trip_id": group["representative_trip_id"],
                "route_variant": group["route_variant"],
            }
            variant_list.append(entry)
            variants_ordered.append((route_short_name, entry, group))

        variants_index[route_short_name] = variant_list

    shape_ids = {
        group["shape_id"]
        for _, _, group in variants_ordered
        if group["shape_id"]
    }
    shape_points = load_shapes(shapes_path, shape_ids)

    variant_lines = {"type": "FeatureCollection", "features": []}
    for route_short_name, entry, group in variants_ordered:
        shape_id = entry["shape_id"]
        if not shape_id:
            continue
        points = shape_points.get(shape_id)
        if not points:
            continue
        points_sorted = sorted(points, key=lambda x: (x[0], x[1]))
        coordinates = [[lon, lat] for _, __, lon, lat in points_sorted]
        if len(coordinates) < 2:
            continue
        feature = {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coordinates},
            "properties": {
                "route_short_name": route_short_name,
                "variant_id": entry["variant_id"],
                "label": entry["label"],
                "route_id": entry["route_id"],
                "direction_id": entry["direction_id"],
                "shape_id": shape_id,
                "trip_count": entry["trip_count"],
                "weekly_trip_count": entry["weekly_trip_count"],
            },
        }
        variant_lines["features"].append(feature)

    variant_stops = {}
    for _, entry, group in variants_ordered:
        stops_list = []
        for seq, stop_id in group["stop_sequence"]:
            stop_info = stops.get(stop_id, {})
            stops_list.append(
                {
                    "stop_id": stop_id,
                    "stop_name": stop_info.get("stop_name", ""),
                    "stop_lat": stop_info.get("stop_lat"),
                    "stop_lon": stop_info.get("stop_lon"),
                    "stop_sequence": seq,
                }
            )
        variant_stops[entry["variant_id"]] = stops_list

    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "routes_index.json"), "w", encoding="utf-8") as f:
        json.dump(routes, f, indent=2, ensure_ascii=True)
    with open(
        os.path.join(output_dir, "variants_index.json"), "w", encoding="utf-8"
    ) as f:
        json.dump(variants_index, f, indent=2, ensure_ascii=True)
    with open(
        os.path.join(output_dir, "variant_lines.geojson"), "w", encoding="utf-8"
    ) as f:
        json.dump(variant_lines, f, indent=2, ensure_ascii=True)
    with open(
        os.path.join(output_dir, "variant_stops.json"), "w", encoding="utf-8"
    ) as f:
        json.dump(variant_stops, f, indent=2, ensure_ascii=True)
    with open(
        os.path.join(output_dir, "trip_count_basis.json"), "w", encoding="utf-8"
    ) as f:
        json.dump(trip_count_basis, f, indent=2, ensure_ascii=True)


if __name__ == "__main__":
    main()
