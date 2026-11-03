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
- **Show journey on map.** "Show on map" draws both compared journeys: the
  journey with your route in service colours (dotted walks) over a dashed grey
  existing-network journey, and fits the map to them. A floating bar has the
  legend plus "Back to results".
- **Pick places on the map.** The pin button in the From / To fields lets you
  click anywhere on the map; the point is named after the nearest stop.
- **Departure sweep.** Switch to "Time range" to compare every 10–60 minutes
  across up to 12 hours. Shows how many departures your route helps, the
  average and best time saved, a per-departure chart (click a column to open
  that journey) and a table view.
- **Network impact report.** A new "Check network impact" button (route list
  and journey test) compares every GO rail station and your route's stops with
  each other, with and without your route, at the same day and departure
  times. It reports how many journeys get faster, the average saving among
  them, how many need fewer transfers, which journeys become possible within
  the tested window, and the ten biggest improvements with the services used
  before and after. Limits and estimated timings are spelled out, and results
  describe travel options, not predicted passenger numbers.
- **More ways in.** Saving a route shows a "Test this route" toast action, and
  the simulation dock has a test button when a custom route is playing.

### Changed

- Custom-route schedule expansion is now shared between the simulation and the
  journey planner (`buildCustomRouteTrips` in `client/lib/simulation.ts`).
  Simulation output is unchanged.

### Known limitations

- GO times come from one representative day per weekday in the feed week;
  holidays and date-specific service changes aren't modelled.
- Transfer times are flat defaults, not per station.
- Only the single best journey is shown.
- Journeys on the map join stops with straight lines rather than following
  track or road shapes.
