#!/usr/bin/env python3
"""
build_network_gaps.py — rank underserved GO corridors.

Reads only the committed GTFS-derived JSON in client/public/gotransit/derived/
(no raw GTFS, stdlib only) and writes network_gaps.json next to them.

Method (Phase 1, frequency-approximation — no per-departure routing yet):

  1. Anchors = GO rail stations and major bus terminals.
  2. Phase 1 suggests BUS routes only, so a corridor endpoint must already host
     a GO bus (rail-only stations like Long Branch are out), and must not be a
     subway-interchange hub (a suburb->subway trip is what express buses are for).
  3. One-seat-ride graph: for a typical weekday's trips, the fastest scheduled
     ride between any two anchors a trip serves becomes an edge.
  4. Best itinerary A->B = Dijkstra over that graph with a flat transfer
     penalty, capped at 3 legs.
  5. Free-flow baseline = straight-line distance / 75 km/h. Radial trips whose
     beeline passes near Union are skipped (hub-and-spoke is meant for those).
  6. Demand weight = weekly trips serving the weaker endpoint (revealed
     preference; StatsCan commute flows are the planned upgrade).
  7. gap_score is demand-dominated, nudged by the transit/free-flow ratio and
     transfer count. Near-duplicate corridors collapse to the best.

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
MAX_KM = 135.0           # up to inter-city (Waterloo, Niagara, Cambridge)
MIN_RATIO = 2.4          # transit must be > 2.4x worse than free-flow
MIN_DEMAND = 0.18
KEEP = 20
DEDUP_KM = 6.0
DEDUP_BEARING_DEG = 28.0

# Radial trips (A -> downtown -> B) are what the hub-and-spoke network is built
# for — the "gap" there is an illusion of the straight-line comparison. Skip a
# corridor whose beeline passes close to Union.
UNION = (43.6453, -79.3806)
UNION_KEEPOUT_KM = 7.0

GO_SUFFIX = re.compile(r"\s+GO( Bus)?$", re.I)
TERMINAL = re.compile(r"(Bus Terminal|GO Bus Terminal)$", re.I)
NOISE = re.compile(r"(Parking Lot|Park & Ride|Transitway|@|Layby|Platform)", re.I)

# Interchange hubs, not destinations — a suburb-to-subway trip is already what
# GO's express buses are for, so these are poor corridor endpoints.
HUB_ENDPOINTS = {
    "Finch", "York Mills", "Yorkdale", "Scarborough Centre",
    "Renforth", "Union Station",
}

# Hand-picked regional corridors that matter but sit outside the auto-discovery
# window (too long, or an endpoint with almost no GO service). Routed through
# the `via` anchors; `access_min` covers the leg from a non-rail endpoint.
PRIORITY_CORRIDORS = [
    dict(
        headline="Kitchener–Waterloo ↔ Niagara Falls",
        a=("02800", "University of Waterloo"),
        b=("NI", "Niagara Falls GO"),
        via=("Kitchener", "Niagara Falls"),
        access_min=22,
    ),
    dict(
        headline="Guelph ↔ Highway 407",
        a=("GL", "Guelph Central GO"),
        b=("02674", "Hwy 407 Bus Terminal"),
        via=("Guelph Central", "Hwy 407"),
        access_min=0,
    ),
    dict(
        headline="Guelph ↔ Niagara Falls",
        a=("GL", "Guelph Central GO"),
        b=("NI", "Niagara Falls GO"),
        via=("Guelph Central", "Niagara Falls"),
        access_min=0,
    ),
    dict(
        headline="Cambridge ↔ Bramalea GO",
        a=("02150", "Cambridge Smart Centre"),
        b=("BE", "Bramalea GO"),
        via=None,
        access_min=None,
    ),
]
PRIORITY_SCORE_BOOST = 1.0


def load(name: str):
    return json.loads((DERIVED / name).read_text())


def haversine_km(a_lat, a_lon, b_lat, b_lon) -> float:
    R = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def point_to_segment_km(p, a, b) -> float:
    """Shortest distance from point p to the great-circle-ish segment a->b,
    approximated in a local equirectangular projection (fine at this scale)."""
    lat0 = math.radians((a[0] + b[0]) / 2)
    kx = 111.32 * math.cos(lat0)
    ky = 110.57
    px, py = (p[1] * kx, p[0] * ky)
    ax, ay = (a[1] * kx, a[0] * ky)
    bx, by = (b[1] * kx, b[0] * ky)
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    t = 0.0 if seg2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


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

    # One-seat-ride graph + which anchors see rail / bus service today.
    ride: dict[str, dict[str, float]] = {}
    rail_anchor: set[str] = set()
    bus_anchor: set[str] = set()
    served: set[str] = set()
    for t in trips:
        rtype = t.get("route_type")
        pts = [
            (anchor_of_code[p["stop_id"]], p["t"])
            for p in t["stops"]
            if p["stop_id"] in anchor_of_code
        ]
        for a, _ in pts:
            served.add(a)
            if rtype == 2:
                rail_anchor.add(a)
            elif rtype == 3:
                bus_anchor.add(a)
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

    # Phase 1 only suggests *bus* routes, so both endpoints of a corridor must
    # be able to physically host a bus: served by a GO bus today, or a named
    # bus terminal. This drops rail-only stations (Long Branch, Downsview Park,
    # Mimico, …) where a "bus stop" isn't real.
    def bus_servable(a: str) -> bool:
        return a in bus_anchor or any(
            TERMINAL.search(stops[c]["name"]) for c in codes_for_anchor[a]
        )

    print(
        f"{len(anchors)} anchors ({len(rail_anchor & set(anchors))} rail, "
        f"{sum(bus_servable(a) for a in anchors)} bus-servable)"
    )

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
            if not (bus_servable(A) and bus_servable(B)):
                continue  # a new bus route needs a place to stop at both ends
            if A in HUB_ENDPOINTS or B in HUB_ENDPOINTS:
                continue  # interchange hub, not a destination for a new route
            if B in ride.get(A, {}):
                continue  # a one-seat ride already exists
            if point_to_segment_km(UNION, (alat, alon), (blat, blon)) < UNION_KEEPOUT_KM:
                continue  # radial trip — the hub-and-spoke network is meant for this
            free_flow = km / FREE_FLOW_KMH * 60.0
            res = itineraries[A].get(B)
            if res is None:
                continue  # our sparse weekday graph can't route it — too uncertain to rank
            minutes, transfers = res[0], res[1]
            reachable = True
            if minutes > 185:
                continue  # our sparse weekday graph is routing this badly — skip
            ratio = minutes / free_flow
            if ratio < MIN_RATIO:
                continue
            dem = min(demand[A], demand[B])
            if dem < MIN_DEMAND:
                continue
            score = (
                0.32 * math.log(ratio)
                + 0.06 * min(transfers, MAX_LEGS)
                + 1.3 * dem
            )
            a_code = sorted(codes_for_anchor[A])[0]
            b_code = sorted(codes_for_anchor[B])[0]
            candidates.append(
                dict(
                    headline=f"{A} ↔ {B}",
                    a_code=a_code, a_name=stops[a_code]["name"], alat=alat, alon=alon,
                    b_code=b_code, b_name=stops[b_code]["name"], blat=blat, blon=blon,
                    km=km, free_flow=free_flow, minutes=minutes,
                    transfers=transfers, reachable=reachable, demand=dem, score=score,
                    mid=((alat + blat) / 2, (alon + blon) / 2),
                    bearing=bearing_deg(alat, alon, blat, blon),
                    priority=False,
                )
            )

    # ── Priority corridors (hand-picked, bypass the discovery filters) ────
    for pc in PRIORITY_CORRIDORS:
        (ac, an), (bc, bn) = pc["a"], pc["b"]
        alat, alon = stops[ac]["lat"], stops[ac]["lon"]
        blat, blon = stops[bc]["lat"], stops[bc]["lon"]
        km = haversine_km(alat, alon, blat, blon)
        free_flow = km / FREE_FLOW_KMH * 60.0
        res = None
        if pc["via"]:
            res = itineraries.get(pc["via"][0], {}).get(pc["via"][1])
        if res is None:
            minutes, transfers, reachable = free_flow * 2.8, MAX_LEGS, False
        else:
            access = pc["access_min"] or 0
            minutes = res[0] + access
            transfers = res[1] + (1 if access else 0)
            reachable = True
        ratio = minutes / max(free_flow, 1.0)
        dem = 0.7  # named regional markets — treat demand as high
        score = (
            0.3 * math.log(max(ratio, 1.01))
            + 0.08 * min(transfers, MAX_LEGS)
            + 1.1 * dem
            + PRIORITY_SCORE_BOOST
        )
        candidates.append(
            dict(
                headline=pc["headline"],
                a_code=ac, a_name=an, alat=alat, alon=alon,
                b_code=bc, b_name=bn, blat=blat, blon=blon,
                km=km, free_flow=free_flow, minutes=minutes,
                transfers=transfers, reachable=reachable, demand=dem, score=score,
                mid=((alat + blat) / 2, (alon + blon) / 2),
                bearing=bearing_deg(alat, alon, blat, blon),
                priority=True,
            )
        )

    candidates.sort(key=lambda c: c["score"], reverse=True)

    def is_duplicate(c, k) -> bool:
        if haversine_km(*c["mid"], *k["mid"]) >= DEDUP_KM:
            return False
        db = abs(c["bearing"] - k["bearing"]) % 360
        db = min(db, 360 - db)
        return db < DEDUP_BEARING_DEG or abs(db - 180) < DEDUP_BEARING_DEG

    kept = []
    for c in candidates:
        if c["priority"]:
            kept.append(c)
            continue
        if any(is_duplicate(c, k) for k in kept):
            continue
        if sum(1 for k in kept if not k["priority"]) >= KEEP:
            continue
        kept.append(c)

    def fmt(m: float) -> str:
        m = round(m)
        return f"{m // 60} h {m % 60:02d} min" if m >= 60 else f"{m} min"

    def demand_label(d: float) -> str:
        return "high" if d >= 0.55 else "moderate" if d >= 0.3 else "light"

    gaps = []
    for c in kept:
        note = (
            f"{fmt(c['minutes'])} by transit · "
            f"{c['transfers']} transfer{'s' if c['transfers'] != 1 else ''} · "
            f"~{fmt(c['free_flow'])} if direct"
            if c["reachable"]
            else f"No reasonable transit path today · ~{fmt(c['free_flow'])} if direct"
        )
        gaps.append(
            dict(
                id=slugify(c["headline"]),
                headline=c["headline"],
                note=note,
                mode="bus",
                priority=c["priority"],
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
                    "from": dict(code=c["a_code"], name=c["a_name"], lat=c["alat"], lon=c["alon"]),
                    "to": dict(code=c["b_code"], name=c["b_name"], lat=c["blat"], lon=c["blon"]),
                },
            )
        )

    payload = dict(
        generatedAt=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        method=(
            "Phase 1 frequency-approximation. Suggests bus routes only, so both "
            "endpoints must already host a GO bus. Radial trips through downtown are "
            "excluded. Best itinerary = shortest path over the one-seat-ride graph "
            "with a 12-min flat transfer penalty (max 3 legs). Free-flow = straight "
            "line / 75 km/h. Demand = weekly trips serving the weaker endpoint. "
            "Per-departure-time routing, real road times, and StatsCan commute flows "
            "are the planned upgrades."
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
