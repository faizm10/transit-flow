#!/usr/bin/env python3
"""
build_network_gaps.py — rank underserved GO corridors.

Reads only the committed GTFS-derived JSON in client/public/gotransit/derived/
(no raw GTFS, stdlib only) and writes network_gaps.json next to them.

Method (Phase 1, frequency-approximation — no per-departure routing yet):

  1. Anchors = GO rail stations and major bus terminals.
  2. One-seat-ride graph: for a typical weekday's trips, the fastest scheduled
     ride between any two anchors a trip serves becomes an edge.
  3. Best itinerary A->B = Dijkstra over that graph with a flat transfer
     penalty, capped at 3 legs.
  4. Free-flow baseline = straight-line distance / 75 km/h.
  5. Demand weight = weekly trips serving the weaker endpoint (revealed
     preference; StatsCan commute flows are the planned upgrade).
  6. gap_score rewards a big transit/free-flow ratio, transfers, and demand,
     with a bonus for having no one-seat ride at all.
  7. Near-duplicate corridors (same midpoint + bearing) collapse to the best.

Run:  python3 scripts/build_network_gaps.py
"""

from __future__ import annotations

import json
import math
import re
import heapq
import datetime
from pathlib import Path

DERIVED = Path(__file__).resolve().parent.parent / "client" / "public" / "gotransit" / "derived"
OUT = DERIVED / "network_gaps.json"

WEEKDAY_DOW = "3"          # a representative Wednesday
TRANSFER_PENALTY_MIN = 12.0
MAX_LEGS = 3
FREE_FLOW_KMH = 75.0
MIN_KM = 22.0             # regional corridors, not neighbourhood hops
MAX_KM = 90.0
MIN_RATIO = 2.4          # transit must be > 2.2x worse than free-flow
KEEP = 24
DEDUP_KM = 6.0
DEDUP_BEARING_DEG = 28.0

GO_SUFFIX = re.compile(r"\s+GO( Bus)?$", re.I)
TERMINAL = re.compile(r"(Bus Terminal|GO Bus Terminal)$", re.I)
NOISE = re.compile(r"(Parking Lot|Park & Ride|Transitway|@|Layby|Platform)", re.I)


def load(name: str):
    return json.loads((DERIVED / name).read_text())


def haversine_km(a_lat, a_lon, b_lat, b_lon) -> float:
    R = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def bearing_deg(a_lat, a_lon, b_lat, b_lon) -> float:
    y = math.sin(math.radians(b_lon - a_lon)) * math.cos(math.radians(b_lat))
    x = math.cos(math.radians(a_lat)) * math.sin(math.radians(b_lat)) - math.sin(
        math.radians(a_lat)
    ) * math.cos(math.radians(b_lat)) * math.cos(math.radians(b_lon - a_lon))
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def short_name(name: str) -> str:
    n = GO_SUFFIX.sub("", name).strip()
    n = re.sub(r"\s+Bus Terminal$", "", n).strip()
    n = re.sub(r"\s*\(([^)]*)\)\s*$", "", n).strip()
    return n or name


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main() -> None:
    stops = load("stops_lookup.json")                 # code -> {lat, lon, name}
    trips = load("sim_trips_by_dow.json")[WEEKDAY_DOW] # [ {route_type, stops:[{stop_id,t,seq}]} ]
    variants_index = load("variants_index.json")
    variant_stops = load("variant_stops.json")

    # Anchor identity = canonical station name; keep every stop code under it.
    codes_for_anchor: dict[str, set[str]] = {}
    anchor_of_code: dict[str, str] = {}
    anchor_pos: dict[str, tuple[float, float]] = {}
    for code, s in stops.items():
        name = s["name"]
        if NOISE.search(name):
            continue
        if not (GO_SUFFIX.search(name) or TERMINAL.search(name)):
            continue
        key = short_name(name)
        codes_for_anchor.setdefault(key, set()).add(code)
        anchor_of_code[code] = key
        anchor_pos.setdefault(key, (s["lat"], s["lon"]))

    # Demand: weekly trips serving each anchor.
    weekly_at_code: dict[str, float] = {}
    for _short, variants in variants_index.items():
        for v in variants:
            wtc = float(v.get("weekly_trip_count") or 0)
            for st in variant_stops.get(v["variant_id"], []):
                weekly_at_code[st["stop_id"]] = weekly_at_code.get(st["stop_id"], 0.0) + wtc

    # One-seat-ride graph + which anchors see rail service.
    ride: dict[str, dict[str, float]] = {}
    rail_anchor: set[str] = set()
    served: set[str] = set()
    for t in trips:
        is_rail = t.get("route_type") == 2
        pts = [
            (anchor_of_code[p["stop_id"]], p["t"])
            for p in t["stops"]
            if p["stop_id"] in anchor_of_code
        ]
        for a, _ in pts:
            served.add(a)
            if is_rail:
                rail_anchor.add(a)
        for i in range(len(pts)):
            ai, ti = pts[i]
            for j in range(i + 1, len(pts)):
                aj, tj = pts[j]
                if aj == ai:
                    continue
                dur = (tj - ti) / 60.0
                if dur <= 0 or dur > 240:
                    continue
                ride.setdefault(ai, {})
                ride.setdefault(aj, {})
                if dur < ride[ai].get(aj, 1e9):
                    ride[ai][aj] = dur
                    ride[aj][ai] = dur  # corridor treated as symmetric

    # Keep only anchors that (a) are actually served and (b) matter: rail
    # stations or terminals. This drops TTC-subway stop names that leak in.
    anchors = sorted(
        a for a in codes_for_anchor
        if a in served and (a in rail_anchor or any(TERMINAL.search(stops[c]["name"]) for c in codes_for_anchor[a]))
    )
    print(f"{len(anchors)} anchors ({len(rail_anchor & set(anchors))} rail)")

    demand_raw = {
        a: sum(weekly_at_code.get(c, 0.0) for c in codes_for_anchor[a]) for a in anchors
    }
    dmax = max(demand_raw.values()) or 1.0
    demand = {a: min(1.0, (demand_raw[a] / dmax) ** 0.5) for a in anchors}

    def best_from(src: str) -> dict[str, tuple[float, int]]:
        best: dict[str, tuple[float, int]] = {src: (0.0, 0)}
        pq: list[tuple[float, int, str]] = [(0.0, 0, src)]
        while pq:
            cost, legs, node = heapq.heappop(pq)
            if cost > best[node][0] or legs >= MAX_LEGS:
                continue
            for nxt, dur in ride.get(node, {}).items():
                nc = cost + dur + (TRANSFER_PENALTY_MIN if legs > 0 else 0.0)
                if nc < best.get(nxt, (1e18, 0))[0]:
                    best[nxt] = (nc, legs + 1)
                    heapq.heappush(pq, (nc, legs + 1, nxt))
        return best

    itineraries = {a: best_from(a) for a in anchors}

    candidates = []
    for i, A in enumerate(anchors):
        alat, alon = anchor_pos[A]
        for B in anchors[i + 1:]:
            blat, blon = anchor_pos[B]
            km = haversine_km(alat, alon, blat, blon)
            if km < MIN_KM or km > MAX_KM:
                continue
            if B in ride.get(A, {}):
                continue  # a one-seat ride already exists
            free_flow = km / FREE_FLOW_KMH * 60.0
            res = itineraries[A].get(B)
            if res is None:
                continue  # our sparse weekday graph can't route it — too uncertain to rank
            minutes, transfers, reachable = res[0], res[1], True
            ratio = minutes / free_flow
            if reachable and ratio < MIN_RATIO:
                continue
            dem = min(demand[A], demand[B])
            if dem < 0.05:
                continue
            both_rail = A in rail_anchor and B in rail_anchor
            score = (
                0.5 * math.log(ratio)
                + 0.08 * min(transfers, MAX_LEGS)
                + 0.85 * dem
                + (0.25 if both_rail else 0.0)
            )
            candidates.append(
                dict(
                    A=A, B=B, km=km, free_flow=free_flow, minutes=minutes,
                    transfers=transfers, reachable=reachable, demand=dem, score=score,
                    mid=((alat + blat) / 2, (alon + blon) / 2),
                    bearing=bearing_deg(alat, alon, blat, blon),
                )
            )

    candidates.sort(key=lambda c: c["score"], reverse=True)

    kept = []
    for c in candidates:
        dup = False
        for k in kept:
            if haversine_km(*c["mid"], *k["mid"]) < DEDUP_KM:
                db = abs(c["bearing"] - k["bearing"]) % 360
                db = min(db, 360 - db)
                if db < DEDUP_BEARING_DEG or abs(db - 180) < DEDUP_BEARING_DEG:
                    dup = True
                    break
        if not dup:
            kept.append(c)
        if len(kept) >= KEEP:
            break

    def fmt(m: float) -> str:
        m = round(m)
        return f"{m // 60} h {m % 60:02d} min" if m >= 60 else f"{m} min"

    def demand_label(d: float) -> str:
        return "high" if d >= 0.55 else "moderate" if d >= 0.3 else "light"

    gaps = []
    for c in kept:
        A, B = c["A"], c["B"]
        a_code = sorted(codes_for_anchor[A])[0]
        b_code = sorted(codes_for_anchor[B])[0]
        alat, alon = anchor_pos[A]
        blat, blon = anchor_pos[B]
        note = (
            f"{fmt(c['minutes'])} by transit · "
            f"{c['transfers']} transfer{'s' if c['transfers'] != 1 else ''} · "
            f"~{fmt(c['free_flow'])} if direct"
            if c["reachable"]
            else f"No reasonable transit path today · ~{fmt(c['free_flow'])} if direct"
        )
        gaps.append(
            dict(
                id=f"{slugify(A)}__{slugify(B)}",
                headline=f"{A} ↔ {B}",
                note=note,
                straightLineKm=round(c["km"], 1),
                freeFlowMin=round(c["free_flow"]),
                current=dict(
                    minutes=round(c["minutes"]),
                    transfers=c["transfers"],
                    direct=False,
                    reachable=c["reachable"],
                ),
                demand=round(c["demand"], 2),
                demandLabel=demand_label(c["demand"]),
                score=round(c["score"], 3),
                **{
                    "from": dict(code=a_code, name=stops[a_code]["name"], lat=alat, lon=alon),
                    "to": dict(code=b_code, name=stops[b_code]["name"], lat=blat, lon=blon),
                },
            )
        )

    payload = dict(
        generatedAt=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        method=(
            "Phase 1 frequency-approximation. Best itinerary = shortest path over the "
            "one-seat-ride graph with an 8-min flat transfer penalty (max 3 legs). "
            "Free-flow = straight line / 75 km/h. Demand = weekly trips serving the "
            "weaker endpoint. Per-departure-time routing, real road times, and StatsCan "
            "commute flows are the planned upgrades."
        ),
        count=len(gaps),
        gaps=gaps,
    )
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"wrote {OUT.relative_to(Path.cwd())} — {len(gaps)} corridors\n")
    for g in gaps:
        print(f"  {g['score']:.2f}  {g['headline']:<44}  {g['note']}")


if __name__ == "__main__":
    main()
