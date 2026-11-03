# Changelog

Notable changes to TransitFlow. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Test this route.** Every saved route in **Browse → Mine** has a new route
  icon that opens a journey comparison. Pick an origin, destination, date and
  departure time to see the fastest journey on the existing GO network next to
  the same network with your route added: total journey time, waiting time,
  transfers, walking and the services used, plus a one-line verdict
  ("gets you there 12 min sooner", "only possible with your route",
  "doesn't improve this journey").
  - Timetable-aware: respects scheduled departures, the selected date's weekday
    service (including the previous night's after-midnight trips), a 3-minute
    minimum same-stop transfer and walk-plus-buffer transfers between nearby
    stops.
  - Custom routes run on their configured frequency bands, fixed departures or
    timetable, the same way they do in the simulation.
  - Estimated timings are marked with "≈" and an "Estimated" badge; when no
    journey is found, the result explains which search limit was hit.
  - Routing runs in a web worker, so the map and simulation stay responsive.

### Changed

- Custom-route schedule expansion is now shared between the simulation and the
  journey planner (`buildCustomRouteTrips` in `client/lib/simulation.ts`).
  Simulation output is unchanged.

### Known limitations

- GO times come from one representative day per weekday in the feed week;
  holidays and date-specific service changes aren't modelled.
- Transfer times are flat defaults, not per station.
- Only the single best journey is shown.
