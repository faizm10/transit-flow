#!/usr/bin/env python3
"""
Build derived GTFS JSON for Transit Flow's simulation and schedule APIs.

Generates four files in client/public/gotransit/derived/:
  - stops_lookup.json       stop_id → {lat, lon, name}
  - sim_trips_by_dow.json   trips by JS day-of-week (0=Sun) for the simulation API
  - departures_index.json   "ROUTE|dow" → [{time, headsign, directionId}]
  - trip_stop_times.json    representative_trip_id → [{stopId, stopName, lat, lon,
                              sequence, arrivalTime, departureTime}]

Run from the project root:
  python3 scripts/build_gtfs_derived.py

The raw GTFS files are read from server/data/gotransit/.
The output files are committed to the repo so Vercel can read them at runtime.
"""

from __future__ import annotations
import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

GTFS_DIR   = Path(__file__).parent.parent / "server" / "data" / "gotransit"
OUTPUT_DIR = Path(__file__).parent.parent / "client" / "public" / "gotransit" / "derived"
VARIANTS_INDEX_PATH = OUTPUT_DIR / "variants_index.json"


def load_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def hhmm(t: str) -> str:
    return t.strip()[:5] if t else ""


def parse_secs(t: str) -> int | None:
    parts = (t or "").strip().split(":")
    if len(parts) < 2:
        return None
    try:
        h, m = int(parts[0]), int(parts[1])
        s = int(parts[2]) if len(parts) > 2 else 0
        return h * 3600 + m * 60 + s
    except (ValueError, IndexError):
        return None


def py_dow_to_js(py_weekday: int) -> int:
    """Python weekday (0=Mon, 6=Sun) → JS getDay() (0=Sun, 6=Sat)."""
    return (py_weekday + 1) % 7


def main() -> None:
    print("=== build_gtfs_derived.py ===")

    # ── 1. Stops ─────────────────────────────────────────────────────────────
    print("Loading stops.txt …")
    stops_lookup: dict[str, dict] = {}
    for row in load_csv(GTFS_DIR / "stops.txt"):
        sid = row["stop_id"].strip()
        try:
            stops_lookup[sid] = {
                "lat": float(row["stop_lat"]),
                "lon": float(row["stop_lon"]),
                "name": row["stop_name"].strip(),
            }
        except (ValueError, KeyError):
            pass
    print(f"  {len(stops_lookup):,} stops")

    # ── 2. Routes ─────────────────────────────────────────────────────────────
    print("Loading routes.txt …")
    routes_by_id: dict[str, dict] = {}
    for row in load_csv(GTFS_DIR / "routes.txt"):
        rid = row["route_id"].strip()
        routes_by_id[rid] = {
            "short_name": row.get("route_short_name", "").strip(),
            "long_name":  row.get("route_long_name",  "").strip(),
            "type":       int(row.get("route_type", "3") or "3"),
        }

    # ── 3. Determine representative service IDs (one per JS day-of-week) ─────
    print("Loading calendar_dates.txt …")
    today = date.today()
    best: dict[int, tuple[int, str]] = {}   # js_dow → (days_from_today, service_id)

    for row in load_csv(GTFS_DIR / "calendar_dates.txt"):
        sid = row.get("service_id", "").strip()
        if len(sid) != 8:
            continue
        try:
            d = date(int(sid[:4]), int(sid[4:6]), int(sid[6:8]))
        except ValueError:
            continue
        delta = (d - today).days
        js_dow = py_dow_to_js(d.weekday())
        # Prefer closest future date; fall back to closest past date if no future exists
        if delta >= 0:
            if js_dow not in best or best[js_dow][0] < 0 or delta < best[js_dow][0]:
                best[js_dow] = (delta, sid)
        elif js_dow not in best or (best[js_dow][0] < 0 and delta > best[js_dow][0]):
            best[js_dow] = (delta, sid)

    rep_by_dow: dict[int, str] = {dow: v[1] for dow, v in best.items()}
    rep_service_ids: set[str] = set(rep_by_dow.values())
    print(f"  Representative service IDs: {rep_by_dow}")

    # ── 4. Representative trip IDs (for schedule API) ─────────────────────────
    print("Loading variants_index.json …")
    with VARIANTS_INDEX_PATH.open() as f:
        variants_index: dict = json.load(f)

    rep_trip_ids: set[str] = set()
    for variants in variants_index.values():
        for v in variants:
            tid = v.get("representative_trip_id")
            if tid:
                rep_trip_ids.add(tid)
    print(f"  {len(rep_trip_ids):,} representative trip IDs")

    # ── 5. Trips ──────────────────────────────────────────────────────────────
    print("Loading trips.txt …")
    trips_by_service: dict[str, list[dict]] = defaultdict(list)
    trip_meta: dict[str, dict] = {}

    for row in load_csv(GTFS_DIR / "trips.txt"):
        tid  = row.get("trip_id",       "").strip()
        sid  = row.get("service_id",    "").strip()
        rid  = row.get("route_id",      "").strip()
        hs   = row.get("trip_headsign", "").strip()
        did  = int(row.get("direction_id", "0") or "0")
        shid = row.get("shape_id", "").strip() or None

        route = routes_by_id.get(rid, {})
        sn    = route.get("short_name", "")
        meta  = {
            "trip_id":          tid,
            "route_short_name": sn,
            "route_long_name":  route.get("long_name", sn),
            "route_type":       route.get("type", 3),
            "shape_id":         shid,
            "headsign":         hs,
            "direction_id":     did,
        }
        trip_meta[tid] = meta
        if sid in rep_service_ids:
            trips_by_service[sid].append(meta)

    sim_trip_ids: set[str] = {
        t["trip_id"]
        for trips in trips_by_service.values()
        for t in trips
    }
    all_needed: set[str] = sim_trip_ids | rep_trip_ids
    print(f"  {len(sim_trip_ids):,} simulation trips, {len(rep_trip_ids):,} rep trips to index")

    # ── 6. Stop times (single pass over the big file) ─────────────────────────
    print("Loading stop_times.txt (large — may take ~60 s) …")
    sim_stop_times: dict[str, list[dict]] = defaultdict(list)
    rep_st: dict[str, list[dict]] = defaultdict(list)
    count = 0

    with (GTFS_DIR / "stop_times.txt").open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            count += 1
            if count % 500_000 == 0:
                print(f"    {count:,} rows …")

            tid = row.get("trip_id", "").strip()
            if tid not in all_needed:
                continue

            stop_id  = row.get("stop_id", "").strip()
            dep_raw  = (row.get("departure_time") or row.get("arrival_time") or "").strip()
            arr_raw  = (row.get("arrival_time")   or dep_raw).strip()
            seq      = int(float(row.get("stop_sequence", "0") or "0"))
            dep_secs = parse_secs(dep_raw)
            if dep_secs is None:
                continue

            if tid in sim_trip_ids:
                sim_stop_times[tid].append({"stop_id": stop_id, "t": dep_secs, "seq": seq})

            if tid in rep_trip_ids:
                si = stops_lookup.get(stop_id, {})
                rep_st[tid].append({
                    "stopId":        stop_id,
                    "stopName":      si.get("name", stop_id),
                    "lat":           si.get("lat", 0),
                    "lon":           si.get("lon", 0),
                    "sequence":      seq,
                    "arrivalTime":   hhmm(arr_raw),
                    "departureTime": hhmm(dep_raw),
                })

    print(f"  {count:,} rows processed")

    # Sort by sequence
    for lst in sim_stop_times.values():
        lst.sort(key=lambda x: x["seq"])
    for lst in rep_st.values():
        lst.sort(key=lambda x: x["sequence"])

    # ── 7. Build sim_trips_by_dow ─────────────────────────────────────────────
    print("Building sim_trips_by_dow.json …")
    sim_by_dow: dict[str, list] = {}
    for js_dow, service_id in rep_by_dow.items():
        bucket: list[dict] = []
        for meta in trips_by_service.get(service_id, []):
            tid = meta["trip_id"]
            st  = sim_stop_times.get(tid, [])
            if len(st) < 2:
                continue
            bucket.append({
                "trip_id":          tid,
                "route_short_name": meta["route_short_name"],
                "route_long_name":  meta["headsign"] or meta["route_long_name"],
                "route_type":       meta["route_type"],
                "shape_id":         meta["shape_id"],
                "stops":            st,
            })
        sim_by_dow[str(js_dow)] = bucket
        print(f"  DOW {js_dow}: {len(bucket):,} trips")

    # ── 8. Build departures_index ─────────────────────────────────────────────
    print("Building departures_index.json …")
    departures_index: dict[str, list] = {}
    for js_dow, service_id in rep_by_dow.items():
        for meta in trips_by_service.get(service_id, []):
            tid = meta["trip_id"]
            sn  = meta["route_short_name"]
            if not sn:
                continue
            st = sim_stop_times.get(tid, [])
            if not st:
                continue
            dep_secs = st[0]["t"]
            h, m = (dep_secs % 86400) // 3600, (dep_secs % 3600) // 60
            key  = f"{sn}|{js_dow}"
            entry: dict = {
                "time":        f"{h:02d}:{m:02d}",
                "headsign":    meta["headsign"],
                "directionId": meta["direction_id"],
            }
            departures_index.setdefault(key, []).append(entry)

    for key, entries in departures_index.items():
        seen: set[str] = set()
        deduped: list[dict] = []
        for e in entries:
            k = f"{e['time']}|{e['directionId']}"
            if k not in seen:
                seen.add(k)
                deduped.append(e)
        deduped.sort(key=lambda x: x["time"])
        departures_index[key] = deduped

    print(f"  {len(departures_index)} departure buckets")

    # ── 9. Write output ───────────────────────────────────────────────────────
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    def write(name: str, data: object) -> None:
        path = OUTPUT_DIR / name
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))
        kb = path.stat().st_size / 1024
        unit = "MB" if kb > 1024 else "KB"
        size = kb / 1024 if kb > 1024 else kb
        print(f"  ✓ {name}: {size:.1f} {unit}")

    print("Writing output files …")
    write("stops_lookup.json",     stops_lookup)
    write("sim_trips_by_dow.json", sim_by_dow)
    write("departures_index.json", departures_index)
    write("trip_stop_times.json",  dict(rep_st))

    print("\nDone. Commit the four new files in client/public/gotransit/derived/.")


if __name__ == "__main__":
    main()
