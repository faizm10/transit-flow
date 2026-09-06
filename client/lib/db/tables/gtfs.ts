/**
 * Query plane — normalized GTFS entities.
 *
 * Written once per ingestion by the worker with `COPY`, then read by query.
 * Every table is scoped by `dataset_id`, and every index leads with it, because
 * no query in the product ever spans datasets.
 *
 * Column choices that matter at 5M+ rows:
 *
 * - GTFS ids are text and are only unique *within* a feed, so the primary key
 *   is always `(dataset_id, <gtfs id>)`. There are no surrogate keys: they would
 *   cost a lookup on every `COPY` batch for no benefit.
 * - Times are `integer` seconds after midnight, not `text`. GTFS allows values
 *   past 24:00:00 for post-midnight service, which a `time` column cannot hold,
 *   and 4 bytes beats a 9-byte string across ~10M timestamps.
 * - Shapes are stored one row per shape with a `points` array, not one row per
 *   point. `shapes.txt` is millions of rows, but nothing ever reads a single
 *   point — every consumer wants the whole polyline. This turns millions of
 *   rows into thousands of TOAST-compressed arrays.
 *
 * Not used, deliberately: PostGIS. Bounding-box and radius queries are served
 * by a `(dataset_id, lat, lon)` btree, which needs no extension. If the product
 * grows real geometry operations — buffers, intersections, network distance —
 * that is when PostGIS earns its place.
 */

import {
  pgTable,
  text,
  uuid,
  integer,
  smallint,
  doublePrecision,
  real,
  boolean,
  date,
  jsonb,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

import { datasets } from "./platform";

/** Shared FK column definition — every entity table is dataset-scoped. */
const datasetId = () =>
  uuid("dataset_id")
    .notNull()
    .references(() => datasets.id, { onDelete: "cascade" });

// ── agency.txt ──────────────────────────────────────────────────────────────

export const gtfsAgencies = pgTable(
  "gtfs_agencies",
  {
    datasetId: datasetId(),
    agencyId: text("agency_id").notNull(),
    name: text("name").notNull(),
    url: text("url"),
    timezone: text("timezone"),
    lang: text("lang"),
    phone: text("phone"),
    fareUrl: text("fare_url"),
  },
  (table) => [primaryKey({ columns: [table.datasetId, table.agencyId] })]
);

// ── routes.txt ──────────────────────────────────────────────────────────────

export const gtfsRoutes = pgTable(
  "gtfs_routes",
  {
    datasetId: datasetId(),
    routeId: text("route_id").notNull(),
    agencyId: text("agency_id"),
    shortName: text("short_name"),
    longName: text("long_name"),
    description: text("description"),
    /** GTFS route_type: 0 tram, 1 subway, 2 rail, 3 bus, … */
    type: smallint("type").notNull(),
    /** Six hex digits, no leading '#', as GTFS stores it. */
    color: text("color"),
    textColor: text("text_color"),
    sortOrder: integer("sort_order"),
  },
  (table) => [
    primaryKey({ columns: [table.datasetId, table.routeId] }),
    // Route list, filtered by mode and ordered the way agencies intend.
    index("gtfs_routes_dataset_type_idx").on(table.datasetId, table.type),
    index("gtfs_routes_dataset_sort_idx").on(table.datasetId, table.sortOrder),
    // Route search by the name riders actually use ("GO 31", "Lakeshore West").
    index("gtfs_routes_dataset_short_name_idx").on(
      table.datasetId,
      table.shortName
    ),
  ]
);

// ── stops.txt ───────────────────────────────────────────────────────────────

export const gtfsStops = pgTable(
  "gtfs_stops",
  {
    datasetId: datasetId(),
    stopId: text("stop_id").notNull(),
    code: text("code"),
    name: text("name").notNull(),
    description: text("description"),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    zoneId: text("zone_id"),
    /** 0 stop, 1 station, 2 entrance, 3 generic node, 4 boarding area. */
    locationType: smallint("location_type").notNull().default(0),
    parentStation: text("parent_station"),
    timezone: text("timezone"),
    wheelchairBoarding: smallint("wheelchair_boarding"),
    platformCode: text("platform_code"),
  },
  (table) => [
    primaryKey({ columns: [table.datasetId, table.stopId] }),
    // Viewport and radius queries. Leading with dataset_id then lat lets
    // Postgres range-scan a latitude band and filter longitude in the heap —
    // adequate up to city scale, and it costs no extension.
    index("gtfs_stops_dataset_lat_lon_idx").on(
      table.datasetId,
      table.lat,
      table.lon
    ),
    index("gtfs_stops_dataset_name_idx").on(table.datasetId, table.name),
    // Grouping platforms under their parent station.
    index("gtfs_stops_dataset_parent_idx").on(
      table.datasetId,
      table.parentStation
    ),
  ]
);

// ── calendar.txt ────────────────────────────────────────────────────────────

export const gtfsServices = pgTable(
  "gtfs_services",
  {
    datasetId: datasetId(),
    serviceId: text("service_id").notNull(),
    monday: boolean("monday").notNull().default(false),
    tuesday: boolean("tuesday").notNull().default(false),
    wednesday: boolean("wednesday").notNull().default(false),
    thursday: boolean("thursday").notNull().default(false),
    friday: boolean("friday").notNull().default(false),
    saturday: boolean("saturday").notNull().default(false),
    sunday: boolean("sunday").notNull().default(false),
    startDate: date("start_date"),
    endDate: date("end_date"),
  },
  (table) => [
    primaryKey({ columns: [table.datasetId, table.serviceId] }),
    // "Which services run on this date" — the service-date workload.
    index("gtfs_services_dataset_range_idx").on(
      table.datasetId,
      table.startDate,
      table.endDate
    ),
  ]
);

// ── calendar_dates.txt ──────────────────────────────────────────────────────

export const gtfsServiceExceptions = pgTable(
  "gtfs_service_exceptions",
  {
    datasetId: datasetId(),
    serviceId: text("service_id").notNull(),
    date: date("date").notNull(),
    /** 1 = service added on this date, 2 = removed. */
    exceptionType: smallint("exception_type").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.datasetId, table.serviceId, table.date],
    }),
    // Feeds that use calendar_dates exclusively are queried by date alone.
    index("gtfs_service_exceptions_dataset_date_idx").on(
      table.datasetId,
      table.date
    ),
  ]
);

// ── shapes.txt (aggregated) ─────────────────────────────────────────────────

export const gtfsShapes = pgTable(
  "gtfs_shapes",
  {
    datasetId: datasetId(),
    shapeId: text("shape_id").notNull(),
    /**
     * Ordered `[lon, lat]` pairs at 5 decimal places (~1 m). Lon-first to match
     * GeoJSON, so map layers can use it without a transform.
     */
    points: jsonb("points").$type<[number, number][]>().notNull(),
    pointCount: integer("point_count").notNull(),
    /** Douglas–Peucker-simplified copy for map rendering at low zoom. */
    simplified: jsonb("simplified").$type<[number, number][] | null>(),
  },
  (table) => [primaryKey({ columns: [table.datasetId, table.shapeId] })]
);

// ── trips.txt ───────────────────────────────────────────────────────────────

export const gtfsTrips = pgTable(
  "gtfs_trips",
  {
    datasetId: datasetId(),
    tripId: text("trip_id").notNull(),
    routeId: text("route_id").notNull(),
    serviceId: text("service_id").notNull(),
    headsign: text("headsign"),
    shortName: text("short_name"),
    directionId: smallint("direction_id"),
    blockId: text("block_id"),
    shapeId: text("shape_id"),
    wheelchairAccessible: smallint("wheelchair_accessible"),
    bikesAllowed: smallint("bikes_allowed"),
  },
  (table) => [
    primaryKey({ columns: [table.datasetId, table.tripId] }),
    // "Trips on this route", optionally split by direction — the trip-filtering
    // workload, and the join the route page runs.
    index("gtfs_trips_dataset_route_direction_idx").on(
      table.datasetId,
      table.routeId,
      table.directionId
    ),
    // "Trips running on this service date", after resolving calendar.
    index("gtfs_trips_dataset_service_idx").on(table.datasetId, table.serviceId),
    index("gtfs_trips_dataset_shape_idx").on(table.datasetId, table.shapeId),
  ]
);

// ── stop_times.txt ──────────────────────────────────────────────────────────

/**
 * The big table: millions of rows per feed.
 *
 * No foreign keys to trips or stops. GTFS feeds routinely contain dangling
 * references, and enforcing them would abort a multi-million-row `COPY` on the
 * first bad row instead of reporting it as a validation issue the user can act
 * on. Referential problems are recorded in `dataset_issues`, not thrown.
 */
export const gtfsStopTimes = pgTable(
  "gtfs_stop_times",
  {
    datasetId: datasetId(),
    tripId: text("trip_id").notNull(),
    stopSequence: integer("stop_sequence").notNull(),
    stopId: text("stop_id").notNull(),
    /** Seconds after midnight; may exceed 86400 for post-midnight service. */
    arrivalTime: integer("arrival_time"),
    departureTime: integer("departure_time"),
    stopHeadsign: text("stop_headsign"),
    pickupType: smallint("pickup_type"),
    dropOffType: smallint("drop_off_type"),
    /** `real` not `double`: shape distance never needs 15 significant digits. */
    shapeDistTraveled: real("shape_dist_traveled"),
    timepoint: smallint("timepoint"),
  },
  (table) => [
    // Clustered access pattern: every stop-time read is "the sequence for this
    // trip, in order".
    primaryKey({
      columns: [table.datasetId, table.tripId, table.stopSequence],
    }),
    // Departure boards: "what calls at this stop, next".
    index("gtfs_stop_times_dataset_stop_departure_idx").on(
      table.datasetId,
      table.stopId,
      table.departureTime
    ),
  ]
);

// ── Type exports ────────────────────────────────────────────────────────────

export type GtfsAgency = typeof gtfsAgencies.$inferSelect;
export type GtfsRoute = typeof gtfsRoutes.$inferSelect;
export type GtfsStop = typeof gtfsStops.$inferSelect;
export type GtfsService = typeof gtfsServices.$inferSelect;
export type GtfsServiceException = typeof gtfsServiceExceptions.$inferSelect;
export type GtfsShape = typeof gtfsShapes.$inferSelect;
export type GtfsTrip = typeof gtfsTrips.$inferSelect;
export type GtfsStopTime = typeof gtfsStopTimes.$inferSelect;
