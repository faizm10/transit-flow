"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

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
  tripDetails: TripDetail[];
};

type FrequencyResponse = {
  results: FrequencyData[];
};

type RouteAggregate = {
  route_short_name: string;
  route_long_name: string;
  route_type: string;
  hourlyFrequency: Array<{ hour: number; trips: number; hourLabel: string }>;
  hourlyFrequencyWeekday: Array<{ hour: number; trips: number; hourLabel: string }>;
  hourlyFrequencyWeekend: Array<{ hour: number; trips: number; hourLabel: string }>;
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
  variantDetails: Array<{
    variant_id: string;
    route_variant: string;
    direction_id: number;
    startStopName: string;
    endStopName: string;
    tripDetails: TripDetail[];
  }>;
};

function formatRouteType(value: string) {
  return value === "2" ? "Train" : "Bus";
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function FrequencyPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<FrequencyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedDayType, setSelectedDayType] = useState<"all" | "weekday" | "weekend">("all");

  // Update URL when filters change
  const updateFilters = (
    route: string,
    type: string,
    dayType: "all" | "weekday" | "weekend",
  ) => {
    const params = new URLSearchParams();
    if (route && route !== "all") params.set("route", route);
    if (type && type !== "all") params.set("type", type);
    if (dayType && dayType !== "all") params.set("dayType", dayType);

    const queryString = params.toString();
    const newUrl = queryString ? `/frequency?${queryString}` : "/frequency";
    router.push(newUrl, { scroll: false });
  };

  const handleRouteChange = (route: string) => {
    setSelectedRoute(route);
    updateFilters(route, selectedType, selectedDayType);
  };

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    updateFilters(selectedRoute, type, selectedDayType);
  };

  const handleDayTypeChange = (dayType: "all" | "weekday" | "weekend") => {
    setSelectedDayType(dayType);
    updateFilters(selectedRoute, selectedType, dayType);
  };
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());

  // Sync state with URL params when they change (e.g., browser back/forward)
  useEffect(() => {
    const routeParam = searchParams.get("route") || "all";
    const typeParam = searchParams.get("type") || "all";
    const dayTypeParam = (searchParams.get("dayType") || "all") as "all" | "weekday" | "weekend";

    if (routeParam !== selectedRoute) setSelectedRoute(routeParam);
    if (typeParam !== selectedType) setSelectedType(typeParam);
    if (dayTypeParam !== selectedDayType && ["all", "weekday", "weekend"].includes(dayTypeParam)) {
      setSelectedDayType(dayTypeParam);
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/gotransit/frequency");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const payload = (await response.json()) as FrequencyResponse;
        const results = payload.results || [];
        console.log("Loaded frequency data:", results.length, "variants");
        setData(results);
      } catch (error) {
        console.error("Failed to load frequency data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Group data by route instead of variant
  const routesByLine = useMemo(() => {
    const routeMap = new Map<string, RouteAggregate>();

    data.forEach((item) => {
      const key = item.route_short_name;
      
      if (!routeMap.has(key)) {
        routeMap.set(key, {
          route_short_name: item.route_short_name,
          route_long_name: item.route_long_name,
          route_type: item.route_type,
          hourlyFrequency: Array.from({ length: 24 }, (_, hour) => ({
            hour,
            trips: 0,
            hourLabel: formatHour(hour),
          })),
          hourlyFrequencyWeekday: Array.from({ length: 24 }, (_, hour) => ({
            hour,
            trips: 0,
            hourLabel: formatHour(hour),
          })),
          hourlyFrequencyWeekend: Array.from({ length: 24 }, (_, hour) => ({
            hour,
            trips: 0,
            hourLabel: formatHour(hour),
          })),
          headways: [],
          totalTrips: 0,
          totalTripsWeekday: 0,
          totalTripsWeekend: 0,
          peakHour: 0,
          peakFrequency: 0,
          peakHourWeekday: 0,
          peakFrequencyWeekday: 0,
          peakHourWeekend: 0,
          peakFrequencyWeekend: 0,
          averageHeadway: 0,
          minHeadway: Infinity,
          maxHeadway: 0,
          variantDetails: [],
        });
      }

      const route = routeMap.get(key)!;
      
      // Store variant details for later use
      route.variantDetails.push({
        variant_id: item.variant_id,
        route_variant: item.route_variant,
        direction_id: item.direction_id,
        startStopName: item.startStopName || "",
        endStopName: item.endStopName || "",
        tripDetails: item.tripDetails || [],
      });
      
      // Aggregate hourly frequency - all days
      if (item.hourlyFrequency && Array.isArray(item.hourlyFrequency)) {
        item.hourlyFrequency.forEach((freq) => {
          if (freq.hour >= 0 && freq.hour < 24 && freq.trips > 0) {
            route.hourlyFrequency[freq.hour].trips += freq.trips;
          }
        });
      }

      // Aggregate hourly frequency - weekday
      if (item.hourlyFrequencyWeekday && Array.isArray(item.hourlyFrequencyWeekday)) {
        item.hourlyFrequencyWeekday.forEach((freq) => {
          if (freq.hour >= 0 && freq.hour < 24 && freq.trips > 0) {
            route.hourlyFrequencyWeekday[freq.hour].trips += freq.trips;
          }
        });
      }

      // Aggregate hourly frequency - weekend
      if (item.hourlyFrequencyWeekend && Array.isArray(item.hourlyFrequencyWeekend)) {
        item.hourlyFrequencyWeekend.forEach((freq) => {
          if (freq.hour >= 0 && freq.hour < 24 && freq.trips > 0) {
            route.hourlyFrequencyWeekend[freq.hour].trips += freq.trips;
          }
        });
      }

      // Aggregate headways - only valid positive headways
      if (item.headways && Array.isArray(item.headways)) {
        item.headways.forEach((headway) => {
          if (headway > 0 && headway < 10000) { // Filter out invalid headways
            route.headways.push(headway);
          }
        });
      }

      // Aggregate total trips
      route.totalTrips += item.totalTrips || 0;
      route.totalTripsWeekday += item.totalTripsWeekday || 0;
      route.totalTripsWeekend += item.totalTripsWeekend || 0;
    });

    // Calculate stats for each route
    routeMap.forEach((route) => {
      // Find peak hour - all days
      let peakHour = 0;
      let peakFrequency = 0;
      route.hourlyFrequency.forEach((freq) => {
        if (freq.trips > peakFrequency) {
          peakFrequency = freq.trips;
          peakHour = freq.hour;
        }
      });
      route.peakHour = peakHour;
      route.peakFrequency = peakFrequency;

      // Find peak hour - weekday
      let peakHourWeekday = 0;
      let peakFrequencyWeekday = 0;
      route.hourlyFrequencyWeekday.forEach((freq) => {
        if (freq.trips > peakFrequencyWeekday) {
          peakFrequencyWeekday = freq.trips;
          peakHourWeekday = freq.hour;
        }
      });
      route.peakHourWeekday = peakHourWeekday;
      route.peakFrequencyWeekday = peakFrequencyWeekday;

      // Find peak hour - weekend
      let peakHourWeekend = 0;
      let peakFrequencyWeekend = 0;
      route.hourlyFrequencyWeekend.forEach((freq) => {
        if (freq.trips > peakFrequencyWeekend) {
          peakFrequencyWeekend = freq.trips;
          peakHourWeekend = freq.hour;
        }
      });
      route.peakHourWeekend = peakHourWeekend;
      route.peakFrequencyWeekend = peakFrequencyWeekend;

      // Calculate headway stats - properly average
      if (route.headways.length > 0) {
        const validHeadways = route.headways.filter((h) => h > 0 && h < 10000);
        if (validHeadways.length > 0) {
          route.averageHeadway =
            validHeadways.reduce((sum, h) => sum + h, 0) / validHeadways.length;
          route.minHeadway = Math.min(...validHeadways);
          route.maxHeadway = Math.max(...validHeadways);
        } else {
          route.minHeadway = 0;
          route.averageHeadway = 0;
        }
      } else {
        route.minHeadway = 0;
      }
    });

    return Array.from(routeMap.values());
  }, [data]);

  const routes = useMemo(() => {
    const routeSet = new Set<string>();
    routesByLine.forEach((route) => routeSet.add(route.route_short_name));
    return Array.from(routeSet).sort();
  }, [routesByLine]);

  const filteredRoutes = useMemo(() => {
    return routesByLine.filter((route) => {
      if (selectedType !== "all" && route.route_type !== selectedType) {
        return false;
      }
      if (selectedRoute !== "all" && route.route_short_name !== selectedRoute) {
        return false;
      }
      return true;
    });
  }, [routesByLine, selectedType, selectedRoute]);

  const overallStats = useMemo(() => {
    if (filteredRoutes.length === 0) {
      return {
        totalTrips: 0,
        averageFrequency: 0,
        peakHour: 0,
        peakFrequency: 0,
        averageHeadway: 0,
      };
    }

    const totalTrips = filteredRoutes.reduce(
      (sum, route) => sum + route.totalTrips,
      0,
    );

    // Aggregate hourly frequency across all routes
    const hourlyAggregate = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      trips: 0,
    }));

    filteredRoutes.forEach((route) => {
      route.hourlyFrequency.forEach((freq) => {
        hourlyAggregate[freq.hour].trips += freq.trips;
      });
    });

    // Find peak hour
    let peakHour = 0;
    let peakFrequency = 0;
    hourlyAggregate.forEach((data) => {
      if (data.trips > peakFrequency) {
        peakFrequency = data.trips;
        peakHour = data.hour;
      }
    });

    // Aggregate hourly frequency - weekday
    const hourlyAggregateWeekday = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      trips: 0,
    }));

    filteredRoutes.forEach((route) => {
      route.hourlyFrequencyWeekday.forEach((freq) => {
        hourlyAggregateWeekday[freq.hour].trips += freq.trips;
      });
    });

    // Aggregate hourly frequency - weekend
    const hourlyAggregateWeekend = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      trips: 0,
    }));

    filteredRoutes.forEach((route) => {
      route.hourlyFrequencyWeekend.forEach((freq) => {
        hourlyAggregateWeekend[freq.hour].trips += freq.trips;
      });
    });

    // Find peak hour - weekday
    let peakHourWeekday = 0;
    let peakFrequencyWeekday = 0;
    hourlyAggregateWeekday.forEach((data) => {
      if (data.trips > peakFrequencyWeekday) {
        peakFrequencyWeekday = data.trips;
        peakHourWeekday = data.hour;
      }
    });

    // Find peak hour - weekend
    let peakHourWeekend = 0;
    let peakFrequencyWeekend = 0;
    hourlyAggregateWeekend.forEach((data) => {
      if (data.trips > peakFrequencyWeekend) {
        peakFrequencyWeekend = data.trips;
        peakHourWeekend = data.hour;
      }
    });

    // Calculate average headway - properly weighted average
    const allHeadways = filteredRoutes.flatMap((route) => route.headways).filter((h) => h > 0 && h < 10000);
    const averageHeadway =
      allHeadways.length > 0
        ? allHeadways.reduce((sum, h) => sum + h, 0) / allHeadways.length
        : 0;

    // Calculate average frequency - sum of all trips divided by 24 hours
    const totalTripsInDay = hourlyAggregate.reduce((sum, h) => sum + h.trips, 0);
    const averageFrequency = totalTripsInDay / 24;
    const totalTripsWeekdayInDay = hourlyAggregateWeekday.reduce((sum, h) => sum + h.trips, 0);
    const averageFrequencyWeekday = totalTripsWeekdayInDay / 24;
    const totalTripsWeekendInDay = hourlyAggregateWeekend.reduce((sum, h) => sum + h.trips, 0);
    const averageFrequencyWeekend = totalTripsWeekendInDay / 24;

    const totalTripsWeekday = filteredRoutes.reduce(
      (sum, route) => sum + route.totalTripsWeekday,
      0,
    );
    const totalTripsWeekend = filteredRoutes.reduce(
      (sum, route) => sum + route.totalTripsWeekend,
      0,
    );

    return {
      totalTrips,
      totalTripsWeekday,
      totalTripsWeekend,
      averageFrequency: Math.round(averageFrequency * 10) / 10,
      averageFrequencyWeekday: Math.round(averageFrequencyWeekday * 10) / 10,
      averageFrequencyWeekend: Math.round(averageFrequencyWeekend * 10) / 10,
      peakHour,
      peakFrequency,
      peakHourWeekday,
      peakFrequencyWeekday,
      peakHourWeekend,
      peakFrequencyWeekend,
      averageHeadway: Math.round(averageHeadway * 10) / 10,
    };
  }, [filteredRoutes]);

  return (
    <div className="bg-background w-full min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-10">
        <Section className="mb-6">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              TransitFlow Frequency Analysis
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Service Frequency & Headways
            </h1>
            <p className="text-muted-foreground text-sm leading-6">
              Analyze trip frequency, headways, and service patterns for GO
              Transit routes.
            </p>
            <div className="rounded-lg border border-dashed border-blue-500/30 bg-blue-500/5 p-3 mt-3">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
                ℹ️ Frequency Calculation
              </p>
              <p className="text-xs text-muted-foreground leading-5">
                Frequency is now separated by <strong>weekday</strong> (Monday-Friday) and <strong>weekend</strong> (Saturday-Sunday). 
                Use the "Day Type" filter to view specific periods, or "All Days" to see combined totals across all service days, variants, and directions.
              </p>
            </div>
          </div>
        </Section>

        {/* Legend/Definitions */}
        <Section className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-semibold">Key Metrics Explained</h2>
            <span className="text-xs text-muted-foreground">•</span>
            <p className="text-xs text-muted-foreground">
              Understanding transit service metrics
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-dashed p-3 bg-muted/30">
              <p className="text-sm font-semibold mb-1.5">Frequency</p>
              <p className="text-xs text-muted-foreground leading-5">
                Number of trips per hour. Higher = more frequent service.
                <span className="block mt-1.5 font-medium text-foreground">
                  Example: 4 trips/hr = every 15 min
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-dashed p-3 bg-muted/30">
              <p className="text-sm font-semibold mb-1.5">Headway</p>
              <p className="text-xs text-muted-foreground leading-5">
                Time between consecutive trips. Lower = more frequent service.
                <span className="block mt-1.5 font-medium text-foreground">
                  Example: 10 min headway = every 10 min
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-dashed p-3 bg-muted/30">
              <p className="text-sm font-semibold mb-1.5">Peak Hour</p>
              <p className="text-xs text-muted-foreground leading-5">
                Hour with the most trips. Usually corresponds to rush hour when
                demand is highest.
                <span className="block mt-1.5 font-medium text-foreground">
                  Example: 4 PM with 375 trips
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-dashed p-3 bg-muted/30">
              <p className="text-sm font-semibold mb-1.5">Total Trips</p>
              <p className="text-xs text-muted-foreground leading-5">
                Total scheduled trips for the route across all directions
                throughout the service day.
                <span className="block mt-1.5 font-medium text-foreground">
                  Example: 3,822 trips/day
                </span>
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-dashed">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium mb-1">Average Headway</p>
                <p className="text-xs text-muted-foreground">
                  Mean time between trips. Calculated from all headways
                  throughout the day.
                </p>
              </div>
              <div>
                <p className="text-xs font-medium mb-1">Min/Max Headway</p>
                <p className="text-xs text-muted-foreground">
                  Shortest and longest gaps between trips. Shows service
                  consistency.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* Filters */}
        <Section className="mb-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs uppercase text-muted-foreground mb-2 block">
                Route Type
              </label>
              <select
                value={selectedType}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full rounded-lg border border-dashed bg-background px-3 py-2 text-sm"
              >
                <option value="all">All Types</option>
                <option value="2">Trains</option>
                <option value="3">Buses</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground mb-2 block">
                Route
              </label>
              <select
                value={selectedRoute}
                onChange={(e) => handleRouteChange(e.target.value)}
                className="w-full rounded-lg border border-dashed bg-background px-3 py-2 text-sm"
              >
                <option value="all">All Routes</option>
                {routes.map((route) => (
                  <option key={route} value={route}>
                    {route}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground mb-2 block">
                Day Type
              </label>
              <select
                value={selectedDayType}
                onChange={(e) =>
                  handleDayTypeChange(
                    e.target.value as "all" | "weekday" | "weekend",
                  )
                }
                className="w-full rounded-lg border border-dashed bg-background px-3 py-2 text-sm"
              >
                <option value="all">All Days</option>
                <option value="weekday">Weekday Only</option>
                <option value="weekend">Weekend Only</option>
              </select>
            </div>
          </div>
        </Section>

        {/* Summary Stats */}
        <Section className="mb-6">
          {selectedDayType === "all" ? (
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Total Trips
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {overallStats.totalTrips.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Weekday: {overallStats.totalTripsWeekday?.toLocaleString() || "0"} • Weekend: {overallStats.totalTripsWeekend?.toLocaleString() || "0"}
                </p>
              </div>
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Avg Frequency
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {overallStats.averageFrequency.toFixed(1)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    /hr
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Wkday: {overallStats.averageFrequencyWeekday?.toFixed(1) || "0"}/hr • Wkend: {overallStats.averageFrequencyWeekend?.toFixed(1) || "0"}/hr
                </p>
              </div>
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Peak Hour
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {formatHour(overallStats.peakHour)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {overallStats.peakFrequency} trips
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Wkday: {formatHour(overallStats.peakHourWeekday || 0)} ({overallStats.peakFrequencyWeekday || 0}) • Wkend: {formatHour(overallStats.peakHourWeekend || 0)} ({overallStats.peakFrequencyWeekend || 0})
                </p>
              </div>
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Avg Headway
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {overallStats.averageHeadway.toFixed(1)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    min
                  </span>
                </p>
              </div>
            </div>
          ) : selectedDayType === "weekday" ? (
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Total Trips (Weekday)
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {(overallStats.totalTripsWeekday || 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Avg Frequency
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {(overallStats.averageFrequencyWeekday || 0).toFixed(1)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    /hr
                  </span>
                </p>
              </div>
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Peak Hour
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {formatHour(overallStats.peakHourWeekday || 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {overallStats.peakFrequencyWeekday || 0} trips
                </p>
              </div>
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Avg Headway
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {overallStats.averageHeadway.toFixed(1)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    min
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Total Trips (Weekend)
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {(overallStats.totalTripsWeekend || 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Avg Frequency
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {(overallStats.averageFrequencyWeekend || 0).toFixed(1)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    /hr
                  </span>
                </p>
              </div>
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Peak Hour
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {formatHour(overallStats.peakHourWeekend || 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {overallStats.peakFrequencyWeekend || 0} trips
                </p>
              </div>
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Avg Headway
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {overallStats.averageHeadway.toFixed(1)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    min
                  </span>
                </p>
              </div>
            </div>
          )}
        </Section>

        {isLoading && (
          <Section>
            <div className="text-sm text-muted-foreground">
              Loading frequency data...
            </div>
          </Section>
        )}

        {!isLoading && filteredRoutes.length === 0 && (
          <Section>
            <div className="text-sm text-muted-foreground">
              No data found for selected filters.
            </div>
          </Section>
        )}

        {!isLoading && filteredRoutes.length > 0 && (
          <>
            {/* Overall Hourly Frequency Chart */}
            <Section className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">
                  Overall Hourly Trip Frequency
                </h2>
                <p className="text-xs text-muted-foreground">
                  {selectedDayType === "weekday"
                    ? "Weekday only"
                    : selectedDayType === "weekend"
                      ? "Weekend only"
                      : "All service days"}
                </p>
              </div>
              <div style={{ width: "100%", height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={Array.from({ length: 24 }, (_, hour) => {
                      const trips = filteredRoutes.reduce((sum, route) => {
                        if (selectedDayType === "weekday") {
                          return sum + (route.hourlyFrequencyWeekday[hour]?.trips || 0);
                        } else if (selectedDayType === "weekend") {
                          return sum + (route.hourlyFrequencyWeekend[hour]?.trips || 0);
                        } else {
                          return sum + (route.hourlyFrequency[hour]?.trips || 0);
                        }
                      }, 0);
                      return {
                        hour,
                        hourLabel: formatHour(hour),
                        trips: Math.max(0, trips || 0),
                      };
                    })}
                    margin={{ top: 5, right: 10, left: 0, bottom: 60 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="hourLabel"
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px dashed hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number | undefined) => [`${value || 0} trips`, "Frequency"]}
                    />
                    <Bar
                      dataKey="trips"
                      fill="hsl(var(--foreground))"
                      radius={[4, 4, 0, 0]}
                    >
                      {Array.from({ length: 24 }, (_, hour) => {
                        const peakHour =
                          selectedDayType === "weekday"
                            ? overallStats.peakHourWeekday || 0
                            : selectedDayType === "weekend"
                              ? overallStats.peakHourWeekend || 0
                              : overallStats.peakHour;
                        return (
                          <Cell
                            key={`cell-${hour}`}
                            fill={
                              hour === peakHour
                                ? "hsl(142 76% 36%)"
                                : "hsl(var(--foreground))"
                            }
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>

            {/* Route Details */}
            <Section>
              <h2 className="text-base font-semibold mb-4">
                Route Details ({filteredRoutes.length})
              </h2>
              <div className="space-y-4">
                {filteredRoutes.map((route) => (
                  <div
                    key={route.route_short_name}
                    className="rounded-xl border border-dashed p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {formatRouteType(route.route_type)} • Route{" "}
                          {route.route_short_name}
                        </p>
                        <h3 className="text-lg font-semibold">
                          {route.route_short_name}
                        </h3>
                        {route.route_long_name && (
                          <p className="text-sm text-muted-foreground">
                            {route.route_long_name}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {selectedDayType === "weekday"
                            ? (route.totalTripsWeekday || 0).toLocaleString()
                            : selectedDayType === "weekend"
                              ? (route.totalTripsWeekend || 0).toLocaleString()
                              : route.totalTrips.toLocaleString()}{" "}
                          trips
                        </p>
                        {selectedDayType === "all" && (
                          <p className="text-xs text-muted-foreground">
                            Wkday: {(route.totalTripsWeekday || 0).toLocaleString()} • Wkend: {(route.totalTripsWeekend || 0).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-4 mb-4">
                      <div className="rounded-lg border border-dashed p-3">
                        <p className="text-xs uppercase text-muted-foreground">
                          Peak Hour
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {selectedDayType === "weekday"
                            ? formatHour(route.peakHourWeekday || 0)
                            : selectedDayType === "weekend"
                              ? formatHour(route.peakHourWeekend || 0)
                              : formatHour(route.peakHour)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedDayType === "weekday"
                            ? route.peakFrequencyWeekday || 0
                            : selectedDayType === "weekend"
                              ? route.peakFrequencyWeekend || 0
                              : route.peakFrequency}{" "}
                          trips
                        </p>
                        {selectedDayType === "all" && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Wkday: {formatHour(route.peakHourWeekday || 0)} ({route.peakFrequencyWeekday || 0}) • Wkend: {formatHour(route.peakHourWeekend || 0)} ({route.peakFrequencyWeekend || 0})
                          </p>
                        )}
                      </div>
                      <div className="rounded-lg border border-dashed p-3">
                        <p className="text-xs uppercase text-muted-foreground">
                          Avg Headway
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {Math.round(route.averageHeadway * 10) / 10} min
                        </p>
                      </div>
                      <div className="rounded-lg border border-dashed p-3">
                        <p className="text-xs uppercase text-muted-foreground">
                          Min Headway
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {Math.round(route.minHeadway * 10) / 10} min
                        </p>
                      </div>
                      <div className="rounded-lg border border-dashed p-3">
                        <p className="text-xs uppercase text-muted-foreground">
                          Max Headway
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {Math.round(route.maxHeadway * 10) / 10} min
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs uppercase text-muted-foreground mb-2">
                        Hourly Frequency
                        {selectedDayType === "weekday"
                          ? " (Weekday)"
                          : selectedDayType === "weekend"
                            ? " (Weekend)"
                            : " (All Days)"}
                      </p>
                      {(() => {
                        const chartData =
                          selectedDayType === "weekday"
                            ? route.hourlyFrequencyWeekday
                            : selectedDayType === "weekend"
                              ? route.hourlyFrequencyWeekend
                              : route.hourlyFrequency;
                        return chartData.some((f) => f.trips > 0) ? (
                          <div style={{ width: "100%", height: "200px" }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={chartData.map((f) => ({
                                  hour: f.hour,
                                  hourLabel: f.hourLabel,
                                  trips: f.trips || 0,
                                }))}
                                margin={{ top: 5, right: 10, left: 0, bottom: 40 }}
                              >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="hsl(var(--border))"
                              />
                              <XAxis
                                dataKey="hourLabel"
                                tick={{ fontSize: 10 }}
                                stroke="hsl(var(--muted-foreground))"
                                angle={-45}
                                textAnchor="end"
                                height={50}
                              />
                              <YAxis
                                tick={{ fontSize: 10 }}
                                stroke="hsl(var(--muted-foreground))"
                                allowDecimals={false}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: "hsl(var(--background))",
                                  border: "1px dashed hsl(var(--border))",
                                  borderRadius: "8px",
                                }}
                                labelFormatter={(value) => `Hour: ${value}`}
                                formatter={(value: number | undefined) => [
                                  `${value || 0} trips (sum across all service days, variants, and directions)`,
                                  "Frequency",
                                ]}
                              />
                              <Line
                                type="monotone"
                                dataKey="trips"
                                stroke="hsl(var(--foreground))"
                                strokeWidth={2}
                                dot={{ r: 3, fill: "hsl(var(--foreground))" }}
                                activeDot={{ r: 5 }}
                                connectNulls={false}
                              />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground p-4 border border-dashed rounded-lg">
                            No frequency data available for this route.
                          </div>
                        );
                      })()}
                    </div>

                    {/* More Information Section */}
                    <div className="mt-4 border-t border-dashed pt-4">
                      <button
                        onClick={() => {
                          setExpandedRoutes((prev) => {
                            const next = new Set(prev);
                            if (next.has(route.route_short_name)) {
                              next.delete(route.route_short_name);
                            } else {
                              next.add(route.route_short_name);
                            }
                            return next;
                          });
                        }}
                        className="flex w-full items-center justify-between text-sm font-medium hover:text-foreground transition-colors"
                      >
                        <span>More Information</span>
                        <span className="text-muted-foreground">
                          {expandedRoutes.has(route.route_short_name) ? "▲" : "▼"}
                        </span>
                      </button>

                      {expandedRoutes.has(route.route_short_name) && (
                        <div className="mt-4 space-y-4">
                          {route.variantDetails.length > 0 ? (
                            route.variantDetails.map((variant) => {
                              // Group trip details by hour
                              const tripsByHour = new Map<
                                number,
                                TripDetail[]
                              >();

                              variant.tripDetails.forEach((trip) => {
                                const hour = Math.floor(trip.departureTime / 3600);
                                const normalizedHour = hour >= 24 ? hour - 24 : hour;
                                if (!tripsByHour.has(normalizedHour)) {
                                  tripsByHour.set(normalizedHour, []);
                                }
                                tripsByHour.get(normalizedHour)!.push(trip);
                              });

                              return (
                                <div
                                  key={variant.variant_id}
                                  className="rounded-lg border border-dashed p-3 bg-muted/20"
                                >
                                <div className="mb-3">
                                  <p className="text-xs font-semibold">
                                    {variant.route_variant || route.route_short_name}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {variant.startStopName && variant.endStopName
                                      ? `${variant.startStopName} → ${variant.endStopName}`
                                      : variant.startStopName
                                        ? `From ${variant.startStopName}`
                                        : `Direction ${variant.direction_id}`}{" "}
                                    • {variant.tripDetails.length} unique departure times
                                  </p>
                                </div>

                                  <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {Array.from(tripsByHour.entries())
                                      .sort(([a], [b]) => a - b)
                                      .map(([hour, trips]) => {
                                        // Group by exact time and count occurrences
                                        const tripsByExactTime = new Map<
                                          string,
                                          {
                                            time: string;
                                            weekdayCount: number;
                                            weekendCount: number;
                                            totalPerWeek: number;
                                            dayTypes: Set<string>;
                                            firstStopName: string;
                                          }
                                        >();

                                        trips.forEach((trip) => {
                                          const timeKey = trip.departureTimeFormatted.substring(
                                            0,
                                            5,
                                          ); // HH:MM
                                          if (!tripsByExactTime.has(timeKey)) {
                                            tripsByExactTime.set(timeKey, {
                                              time: timeKey,
                                              weekdayCount: 0,
                                              weekendCount: 0,
                                              totalPerWeek: 0,
                                              dayTypes: new Set(),
                                              firstStopName: trip.firstStopName || "",
                                            });
                                          }
                                          const group = tripsByExactTime.get(timeKey)!;
                                          if (trip.dayType === "weekday") {
                                            group.weekdayCount += 1;
                                            group.dayTypes.add("weekday");
                                          } else if (trip.dayType === "weekend") {
                                            group.weekendCount += 1;
                                            group.dayTypes.add("weekend");
                                          }
                                          // Use the maximum timesPerWeek from trips at this time
                                          if (trip.timesPerWeek > group.totalPerWeek) {
                                            group.totalPerWeek = trip.timesPerWeek;
                                          }
                                          // Store first stop name (should be same for all trips at same time)
                                          if (!group.firstStopName && trip.firstStopName) {
                                            group.firstStopName = trip.firstStopName;
                                          }
                                        });

                                        return (
                                          <div
                                            key={hour}
                                            className="rounded border border-dashed p-2 bg-background"
                                          >
                                            <p className="text-xs font-medium mb-1.5">
                                              {formatHour(hour)} ({trips.length}{" "}
                                              {trips.length === 1 ? "departure" : "departures"})
                                            </p>
                                            <div className="space-y-1">
                                              {Array.from(tripsByExactTime.values())
                                                .sort((a, b) =>
                                                  a.time.localeCompare(b.time),
                                                )
                                                .map((group, idx) => {
                                                  const hasBoth =
                                                    group.weekdayCount > 0 &&
                                                    group.weekendCount > 0;
                                                  return (
                                                    <div
                                                      key={idx}
                                                      className="text-[11px] text-muted-foreground flex items-center justify-between py-0.5"
                                                    >
                                                      <span className="flex items-center gap-1.5">
                                                        <span className="font-mono">
                                                          {group.time}
                                                        </span>
                                                        <span>•</span>
                                                        <span>
                                                          {variant.route_variant ||
                                                            route.route_short_name}
                                                        </span>
                                                        {group.firstStopName && (
                                                          <>
                                                            <span>•</span>
                                                            <span className="text-[10px]">
                                                              from {group.firstStopName}
                                                            </span>
                                                          </>
                                                        )}
                                                      </span>
                                                      <span className="ml-2 font-medium text-foreground text-[10px]">
                                                        {group.totalPerWeek > 0
                                                          ? `${group.totalPerWeek}x/week`
                                                          : hasBoth
                                                            ? `${group.weekdayCount} weekday + ${group.weekendCount} weekend`
                                                            : group.weekdayCount > 0
                                                              ? `${group.weekdayCount}x/week (weekday only)`
                                                              : group.weekendCount > 0
                                                                ? `${group.weekendCount}x/week (weekend only)`
                                                                : "1x/week"}
                                                      </span>
                                                    </div>
                                                  );
                                                })}
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg">
                              No detailed trip information available.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

export default function FrequencyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    }>
      <FrequencyPageContent />
    </Suspense>
  );
}

function Section({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "bg-background text-foreground flex min-w-0 flex-col gap-6 border border-dashed p-5 sm:p-6",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}
