import { NextResponse } from "next/server";
import path from "path";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import readline from "readline";

type VariantEntry = {
  variant_id: string;
  label: string;
  route_id: string;
  direction_id: number;
  shape_id: string | null;
  trip_count: number;
  representative_trip_id: string;
  route_variant?: string;
};

type RouteEntry = {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number | string;
};

type TripDetail = {
  tripId: string;
  departureTime: number;
  departureTimeFormatted: string;
  dayType: "weekday" | "weekend" | "unknown";
  serviceId: string;
  timesPerWeek: number;
  firstStopName: string;
};

type FrequencyData = {
  variant_id: string;
  route_short_name: string;
  route_variant: string;
  route_long_name: string;
  route_type: string;
  direction_id: number;
  startStopName: string;
  endStopName: string;
  hourlyFrequency: Array<{ hour: number; trips: number }>;
  hourlyFrequencyWeekday: Array<{ hour: number; trips: number }>;
  hourlyFrequencyWeekend: Array<{ hour: number; trips: number }>;
  headways: number[];
  totalTrips: number;
  totalTripsWeekday: number;
  totalTripsWeekend: number;
  peakHour: number;
  peakFrequency: number;
  peakHourWeekday: number;
  peakFrequencyWeekday: number;
  peakHourWeekend: number;
  peakFrequencyWeekend: number;
  averageHeadway: number;
  minHeadway: number;
  maxHeadway: number;
  tripDetails: Array<TripDetail>; // Detailed trip information
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseTimeToSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const seconds = Number(parts[2] ?? "0");
  if ([hours, minutes, seconds].some((part) => Number.isNaN(part))) {
    return null;
  }
  // Handle times that exceed 24 hours (e.g., 25:30:00 = next day 1:30 AM)
  const normalizedHours = hours >= 24 ? hours - 24 : hours;
  return normalizedHours * 3600 + minutes * 60 + seconds;
}

function secondsToHour(seconds: number): number {
  return Math.floor(seconds / 3600);
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const normalizedHours = hours >= 24 ? hours - 24 : hours;
  return `${normalizedHours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function isWeekend(dateString: string): boolean {
  // dateString format: YYYYMMDD (e.g., "20260424")
  const year = Number.parseInt(dateString.substring(0, 4), 10);
  const month = Number.parseInt(dateString.substring(4, 6), 10) - 1; // 0-indexed
  const day = Number.parseInt(dateString.substring(6, 8), 10);
  const date = new Date(year, month, day);
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export async function GET() {
  try {
    const basePath = path.join(
      process.cwd(),
      "public",
      "gotransit",
      "derived",
    );
    const variantsPath = path.join(basePath, "variants_index.json");
    const routesPath = path.join(basePath, "routes_index.json");
    const variantStopsPath = path.join(basePath, "variant_stops.json");
    const stopTimesPath = path.join(
      process.cwd(),
      "public",
      "gotransit",
      "stop_times.txt",
    );
    const tripsPath = path.join(
      process.cwd(),
      "public",
      "gotransit",
      "trips.txt",
    );
    const calendarDatesPath = path.join(
      process.cwd(),
      "public",
      "gotransit",
      "calendar_dates.txt",
    );

    const [variantsRaw, routesRaw, variantStopsRaw] = await Promise.all([
      fs.readFile(variantsPath, "utf8"),
      fs.readFile(routesPath, "utf8"),
      fs.readFile(variantStopsPath, "utf8"),
    ]);

    const variantsIndex = JSON.parse(variantsRaw) as Record<
      string,
      VariantEntry[]
    >;
    const routesIndex = JSON.parse(routesRaw) as RouteEntry[];
    const variantStops = JSON.parse(variantStopsRaw) as Record<
      string,
      Array<{
        stop_id: string;
        stop_name: string;
        stop_lat: number | null;
        stop_lon: number | null;
        stop_sequence: number;
      }>
    >;

    const routeById = new Map<string, RouteEntry>();
    routesIndex.forEach((route) => routeById.set(route.route_id, route));

    // Build variant lookup
    const variantLookup = new Map<
      string,
      {
        route_short_name: string;
        route_variant: string;
        direction_id: number;
        route_id: string;
        trip_ids: string[];
      }
    >();

    Object.entries(variantsIndex).forEach(([routeShortName, variants]) => {
      variants.forEach((variant) => {
        variantLookup.set(variant.variant_id, {
          route_short_name: routeShortName,
          route_variant: variant.route_variant || variant.variant_id,
          direction_id: variant.direction_id,
          route_id: variant.route_id,
          trip_ids: [], // Will be populated from trips.txt
        });
      });
    });

    // Read calendar_dates.txt to map service_id to weekday/weekend and count actual service days
    const calendarDatesContent = await fs.readFile(calendarDatesPath, "utf8");
    const calendarDatesLines = calendarDatesContent.split("\n").filter(Boolean);
    const calendarDatesHeaders = parseCsvLine(calendarDatesLines[0]).map((h) => h.trim());
    if (calendarDatesHeaders[0]) {
      calendarDatesHeaders[0] = calendarDatesHeaders[0].replace(/^\uFEFF/, "");
    }

    const serviceIdToDayType = new Map<string, "weekday" | "weekend">();
    const serviceIdToDayCount = new Map<string, number>(); // Count actual service days per service_id
    
    // Check if exception_type column exists
    const hasExceptionType = calendarDatesHeaders.includes("exception_type");
    
    for (let i = 1; i < calendarDatesLines.length; i += 1) {
      const values = parseCsvLine(calendarDatesLines[i]);
      const row = calendarDatesHeaders.reduce<Record<string, string>>(
        (obj, header, index) => {
          obj[header] = (values[index] || "").trim();
          return obj;
        },
        {},
      );
      const serviceId = row.service_id;
      const date = row.date;
      
      if (serviceId && date) {
        // Determine day type (use first occurrence or most common)
        if (!serviceIdToDayType.has(serviceId)) {
          serviceIdToDayType.set(serviceId, isWeekend(date) ? "weekend" : "weekday");
        }
        
        // Count actual service days
        if (hasExceptionType) {
          const exceptionType = row.exception_type;
          // exception_type: 1 = service added, 2 = service removed
          if (exceptionType === "1") {
            const currentCount = serviceIdToDayCount.get(serviceId) || 0;
            serviceIdToDayCount.set(serviceId, currentCount + 1);
          } else if (exceptionType === "2") {
            // Service removed - subtract if it was previously counted
            const currentCount = serviceIdToDayCount.get(serviceId) || 0;
            serviceIdToDayCount.set(serviceId, Math.max(0, currentCount - 1));
          }
          // If exception_type is missing, don't count (might be invalid row)
        } else {
          // No exception_type column - assume all rows are service days
          const currentCount = serviceIdToDayCount.get(serviceId) || 0;
          serviceIdToDayCount.set(serviceId, currentCount + 1);
        }
      }
    }

    // Read trips.txt to map variant_id to trip_ids and service_id
    const tripsContent = await fs.readFile(tripsPath, "utf8");
    const tripsLines = tripsContent.split("\n").filter(Boolean);
    const tripsHeaders = parseCsvLine(tripsLines[0]).map((h) => h.trim());
    if (tripsHeaders[0]) {
      tripsHeaders[0] = tripsHeaders[0].replace(/^\uFEFF/, "");
    }

    // Map trip_id to variant_id, day type, and service_id
    const tripToVariant = new Map<string, string[]>();
    const tripToDayType = new Map<string, "weekday" | "weekend">();
    const tripToServiceId = new Map<string, string>();
    for (let i = 1; i < tripsLines.length; i += 1) {
      const values = parseCsvLine(tripsLines[i]);
      const trip = tripsHeaders.reduce<Record<string, string>>((obj, header, index) => {
        obj[header] = (values[index] || "").trim();
        return obj;
      }, {});

      const routeId = trip.route_id;
      const directionId = trip.direction_id
        ? Number.parseInt(trip.direction_id, 10)
        : 0;
      const routeVariant = trip.route_variant || "";
      const serviceId = trip.service_id || "";

      // Store service_id
      if (serviceId) {
        tripToServiceId.set(trip.trip_id, serviceId);
      }

      // Determine day type
      if (serviceId) {
        const dayType = serviceIdToDayType.get(serviceId);
        if (dayType) {
          tripToDayType.set(trip.trip_id, dayType);
        }
      }

      // Find matching variants
      variantLookup.forEach((info, variantId) => {
        if (
          info.route_id === routeId &&
          info.direction_id === directionId &&
          (routeVariant === "" || info.route_variant === routeVariant)
        ) {
          if (!tripToVariant.has(trip.trip_id)) {
            tripToVariant.set(trip.trip_id, []);
          }
          tripToVariant.get(trip.trip_id)!.push(variantId);
          info.trip_ids.push(trip.trip_id);
        }
      });
    }

    // Process stop_times.txt to get departure times for each trip
    const variantTripTimes = new Map<string, number[]>(); // variant_id -> departure_times[]
    const variantTripTimesWeekday = new Map<string, number[]>(); // variant_id -> weekday departure_times[]
    const variantTripTimesWeekend = new Map<string, number[]>(); // variant_id -> weekend departure_times[]
    const variantTripDetails = new Map<
      string,
      Array<{
        tripId: string;
        departureTime: number;
        dayType: "weekday" | "weekend" | "unknown";
        serviceId: string;
      }>
    >(); // variant_id -> trip details

    const stream = createReadStream(stopTimesPath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let headers: string[] = [];
    let isHeader = true;

    for await (const line of rl) {
      if (!line) continue;
      if (isHeader) {
        headers = parseCsvLine(line).map((h) => h.trim());
        if (headers[0]) {
          headers[0] = headers[0].replace(/^\uFEFF/, "");
        }
        isHeader = false;
        continue;
      }

      const values = parseCsvLine(line);
      const row = headers.reduce<Record<string, string>>((acc, header, idx) => {
        acc[header] = (values[idx] || "").trim();
        return acc;
      }, {});

      const tripId = row.trip_id;
      if (!tripId) continue;

      const variantIds = tripToVariant.get(tripId);
      if (!variantIds || variantIds.length === 0) continue;

      const dayType = tripToDayType.get(tripId) || "unknown";

      // Get first stop departure time
      const stopSequence = Number.parseInt(row.stop_sequence || "0", 10);
      if (stopSequence !== 1) continue; // Only process first stop

      const departureTime = parseTimeToSeconds(
        row.departure_time || row.arrival_time,
      );
      if (departureTime === null) continue;

      // Get service_id from stored map
      const serviceId = tripToServiceId.get(tripId) || "";

      variantIds.forEach((variantId) => {
        // All trips
        if (!variantTripTimes.has(variantId)) {
          variantTripTimes.set(variantId, []);
        }
        variantTripTimes.get(variantId)!.push(departureTime);

        // Store trip details
        if (!variantTripDetails.has(variantId)) {
          variantTripDetails.set(variantId, []);
        }
        variantTripDetails.get(variantId)!.push({
          tripId,
          departureTime,
          dayType: (dayType as "weekday" | "weekend" | "unknown") || "unknown",
          serviceId,
        });

        // Weekday trips
        if (dayType === "weekday") {
          if (!variantTripTimesWeekday.has(variantId)) {
            variantTripTimesWeekday.set(variantId, []);
          }
          variantTripTimesWeekday.get(variantId)!.push(departureTime);
        }

        // Weekend trips
        if (dayType === "weekend") {
          if (!variantTripTimesWeekend.has(variantId)) {
            variantTripTimesWeekend.set(variantId, []);
          }
          variantTripTimesWeekend.get(variantId)!.push(departureTime);
        }
      });
    }

    // Calculate frequency data for each variant
    const frequencyResults: FrequencyData[] = [];

    variantLookup.forEach((info, variantId) => {
      const tripTimes = variantTripTimes.get(variantId) || [];
      const tripTimesWeekday = variantTripTimesWeekday.get(variantId) || [];
      const tripTimesWeekend = variantTripTimesWeekend.get(variantId) || [];

      if (tripTimes.length === 0) return;

      // Sort trip times
      tripTimes.sort((a, b) => a - b);
      tripTimesWeekday.sort((a, b) => a - b);
      tripTimesWeekend.sort((a, b) => a - b);

      // Calculate hourly frequency (0-23 hours) - all days
      const hourlyFrequency = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        trips: 0,
      }));

      tripTimes.forEach((timeSeconds) => {
        const hour = secondsToHour(timeSeconds);
        if (hour >= 0 && hour < 24) {
          hourlyFrequency[hour].trips += 1;
        }
      });

      // Calculate hourly frequency - weekday
      const hourlyFrequencyWeekday = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        trips: 0,
      }));

      tripTimesWeekday.forEach((timeSeconds) => {
        const hour = secondsToHour(timeSeconds);
        if (hour >= 0 && hour < 24) {
          hourlyFrequencyWeekday[hour].trips += 1;
        }
      });

      // Calculate hourly frequency - weekend
      const hourlyFrequencyWeekend = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        trips: 0,
      }));

      tripTimesWeekend.forEach((timeSeconds) => {
        const hour = secondsToHour(timeSeconds);
        if (hour >= 0 && hour < 24) {
          hourlyFrequencyWeekend[hour].trips += 1;
        }
      });

      // Calculate headways (time between consecutive trips)
      const headways: number[] = [];
      for (let i = 1; i < tripTimes.length; i += 1) {
        const headway = tripTimes[i] - tripTimes[i - 1];
        if (headway > 0) {
          headways.push(headway / 60); // Convert to minutes
        }
      }

      // Find peak hour - all days
      let peakHour = 0;
      let peakFrequency = 0;
      hourlyFrequency.forEach((data) => {
        if (data.trips > peakFrequency) {
          peakFrequency = data.trips;
          peakHour = data.hour;
        }
      });

      // Find peak hour - weekday
      let peakHourWeekday = 0;
      let peakFrequencyWeekday = 0;
      hourlyFrequencyWeekday.forEach((data) => {
        if (data.trips > peakFrequencyWeekday) {
          peakFrequencyWeekday = data.trips;
          peakHourWeekday = data.hour;
        }
      });

      // Find peak hour - weekend
      let peakHourWeekend = 0;
      let peakFrequencyWeekend = 0;
      hourlyFrequencyWeekend.forEach((data) => {
        if (data.trips > peakFrequencyWeekend) {
          peakFrequencyWeekend = data.trips;
          peakHourWeekend = data.hour;
        }
      });

      // Calculate statistics
      const totalTrips = tripTimes.length;
      const totalTripsWeekday = tripTimesWeekday.length;
      const totalTripsWeekend = tripTimesWeekend.length;
      const averageHeadway =
        headways.length > 0
          ? headways.reduce((sum, h) => sum + h, 0) / headways.length
          : 0;
      const minHeadway = headways.length > 0 ? Math.min(...headways) : 0;
      const maxHeadway = headways.length > 0 ? Math.max(...headways) : 0;

      // Process trip details - group by departure time and count occurrences
      const tripDetailsRaw = variantTripDetails.get(variantId) || [];
      
      // Group trips by departure time (rounded to nearest minute for grouping)
      const tripsByTime = new Map<
        number,
        {
          departureTime: number;
          dayTypes: Set<"weekday" | "weekend" | "unknown">;
          serviceIds: Set<string>;
          tripIds: string[];
        }
      >();

      tripDetailsRaw.forEach((detail) => {
        // Round to nearest minute for grouping
        const timeKey = Math.floor(detail.departureTime / 60) * 60;
        if (!tripsByTime.has(timeKey)) {
          tripsByTime.set(timeKey, {
            departureTime: detail.departureTime,
            dayTypes: new Set(),
            serviceIds: new Set(),
            tripIds: [],
          });
        }
        const group = tripsByTime.get(timeKey)!;
        group.dayTypes.add(detail.dayType);
        group.serviceIds.add(detail.serviceId);
        group.tripIds.push(detail.tripId);
      });

      // Get first and last stop names for this variant
      const stops = variantStops[variantId] || [];
      const sortedStops = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
      const firstStop = sortedStops[0];
      const lastStop = sortedStops[sortedStops.length - 1];
      const firstStopName = firstStop?.stop_name || "";
      const lastStopName = lastStop?.stop_name || "";

      // Convert to trip details array
      const tripDetails: TripDetail[] = Array.from(tripsByTime.values())
        .map((group) => {
          // Count actual service days for each service_id
          let totalDays = 0;
          let weekdayDays = 0;
          let weekendDays = 0;
          
          group.serviceIds.forEach((serviceId) => {
            const dayCount = serviceIdToDayCount.get(serviceId) || 0;
            const dayType = serviceIdToDayType.get(serviceId);
            
            totalDays += dayCount;
            
            if (dayType === "weekday") {
              weekdayDays += dayCount;
            } else if (dayType === "weekend") {
              weekendDays += dayCount;
            }
          });
          
          // Use actual day count instead of formula
          const timesPerWeek = totalDays;

          // Determine primary day type based on actual days
          let primaryDayType: "weekday" | "weekend" | "unknown" = "unknown";
          if (weekdayDays > 0 && weekendDays === 0) {
            primaryDayType = "weekday";
          } else if (weekendDays > 0 && weekdayDays === 0) {
            primaryDayType = "weekend";
          } else if (weekdayDays > weekendDays) {
            primaryDayType = "weekday";
          } else if (weekendDays > weekdayDays) {
            primaryDayType = "weekend";
          }

          return {
            tripId: group.tripIds[0], // Use first trip ID as representative
            departureTime: group.departureTime,
            departureTimeFormatted: formatTime(group.departureTime),
            dayType: primaryDayType,
            serviceId: Array.from(group.serviceIds)[0] || "",
            timesPerWeek,
            firstStopName,
          };
        })
        .sort((a, b) => a.departureTime - b.departureTime);

      const route = routeById.get(info.route_id);

      frequencyResults.push({
        variant_id: variantId,
        route_short_name: info.route_short_name,
        route_variant: info.route_variant,
        route_long_name: route?.route_long_name || "",
        route_type: String(route?.route_type || ""),
        direction_id: info.direction_id,
        startStopName: firstStopName,
        endStopName: lastStopName,
        hourlyFrequency,
        hourlyFrequencyWeekday,
        hourlyFrequencyWeekend,
        headways,
        totalTrips,
        totalTripsWeekday,
        totalTripsWeekend,
        peakHour,
        peakFrequency,
        peakHourWeekday,
        peakFrequencyWeekday,
        peakHourWeekend,
        peakFrequencyWeekend,
        averageHeadway: Math.round(averageHeadway * 10) / 10,
        minHeadway: Math.round(minHeadway * 10) / 10,
        maxHeadway: Math.round(maxHeadway * 10) / 10,
        tripDetails,
      });
    });

    // Sort results
    frequencyResults.sort((a, b) => {
      const typeA = a.route_type;
      const typeB = b.route_type;
      if (typeA !== typeB) return typeA.localeCompare(typeB);
      if (a.route_short_name !== b.route_short_name) {
        return a.route_short_name.localeCompare(b.route_short_name);
      }
      if (a.route_variant !== b.route_variant) {
        return a.route_variant.localeCompare(b.route_variant);
      }
      return a.direction_id - b.direction_id;
    });

    return NextResponse.json({ results: frequencyResults });
  } catch (error) {
    console.error("Error calculating frequency:", error);
    return NextResponse.json(
      { error: "Failed to calculate frequency" },
      { status: 500 },
    );
  }
}
