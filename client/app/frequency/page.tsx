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
  daysOfWeek: number[]; // 0=Sunday, 1=Monday, ..., 6=Saturday
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

function getVariantDisplayName(variantId: string, routeVariant: string, routeType: string): string {
  if (routeType === "2" && variantId && variantId.length > 2) {
    // For trains, show just the variant suffix (e.g., "B" from "KIB")
    // Or use route_variant if available
    if (routeVariant) {
      return routeVariant;
    }
    return variantId.substring(2) || variantId;
  }
  // For buses, show route_variant if available, otherwise variant_id
  return routeVariant || variantId;
}

function formatDaysOfWeek(days: number[]): string {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const sortedDays = [...days].sort((a, b) => a - b);
  
  // Check for common patterns
  if (sortedDays.length === 5 && sortedDays[0] === 1 && sortedDays[4] === 5) {
    return "Mon-Fri";
  }
  if (sortedDays.length === 2 && sortedDays[0] === 0 && sortedDays[1] === 6) {
    return "Sat-Sun";
  }
  if (sortedDays.length === 1 && sortedDays[0] === 6) {
    return "Saturday";
  }
  if (sortedDays.length === 1 && sortedDays[0] === 0) {
    return "Sunday";
  }
  
  // Otherwise, list all days
  return sortedDays.map((d) => dayNames[d]).join(", ");
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
  const [variantStops, setVariantStops] = useState<
    Record<
      string,
      Array<{
        stop_id: string;
        stop_name: string;
        stop_lat: number | null;
        stop_lon: number | null;
        stop_sequence: number;
      }>
    >
  >({});
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
        const [frequencyResponse, variantStopsResponse] = await Promise.all([
          fetch("/api/gotransit/frequency"),
          fetch("/gotransit/derived/variant_stops.json"),
        ]);

        if (!frequencyResponse.ok) {
          throw new Error(`HTTP error! status: ${frequencyResponse.status}`);
        }
        if (!variantStopsResponse.ok) {
          throw new Error(`HTTP error! status: ${variantStopsResponse.status}`);
        }

        const payload = (await frequencyResponse.json()) as FrequencyResponse;
        const results = payload.results || [];
        console.log("Loaded frequency data:", results.length, "variants");
        setData(results);

        const stopsPayload = (await variantStopsResponse.json()) as Record<
          string,
          Array<{
            stop_id: string;
            stop_name: string;
            stop_lat: number | null;
            stop_lon: number | null;
            stop_sequence: number;
          }>
        >;
        setVariantStops(stopsPayload || {});
      } catch (error) {
        console.error("Failed to load frequency data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Helper function to extract train line code from variant_id (e.g., "KI" from "KIB")
  const getTrainLineCode = (variantId: string, routeShortName: string, routeType: string): string => {
    // For trains (route_type === "2"), extract first 2 letters from variant_id
    if (routeType === "2" && variantId && variantId.length >= 2) {
      const code = variantId.substring(0, 2).toUpperCase();
      // Validate it's a valid train line code (letters only)
      if (/^[A-Z]{2}$/.test(code)) {
        return code;
      }
    }
    // For buses or if no valid code, use route_short_name
    return routeShortName;
  };

  // Special service routes that should be displayed separately
  // Only the special variants (18L, 18R, 18M, 18N) - route 18 itself has regular service
  const specialServiceRoutes = ["18L", "18R", "18M", "18N"];

  // Group data by route code (KI, LW, LE for trains) or route_short_name (for buses)
  const routesByLine = useMemo(() => {
    const routeMap = new Map<string, RouteAggregate>();

    data.forEach((item) => {
      // For trains, group by train line code (KI, LW, LE, etc.)
      // For buses, group by route_short_name
      const key = getTrainLineCode(item.variant_id, item.route_short_name, item.route_type);
      
      if (!routeMap.has(key)) {
        // For trains, use the train line code as the display name
        // For buses, use route_short_name
        const displayName = item.route_type === "2" && key !== item.route_short_name 
          ? key 
          : item.route_short_name;
        
        routeMap.set(key, {
          route_short_name: displayName,
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
      
      // Check if this is a special service variant (18M, 18N, 18L, 18R)
      const isSpecialServiceVariant = specialServiceRoutes.includes(item.variant_id);
      
      // Store variant details for later use (store all variants, but exclude special ones from stats)
      route.variantDetails.push({
        variant_id: item.variant_id,
        route_variant: item.route_variant,
        direction_id: item.direction_id,
        startStopName: item.startStopName || "",
        endStopName: item.endStopName || "",
        tripDetails: item.tripDetails || [],
      });
      
      // For trains: we'll recalculate from tripDetails after all variants are collected
      // For buses: aggregate hourly frequency from variants (excluding special service)
      if (item.route_type !== "2" && !isSpecialServiceVariant) {
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
      }

      // Aggregate headways - only valid positive headways (excluding special service)
      if (!isSpecialServiceVariant && item.headways && Array.isArray(item.headways)) {
        item.headways.forEach((headway) => {
          if (headway > 0 && headway < 10000) { // Filter out invalid headways
            route.headways.push(headway);
          }
        });
      }

      // For both trains and buses: we'll recalculate total trips from tripDetails after all variants are collected
    });

    // For both trains and buses: recalculate hourly frequency and total trips from tripDetails (count unique times, not variants)
    routeMap.forEach((route) => {
      // Reset totals (we'll recalculate from unique departure times)
      route.totalTrips = 0;
      route.totalTripsWeekday = 0;
      route.totalTripsWeekend = 0;
      
      if (route.route_type === "2") {
        // Trains: collect all trip departure times from all variants
        // Collect all trip departure times from all variants
        const allTripTimes: number[] = [];
        const allTripTimesWeekday: number[] = [];
        const allTripTimesWeekend: number[] = [];
        
        route.variantDetails.forEach((variant) => {
          // Exclude special service variants
          if (specialServiceRoutes.includes(variant.variant_id)) {
            return;
          }
          variant.tripDetails.forEach((trip) => {
            const hour = Math.floor(trip.departureTime / 3600);
            const normalizedHour = hour >= 24 ? hour - 24 : hour;
            
            if (normalizedHour >= 0 && normalizedHour < 24) {
              allTripTimes.push(trip.departureTime);
              
              if (trip.dayType === "weekday") {
                allTripTimesWeekday.push(trip.departureTime);
              } else if (trip.dayType === "weekend") {
                allTripTimesWeekend.push(trip.departureTime);
              }
            }
          });
        });
        
        // Count unique departure times per hour (rounded to minute)
        const tripsByHourAndTime = new Map<number, Set<number>>(); // hour -> Set of unique times (in minutes)
        const tripsByHourAndTimeWeekday = new Map<number, Set<number>>();
        const tripsByHourAndTimeWeekend = new Map<number, Set<number>>();
        
        allTripTimes.forEach((timeSeconds) => {
          const hour = Math.floor(timeSeconds / 3600);
          const normalizedHour = hour >= 24 ? hour - 24 : hour;
          if (normalizedHour >= 0 && normalizedHour < 24) {
            if (!tripsByHourAndTime.has(normalizedHour)) {
              tripsByHourAndTime.set(normalizedHour, new Set());
            }
            const timeInMinutes = Math.floor(timeSeconds / 60);
            tripsByHourAndTime.get(normalizedHour)!.add(timeInMinutes);
          }
        });
        
        allTripTimesWeekday.forEach((timeSeconds) => {
          const hour = Math.floor(timeSeconds / 3600);
          const normalizedHour = hour >= 24 ? hour - 24 : hour;
          if (normalizedHour >= 0 && normalizedHour < 24) {
            if (!tripsByHourAndTimeWeekday.has(normalizedHour)) {
              tripsByHourAndTimeWeekday.set(normalizedHour, new Set());
            }
            const timeInMinutes = Math.floor(timeSeconds / 60);
            tripsByHourAndTimeWeekday.get(normalizedHour)!.add(timeInMinutes);
          }
        });
        
        allTripTimesWeekend.forEach((timeSeconds) => {
          const hour = Math.floor(timeSeconds / 3600);
          const normalizedHour = hour >= 24 ? hour - 24 : hour;
          if (normalizedHour >= 0 && normalizedHour < 24) {
            if (!tripsByHourAndTimeWeekend.has(normalizedHour)) {
              tripsByHourAndTimeWeekend.set(normalizedHour, new Set());
            }
            const timeInMinutes = Math.floor(timeSeconds / 60);
            tripsByHourAndTimeWeekend.get(normalizedHour)!.add(timeInMinutes);
          }
        });
        
        // Set hourly frequency from unique times
        tripsByHourAndTime.forEach((uniqueTimes, hour) => {
          route.hourlyFrequency[hour].trips = uniqueTimes.size;
        });
        
        tripsByHourAndTimeWeekday.forEach((uniqueTimes, hour) => {
          route.hourlyFrequencyWeekday[hour].trips = uniqueTimes.size;
        });
        
        tripsByHourAndTimeWeekend.forEach((uniqueTimes, hour) => {
          route.hourlyFrequencyWeekend[hour].trips = uniqueTimes.size;
        });
        
        // Calculate total trips from unique departure times
        // Count unique departure times (rounded to minute) and sum their weekly frequency
        const uniqueTimesMap = new Map<number, { weekday: boolean; weekend: boolean; timesPerWeek: number }>();
        
        route.variantDetails.forEach((variant) => {
          // Exclude special service variants
          if (specialServiceRoutes.includes(variant.variant_id)) {
            return;
          }
          variant.tripDetails.forEach((trip) => {
            const timeInMinutes = Math.floor(trip.departureTime / 60);
            if (!uniqueTimesMap.has(timeInMinutes)) {
              uniqueTimesMap.set(timeInMinutes, {
                weekday: false,
                weekend: false,
                timesPerWeek: 0,
              });
            }
            const entry = uniqueTimesMap.get(timeInMinutes)!;
            if (trip.dayType === "weekday") {
              entry.weekday = true;
            } else if (trip.dayType === "weekend") {
              entry.weekend = true;
            }
            // Use the trip's timesPerWeek (already calculated correctly)
            entry.timesPerWeek = Math.max(entry.timesPerWeek, trip.timesPerWeek);
          });
        });
        
        // Total trips = sum of timesPerWeek for all unique departure times
        // This represents the total number of trips per week
        route.totalTrips = Array.from(uniqueTimesMap.values()).reduce(
          (sum, entry) => sum + entry.timesPerWeek,
          0
        );
        
        // For weekday/weekend totals, only count trips that run on those days
        route.totalTripsWeekday = Array.from(uniqueTimesMap.values())
          .filter(entry => entry.weekday)
          .reduce((sum, entry) => sum + entry.timesPerWeek, 0);
        
        route.totalTripsWeekend = Array.from(uniqueTimesMap.values())
          .filter(entry => entry.weekend)
          .reduce((sum, entry) => sum + entry.timesPerWeek, 0);
      } else {
        // Buses: same calculation - count unique departure times and sum their weekly frequency
        // Also need to recalculate hourly frequency excluding special service variants
        const allTripTimes: number[] = [];
        const allTripTimesWeekday: number[] = [];
        const allTripTimesWeekend: number[] = [];
        
        route.variantDetails.forEach((variant) => {
          // Exclude special service variants (18M, 18N, 18L, 18R)
          if (specialServiceRoutes.includes(variant.variant_id)) {
            return;
          }
          variant.tripDetails.forEach((trip) => {
            const hour = Math.floor(trip.departureTime / 3600);
            const normalizedHour = hour >= 24 ? hour - 24 : hour;
            
            if (normalizedHour >= 0 && normalizedHour < 24) {
              allTripTimes.push(trip.departureTime);
              
              if (trip.dayType === "weekday") {
                allTripTimesWeekday.push(trip.departureTime);
              } else if (trip.dayType === "weekend") {
                allTripTimesWeekend.push(trip.departureTime);
              }
            }
          });
        });
        
        // Count unique departure times per hour (rounded to minute) for buses
        const tripsByHourAndTime = new Map<number, Set<number>>();
        const tripsByHourAndTimeWeekday = new Map<number, Set<number>>();
        const tripsByHourAndTimeWeekend = new Map<number, Set<number>>();
        
        allTripTimes.forEach((timeSeconds) => {
          const hour = Math.floor(timeSeconds / 3600);
          const normalizedHour = hour >= 24 ? hour - 24 : hour;
          if (normalizedHour >= 0 && normalizedHour < 24) {
            if (!tripsByHourAndTime.has(normalizedHour)) {
              tripsByHourAndTime.set(normalizedHour, new Set());
            }
            const timeInMinutes = Math.floor(timeSeconds / 60);
            tripsByHourAndTime.get(normalizedHour)!.add(timeInMinutes);
          }
        });
        
        allTripTimesWeekday.forEach((timeSeconds) => {
          const hour = Math.floor(timeSeconds / 3600);
          const normalizedHour = hour >= 24 ? hour - 24 : hour;
          if (normalizedHour >= 0 && normalizedHour < 24) {
            if (!tripsByHourAndTimeWeekday.has(normalizedHour)) {
              tripsByHourAndTimeWeekday.set(normalizedHour, new Set());
            }
            const timeInMinutes = Math.floor(timeSeconds / 60);
            tripsByHourAndTimeWeekday.get(normalizedHour)!.add(timeInMinutes);
          }
        });
        
        allTripTimesWeekend.forEach((timeSeconds) => {
          const hour = Math.floor(timeSeconds / 3600);
          const normalizedHour = hour >= 24 ? hour - 24 : hour;
          if (normalizedHour >= 0 && normalizedHour < 24) {
            if (!tripsByHourAndTimeWeekend.has(normalizedHour)) {
              tripsByHourAndTimeWeekend.set(normalizedHour, new Set());
            }
            const timeInMinutes = Math.floor(timeSeconds / 60);
            tripsByHourAndTimeWeekend.get(normalizedHour)!.add(timeInMinutes);
          }
        });
        
        // Set hourly frequency from unique times (excluding special service)
        tripsByHourAndTime.forEach((uniqueTimes, hour) => {
          route.hourlyFrequency[hour].trips = uniqueTimes.size;
        });
        
        tripsByHourAndTimeWeekday.forEach((uniqueTimes, hour) => {
          route.hourlyFrequencyWeekday[hour].trips = uniqueTimes.size;
        });
        
        tripsByHourAndTimeWeekend.forEach((uniqueTimes, hour) => {
          route.hourlyFrequencyWeekend[hour].trips = uniqueTimes.size;
        });
        
        // Calculate total trips from unique departure times
        const uniqueTimesMap = new Map<number, { weekday: boolean; weekend: boolean; timesPerWeek: number }>();
        
        route.variantDetails.forEach((variant) => {
          // Exclude special service variants (18M, 18N, 18L, 18R)
          if (specialServiceRoutes.includes(variant.variant_id)) {
            return;
          }
          variant.tripDetails.forEach((trip) => {
            const timeInMinutes = Math.floor(trip.departureTime / 60);
            if (!uniqueTimesMap.has(timeInMinutes)) {
              uniqueTimesMap.set(timeInMinutes, {
                weekday: false,
                weekend: false,
                timesPerWeek: 0,
              });
            }
            const entry = uniqueTimesMap.get(timeInMinutes)!;
            if (trip.dayType === "weekday") {
              entry.weekday = true;
            } else if (trip.dayType === "weekend") {
              entry.weekend = true;
            }
            // Use the trip's timesPerWeek (already calculated correctly)
            entry.timesPerWeek = Math.max(entry.timesPerWeek, trip.timesPerWeek);
          });
        });
        
        // Total trips = sum of timesPerWeek for all unique departure times
        route.totalTrips = Array.from(uniqueTimesMap.values()).reduce(
          (sum, entry) => sum + entry.timesPerWeek,
          0
        );
        
        // For weekday/weekend totals, only count trips that run on those days
        route.totalTripsWeekday = Array.from(uniqueTimesMap.values())
          .filter(entry => entry.weekday)
          .reduce((sum, entry) => sum + entry.timesPerWeek, 0);
        
        route.totalTripsWeekend = Array.from(uniqueTimesMap.values())
          .filter(entry => entry.weekend)
          .reduce((sum, entry) => sum + entry.timesPerWeek, 0);
      }
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
    return Array.from(routeSet).sort((a, b) => {
      // Sort train lines (2-letter codes) before numeric route numbers
      const aIsTrainLine = /^[A-Z]{2}$/.test(a);
      const bIsTrainLine = /^[A-Z]{2}$/.test(b);
      if (aIsTrainLine && !bIsTrainLine) return -1;
      if (!aIsTrainLine && bIsTrainLine) return 1;
      return a.localeCompare(b);
    });
  }, [routesByLine]);

  const filteredRoutes = useMemo(() => {
    return routesByLine.filter((route) => {
      // Exclude special service routes from main list
      if (specialServiceRoutes.includes(route.route_short_name)) {
        return false;
      }
      if (selectedType !== "all" && route.route_type !== selectedType) {
        return false;
      }
      if (selectedRoute !== "all" && route.route_short_name !== selectedRoute) {
        return false;
      }
      return true;
    });
  }, [routesByLine, selectedType, selectedRoute]);

  const filteredSpecialServiceRoutes = useMemo(() => {
    return routesByLine.filter((route) => {
      // Only include special service routes
      if (!specialServiceRoutes.includes(route.route_short_name)) {
        return false;
      }
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
    // Exclude special service routes from overall stats
    const routesForStats = filteredRoutes.filter(
      (route) => !specialServiceRoutes.includes(route.route_short_name)
    );

    if (routesForStats.length === 0) {
      return {
        totalTrips: 0,
        averageFrequency: 0,
        peakHour: 0,
        peakFrequency: 0,
        averageHeadway: 0,
      };
    }

    const totalTrips = routesForStats.reduce(
      (sum, route) => sum + route.totalTrips,
      0,
    );

    // Aggregate hourly frequency across all routes (excluding special service)
    const hourlyAggregate = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      trips: 0,
    }));

    routesForStats.forEach((route) => {
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

    routesForStats.forEach((route) => {
      route.hourlyFrequencyWeekday.forEach((freq) => {
        hourlyAggregateWeekday[freq.hour].trips += freq.trips;
      });
    });

    // Aggregate hourly frequency - weekend
    const hourlyAggregateWeekend = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      trips: 0,
    }));

    routesForStats.forEach((route) => {
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

    // Calculate average headway - properly weighted average (excluding special service)
    const allHeadways = routesForStats.flatMap((route) => route.headways).filter((h) => h > 0 && h < 10000);
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

    const totalTripsWeekday = routesForStats.reduce(
      (sum, route) => sum + route.totalTripsWeekday,
      0,
    );
    const totalTripsWeekend = routesForStats.reduce(
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
              TransitFlow Trips per Hour Analysis
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Service Trips per Hour & Headways
            </h1>
            <p className="text-muted-foreground text-sm leading-6">
              Analyze trips per hour, headways, and service patterns for GO
              Transit routes.
            </p>
            <div className="rounded-lg border border-dashed border-blue-500/30 bg-blue-500/5 p-3 mt-3">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
                ℹ️ Trips per Hour Calculation
              </p>
              <p className="text-xs text-muted-foreground leading-5">
                Trips per hour is now separated by <strong>weekday</strong> (Monday-Friday) and <strong>weekend</strong> (Saturday-Sunday). 
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
              <p className="text-sm font-semibold mb-1.5">Trips per Hour</p>
                <p className="text-xs text-muted-foreground leading-5">
                Number of trips departing per hour. Higher = more frequent service.
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
                  Avg Trips/Hour
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
                  Avg Trips/Hour
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
                  Avg Trips/Hour
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
            {/* Overall Trips per Hour Chart */}
            <Section className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">
                  Overall Trips per Hour
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
                      // Exclude special service routes from overall graph
                      const routesForGraph = filteredRoutes.filter(
                        (route) => !specialServiceRoutes.includes(route.route_short_name)
                      );
                      const trips = routesForGraph.reduce((sum, route) => {
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
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      }}
                      labelStyle={{
                        color: "hsl(var(--foreground))",
                        fontWeight: 600,
                        marginBottom: "4px",
                      }}
                      itemStyle={{
                        color: "hsl(var(--foreground))",
                      }}
                      cursor={{ fill: "hsl(var(--primary) / 0.1)", stroke: "hsl(var(--primary))", strokeWidth: 2 }}
                      formatter={(value: number | undefined) => [
                        <span key="value" style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>
                          {value || 0} trips per hour
                        </span>,
                        "Trips per Hour"
                      ]}
                    />
                    <Bar
                      dataKey="trips"
                      fill="hsl(var(--foreground))"
                      radius={[4, 4, 0, 0]}
                      style={{ cursor: "pointer" }}
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
                            style={{
                              transition: "opacity 0.2s ease",
                            }}
                            onMouseEnter={(e: any) => {
                              if (e && e.target) {
                                e.target.style.opacity = "0.7";
                                e.target.style.fill = hour === peakHour 
                                  ? "hsl(142 76% 42%)" 
                                  : "hsl(var(--primary))";
                              }
                            }}
                            onMouseLeave={(e: any) => {
                              if (e && e.target) {
                                e.target.style.opacity = "1";
                                e.target.style.fill = hour === peakHour
                                  ? "hsl(142 76% 36%)"
                                  : "hsl(var(--foreground))";
                              }
                            }}
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
                          {route.route_type === "2" ? route.route_short_name : route.route_short_name}
                        </h3>
                        {route.route_long_name && (
                          <p className="text-sm text-muted-foreground">
                            {route.route_long_name}
                          </p>
                        )}
                        {route.route_type === "2" && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {route.variantDetails.length} variant{route.variantDetails.length !== 1 ? "s" : ""}
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
                        Trips per Hour
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
                                  backgroundColor: "hsl(var(--popover))",
                                  border: "1px solid hsl(var(--border))",
                                  borderRadius: "8px",
                                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                                }}
                                labelStyle={{
                                  color: "hsl(var(--foreground))",
                                  fontWeight: 600,
                                  marginBottom: "4px",
                                }}
                                itemStyle={{
                                  color: "hsl(var(--foreground))",
                                }}
                                cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 2, strokeDasharray: "5 5" }}
                                labelFormatter={(value) => `Hour: ${value}`}
                                formatter={(value: number | undefined) => [
                                  <span key="value" style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>
                                    {value || 0} trips per hour
                                  </span>,
                                  "Trips per Hour",
                                ]}
                              />
                              <Line
                                type="monotone"
                                dataKey="trips"
                                stroke="hsl(var(--foreground))"
                                strokeWidth={2}
                                dot={{ r: 3, fill: "hsl(var(--foreground))", strokeWidth: 0 }}
                                activeDot={{ 
                                  r: 6, 
                                  fill: "hsl(var(--primary))",
                                  stroke: "hsl(var(--background))",
                                  strokeWidth: 2,
                                }}
                                connectNulls={false}
                                style={{ cursor: "pointer" }}
                              />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground p-4 border border-dashed rounded-lg">
                            No trips per hour data available for this route.
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
                          {route.variantDetails.length > 0 ? (() => {
                            // Group by hour, then by time
                            // Each unique time = one trip, regardless of how many variants serve it
                            // Different variants at the same time are just different route patterns serving the same trip
                            const tripsByHourAndTime = new Map<
                              number,
                              Map<
                                string,
                                {
                                  time: string;
                                  hour: number;
                                  variants: Array<{
                                    variant: typeof route.variantDetails[0];
                                    trip: TripDetail;
                                  }>;
                                  totalPerWeek: number;
                                  weekdayCount: number;
                                  weekendCount: number;
                                  daysOfWeek: Set<number>;
                                }
                              >
                            >();


                            route.variantDetails.forEach((variant) => {
                              variant.tripDetails.forEach((trip) => {
                                const timeKey = trip.departureTimeFormatted.substring(0, 5); // HH:MM
                                const hour = Math.floor(trip.departureTime / 3600);
                                const normalizedHour = hour >= 24 ? hour - 24 : hour;

                                if (!tripsByHourAndTime.has(normalizedHour)) {
                                  tripsByHourAndTime.set(normalizedHour, new Map());
                                }
                                const hourMap = tripsByHourAndTime.get(normalizedHour)!;

                                if (!hourMap.has(timeKey)) {
                                  hourMap.set(timeKey, {
                                    time: timeKey,
                                    hour: normalizedHour,
                                    variants: [],
                                    totalPerWeek: 0,
                                    weekdayCount: 0,
                                    weekendCount: 0,
                                    daysOfWeek: new Set(),
                                  });
                                }

                                const timeEntry = hourMap.get(timeKey)!;
                                timeEntry.variants.push({ variant, trip });
                                
                                // Use the trip's timesPerWeek (already calculated correctly)
                                // For the same time, we want the max across variants (they all run the same days)
                                if (trip.timesPerWeek > timeEntry.totalPerWeek) {
                                  timeEntry.totalPerWeek = trip.timesPerWeek;
                                }
                                
                                // Collect all days of week
                                trip.daysOfWeek.forEach((day) => timeEntry.daysOfWeek.add(day));
                                
                                if (trip.dayType === "weekday") {
                                  timeEntry.weekdayCount = Math.max(timeEntry.weekdayCount, trip.timesPerWeek);
                                } else if (trip.dayType === "weekend") {
                                  timeEntry.weekendCount = Math.max(timeEntry.weekendCount, trip.timesPerWeek);
                                }
                              });
                            });

                            // Convert to array format
                            const tripsByHour = new Map<
                              number,
                              Array<{
                                time: string;
                                hour: number;
                                totalPerWeek: number;
                                weekdayCount: number;
                                weekendCount: number;
                                variants: Array<{
                                  variant: typeof route.variantDetails[0];
                                  trip: TripDetail;
                                }>;
                                daysOfWeek: number[];
                              }>
                            >();

                            tripsByHourAndTime.forEach((hourMap, hour) => {
                              if (!tripsByHour.has(hour)) {
                                tripsByHour.set(hour, []);
                              }
                              
                              hourMap.forEach((timeEntry) => {
                                tripsByHour.get(hour)!.push({
                                  time: timeEntry.time,
                                  hour: timeEntry.hour,
                                  totalPerWeek: timeEntry.totalPerWeek,
                                  weekdayCount: timeEntry.weekdayCount,
                                  weekendCount: timeEntry.weekendCount,
                                  variants: timeEntry.variants,
                                  daysOfWeek: Array.from(timeEntry.daysOfWeek).sort((a, b) => a - b),
                                });
                              });
                            });

                            return Array.from(tripsByHour.entries())
                              .sort(([a], [b]) => a - b)
                              .map(([hour, timeEntries]) => {
                                // For trains: count unique times (1 trip per time, regardless of variants)
                                // For buses: count all variants (each variant is a separate trip)
                                const totalDepartures = route.route_type === "2" 
                                  ? timeEntries.length 
                                  : timeEntries.reduce((sum, entry) => sum + entry.variants.length, 0);

                                return (
                                  <div
                                    key={hour}
                                    className="rounded-lg border border-dashed p-3 bg-muted/20"
                                  >
                                    <p className="text-xs font-semibold mb-3">
                                      {formatHour(hour)} ({totalDepartures}{" "}
                                      {totalDepartures === 1 ? "trip" : "trips"})
                                    </p>
                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                      {timeEntries
                                        .sort((a, b) => a.time.localeCompare(b.time))
                                        .map((timeEntry) => {
                                          const hasBoth = timeEntry.weekdayCount > 0 && timeEntry.weekendCount > 0;
                                          // For trains: always 1 trip per time (variants are grouped)
                                          // For buses: count variants as separate trips
                                          const tripsAtThisTime = route.route_type === "2" ? 1 : timeEntry.variants.length;

                                          return (
                                            <div
                                              key={timeEntry.time}
                                              className="rounded border border-dashed p-2 bg-background"
                                            >
                                              <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-xs font-medium font-mono">
                                                  {timeEntry.time}
                                                  {route.route_type !== "2" && tripsAtThisTime > 1 && (
                                                    <span className="text-[10px] text-muted-foreground ml-1">
                                                      ({tripsAtThisTime} trips)
                                                    </span>
                                                  )}
                                                </span>
                                                <span className="text-[10px] font-medium text-foreground">
                                                  {timeEntry.totalPerWeek > 0
                                                    ? `${timeEntry.totalPerWeek}x/week`
                                                    : hasBoth
                                                      ? `${timeEntry.weekdayCount} weekday + ${timeEntry.weekendCount} weekend`
                                                      : timeEntry.weekdayCount > 0
                                                        ? `${timeEntry.weekdayCount}x/week (weekday only)`
                                                        : timeEntry.weekendCount > 0
                                                          ? `${timeEntry.weekendCount}x/week (weekend only)`
                                                          : "1x/week"}
                                                </span>
                                              </div>
                                              {route.route_type === "2" ? (
                                                // For trains, show aggregated info without individual variants
                                                <div className="rounded border border-dashed p-2 bg-muted/30">
                                                  <div className="mb-1.5">
                                                    <span className="text-[11px] font-medium text-foreground">
                                                      {route.route_short_name}
                                                    </span>
                                                    {timeEntry.variants.length > 0 && timeEntry.variants[0].variant.startStopName &&
                                                      timeEntry.variants[0].variant.endStopName && (
                                                        <span className="text-[10px] text-muted-foreground ml-1.5">
                                                          {timeEntry.variants[0].variant.startStopName} →{" "}
                                                          {timeEntry.variants[0].variant.endStopName}
                                                        </span>
                                                      )}
                                                  </div>
                                                  {timeEntry.daysOfWeek && timeEntry.daysOfWeek.length > 0 && (
                                                    <div className="mt-1.5">
                                                      <p className="text-[10px] text-muted-foreground mb-1">
                                                        Days:{" "}
                                                        <span className="font-medium text-foreground">
                                                          {formatDaysOfWeek(timeEntry.daysOfWeek)}
                                                        </span>
                                                      </p>
                                                    </div>
                                                  )}
                                                </div>
                                              ) : (
                                                // For buses, show individual variants
                                                <div className="space-y-2">
                                                  {timeEntry.variants.map((variantInfo, idx) => {
                                                    const stops = variantStops[variantInfo.variant.variant_id] || [];
                                                    const sortedStops = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
                                                    
                                                    return (
                                                      <div
                                                        key={idx}
                                                        className="rounded border border-dashed p-2 bg-muted/30"
                                                      >
                                                        <div className="mb-1.5">
                                                          <span className="text-[11px] font-medium text-foreground">
                                                            {getVariantDisplayName(
                                                              variantInfo.variant.variant_id,
                                                              variantInfo.variant.route_variant,
                                                              route.route_type
                                                            )}
                                                          </span>
                                                          {variantInfo.variant.startStopName &&
                                                            variantInfo.variant.endStopName && (
                                                              <span className="text-[10px] text-muted-foreground ml-1.5">
                                                                {variantInfo.variant.startStopName} →{" "}
                                                                {variantInfo.variant.endStopName}
                                                              </span>
                                                            )}
                                                        </div>
                                                        {variantInfo.trip.daysOfWeek && variantInfo.trip.daysOfWeek.length > 0 && (
                                                          <div className="mt-1.5">
                                                            <p className="text-[10px] text-muted-foreground mb-1">
                                                              Days:{" "}
                                                              <span className="font-medium text-foreground">
                                                                {formatDaysOfWeek(variantInfo.trip.daysOfWeek)}
                                                              </span>
                                                            </p>
                                                          </div>
                                                        )}
                                                        {sortedStops.length > 0 && (
                                                          <div className="mt-1.5 pt-1.5 border-t border-dashed">
                                                            <p className="text-[10px] text-muted-foreground mb-1.5">
                                                              All stops ({sortedStops.length}):
                                                            </p>
                                                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                                              {sortedStops.map((stop, stopIdx) => (
                                                                <span
                                                                  key={stop.stop_id}
                                                                  className="inline-flex items-center"
                                                                >
                                                                  <span className="text-[10px] text-muted-foreground">
                                                                    {stop.stop_name}
                                                                  </span>
                                                                  {stopIdx < sortedStops.length - 1 && (
                                                                    <span className="mx-1.5 text-[8px] text-muted-foreground/40">→</span>
                                                                  )}
                                                                </span>
                                                              ))}
                                                            </div>
                                                          </div>
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                    </div>
                                  </div>
                                );
                              });
                          })() : (
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

            {/* Special Service Routes */}
            {filteredSpecialServiceRoutes.length > 0 && (
              <Section>
                <div className="mb-4">
                  <h2 className="text-base font-semibold mb-1">
                    Special Service Routes ({filteredSpecialServiceRoutes.length})
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Routes with limited or special service schedules
                  </p>
                </div>
                <div className="space-y-4">
                  {filteredSpecialServiceRoutes.map((route) => (
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
                          <p className="text-lg font-semibold">
                            {selectedDayType === "weekday"
                              ? formatHour(route.peakHourWeekday || 0)
                              : selectedDayType === "weekend"
                                ? formatHour(route.peakHourWeekend || 0)
                                : formatHour(route.peakHour)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {selectedDayType === "weekday"
                              ? `${route.peakFrequencyWeekday || 0} trips`
                              : selectedDayType === "weekend"
                                ? `${route.peakFrequencyWeekend || 0} trips`
                                : `${route.peakFrequency} trips`}
                          </p>
                          {selectedDayType === "all" && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Wkday: {formatHour(route.peakHourWeekday || 0)} ({route.peakFrequencyWeekday || 0}) • Wkend: {formatHour(route.peakHourWeekend || 0)} ({route.peakFrequencyWeekend || 0})
                            </p>
                          )}
                        </div>
                        <div className="rounded-lg border border-dashed p-3">
                          <p className="text-xs uppercase text-muted-foreground">
                            Avg Headway
                          </p>
                          <p className="text-lg font-semibold">
                            {route.averageHeadway > 0
                              ? `${Math.round(route.averageHeadway)} min`
                              : "N/A"}
                          </p>
                        </div>
                        <div className="rounded-lg border border-dashed p-3">
                          <p className="text-xs uppercase text-muted-foreground">
                            Min Headway
                          </p>
                          <p className="text-lg font-semibold">
                            {route.minHeadway > 0 && route.minHeadway < Infinity
                              ? `${Math.round(route.minHeadway)} min`
                              : "N/A"}
                          </p>
                        </div>
                        <div className="rounded-lg border border-dashed p-3">
                          <p className="text-xs uppercase text-muted-foreground">
                            Max Headway
                          </p>
                          <p className="text-lg font-semibold">
                            {route.maxHeadway > 0
                              ? `${Math.round(route.maxHeadway)} min`
                              : "N/A"}
                          </p>
                        </div>
                      </div>

                      {/* Trips Per Hour Chart */}
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold mb-2">
                          TRIPS PER HOUR ({selectedDayType === "weekday" ? "WEEKDAY" : selectedDayType === "weekend" ? "WEEKEND" : "ALL DAYS"})
                        </h4>
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
                                      backgroundColor: "hsl(var(--popover))",
                                      border: "1px solid hsl(var(--border))",
                                      borderRadius: "8px",
                                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                                    }}
                                    labelStyle={{
                                      color: "hsl(var(--foreground))",
                                      fontWeight: 600,
                                      marginBottom: "4px",
                                    }}
                                    itemStyle={{
                                      color: "hsl(var(--foreground))",
                                    }}
                                    cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 2, strokeDasharray: "5 5" }}
                                    labelFormatter={(value) => `Hour: ${value}`}
                                    formatter={(value: number | undefined) => [
                                      <span key="value" style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>
                                        {value || 0} trips per hour
                                      </span>,
                                      "Trips per Hour",
                                    ]}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="trips"
                                    stroke="hsl(var(--foreground))"
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: "hsl(var(--foreground))", strokeWidth: 0 }}
                                    activeDot={{ 
                                      r: 6, 
                                      fill: "hsl(var(--primary))",
                                      stroke: "hsl(var(--background))",
                                      strokeWidth: 2,
                                    }}
                                    connectNulls={false}
                                    style={{ cursor: "pointer" }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground p-4 border border-dashed rounded-lg">
                              No trips per hour data available for this route.
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
                          <span
                            className={cn(
                              "transition-transform",
                              expandedRoutes.has(route.route_short_name)
                                ? "rotate-180"
                                : "",
                            )}
                          >
                            ▼
                          </span>
                        </button>
                        {expandedRoutes.has(route.route_short_name) && (
                          <div className="mt-4 space-y-3">
                            {(() => {
                              // Same logic as main routes for displaying trip details
                              const tripsByHourAndTime = new Map<
                                number,
                                Map<
                                  string,
                                  {
                                    time: string;
                                    hour: number;
                                    variants: Array<{
                                      variant: typeof route.variantDetails[0];
                                      trip: TripDetail;
                                    }>;
                                    totalPerWeek: number;
                                    weekdayCount: number;
                                    weekendCount: number;
                                    daysOfWeek: Set<number>;
                                  }
                                >
                              >();

                              route.variantDetails.forEach((variant) => {
                                variant.tripDetails.forEach((trip) => {
                                  const timeKey = trip.departureTimeFormatted.substring(0, 5);
                                  const hour = Math.floor(trip.departureTime / 3600);
                                  const normalizedHour = hour >= 24 ? hour - 24 : hour;

                                  if (!tripsByHourAndTime.has(normalizedHour)) {
                                    tripsByHourAndTime.set(normalizedHour, new Map());
                                  }
                                  const hourMap = tripsByHourAndTime.get(normalizedHour)!;

                                  if (!hourMap.has(timeKey)) {
                                    hourMap.set(timeKey, {
                                      time: timeKey,
                                      hour: normalizedHour,
                                      variants: [],
                                      totalPerWeek: 0,
                                      weekdayCount: 0,
                                      weekendCount: 0,
                                      daysOfWeek: new Set(),
                                    });
                                  }

                                  const timeEntry = hourMap.get(timeKey)!;
                                  timeEntry.variants.push({ variant, trip });
                                  
                                  if (trip.timesPerWeek > timeEntry.totalPerWeek) {
                                    timeEntry.totalPerWeek = trip.timesPerWeek;
                                  }
                                  
                                  trip.daysOfWeek.forEach((day) => timeEntry.daysOfWeek.add(day));
                                  
                                  if (trip.dayType === "weekday") {
                                    timeEntry.weekdayCount = Math.max(timeEntry.weekdayCount, trip.timesPerWeek);
                                  } else if (trip.dayType === "weekend") {
                                    timeEntry.weekendCount = Math.max(timeEntry.weekendCount, trip.timesPerWeek);
                                  }
                                });
                              });

                              const tripsByHour = new Map<
                                number,
                                Array<{
                                  time: string;
                                  hour: number;
                                  totalPerWeek: number;
                                  weekdayCount: number;
                                  weekendCount: number;
                                  variants: Array<{
                                    variant: typeof route.variantDetails[0];
                                    trip: TripDetail;
                                  }>;
                                  daysOfWeek: number[];
                                }>
                              >();

                              tripsByHourAndTime.forEach((hourMap, hour) => {
                                if (!tripsByHour.has(hour)) {
                                  tripsByHour.set(hour, []);
                                }
                                
                                hourMap.forEach((timeEntry) => {
                                  tripsByHour.get(hour)!.push({
                                    time: timeEntry.time,
                                    hour: timeEntry.hour,
                                    totalPerWeek: timeEntry.totalPerWeek,
                                    weekdayCount: timeEntry.weekdayCount,
                                    weekendCount: timeEntry.weekendCount,
                                    variants: timeEntry.variants,
                                    daysOfWeek: Array.from(timeEntry.daysOfWeek).sort((a, b) => a - b),
                                  });
                                });
                              });

                              return Array.from(tripsByHour.entries())
                                .sort(([a], [b]) => a - b)
                                .map(([hour, timeEntries]) => {
                                  const totalDepartures = route.route_type === "2" 
                                    ? timeEntries.length 
                                    : timeEntries.reduce((sum, entry) => sum + entry.variants.length, 0);

                                  return (
                                    <div
                                      key={hour}
                                      className="rounded-lg border border-dashed p-3 bg-muted/20"
                                    >
                                      <p className="text-xs font-semibold mb-3">
                                        {formatHour(hour)} ({totalDepartures}{" "}
                                        {totalDepartures === 1 ? "trip" : "trips"})
                                      </p>
                                      <div className="space-y-2 max-h-96 overflow-y-auto">
                                        {timeEntries
                                          .sort((a, b) => a.time.localeCompare(b.time))
                                          .map((timeEntry) => {
                                            const hasBoth = timeEntry.weekdayCount > 0 && timeEntry.weekendCount > 0;
                                            const tripsAtThisTime = route.route_type === "2" ? 1 : timeEntry.variants.length;

                                            return (
                                              <div
                                                key={timeEntry.time}
                                                className="rounded border border-dashed p-2 bg-background"
                                              >
                                                <div className="flex items-center justify-between mb-1.5">
                                                  <span className="text-xs font-medium font-mono">
                                                    {timeEntry.time}
                                                    {route.route_type !== "2" && tripsAtThisTime > 1 && (
                                                      <span className="text-[10px] text-muted-foreground ml-1">
                                                        ({tripsAtThisTime} trips)
                                                      </span>
                                                    )}
                                                  </span>
                                                  <span className="text-[10px] font-medium text-foreground">
                                                    {timeEntry.totalPerWeek > 0
                                                      ? `${timeEntry.totalPerWeek}x/week`
                                                      : hasBoth
                                                        ? `${timeEntry.weekdayCount} weekday + ${timeEntry.weekendCount} weekend`
                                                        : timeEntry.weekdayCount > 0
                                                          ? `${timeEntry.weekdayCount}x/week (weekday only)`
                                                          : timeEntry.weekendCount > 0
                                                            ? `${timeEntry.weekendCount}x/week (weekend only)`
                                                            : "1x/week"}
                                                  </span>
                                                </div>
                                                {route.route_type === "2" ? (
                                                  <div className="rounded border border-dashed p-2 bg-muted/30">
                                                    <div className="mb-1.5">
                                                      <span className="text-[11px] font-medium text-foreground">
                                                        {route.route_short_name}
                                                      </span>
                                                      {timeEntry.variants.length > 0 && timeEntry.variants[0].variant.startStopName &&
                                                        timeEntry.variants[0].variant.endStopName && (
                                                          <span className="text-[10px] text-muted-foreground ml-1.5">
                                                            {timeEntry.variants[0].variant.startStopName} →{" "}
                                                            {timeEntry.variants[0].variant.endStopName}
                                                          </span>
                                                        )}
                                                    </div>
                                                    {timeEntry.daysOfWeek && timeEntry.daysOfWeek.length > 0 && (
                                                      <div className="mt-1.5">
                                                        <p className="text-[10px] text-muted-foreground mb-1">
                                                          Days:{" "}
                                                          <span className="font-medium text-foreground">
                                                            {formatDaysOfWeek(timeEntry.daysOfWeek)}
                                                          </span>
                                                        </p>
                                                      </div>
                                                    )}
                                                  </div>
                                                ) : (
                                                  <div className="space-y-2">
                                                    {timeEntry.variants.map((variantInfo, idx) => {
                                                      const stops = variantStops[variantInfo.variant.variant_id] || [];
                                                      const sortedStops = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
                                                      
                                                      return (
                                                        <div
                                                          key={idx}
                                                          className="rounded border border-dashed p-2 bg-muted/30"
                                                        >
                                                          <div className="mb-1.5">
                                                            <span className="text-[11px] font-medium text-foreground">
                                                              {getVariantDisplayName(
                                                                variantInfo.variant.variant_id,
                                                                variantInfo.variant.route_variant,
                                                                route.route_type
                                                              )}
                                                            </span>
                                                            {variantInfo.variant.startStopName &&
                                                              variantInfo.variant.endStopName && (
                                                                <span className="text-[10px] text-muted-foreground ml-1.5">
                                                                  {variantInfo.variant.startStopName} →{" "}
                                                                  {variantInfo.variant.endStopName}
                                                                </span>
                                                              )}
                                                          </div>
                                                          {variantInfo.trip.daysOfWeek && variantInfo.trip.daysOfWeek.length > 0 && (
                                                            <div className="mt-1.5">
                                                              <p className="text-[10px] text-muted-foreground mb-1">
                                                                Days:{" "}
                                                                <span className="font-medium text-foreground">
                                                                  {formatDaysOfWeek(variantInfo.trip.daysOfWeek)}
                                                                </span>
                                                              </p>
                                                            </div>
                                                          )}
                                                          {sortedStops.length > 0 && (
                                                            <div className="mt-1.5 pt-1.5 border-t border-dashed">
                                                              <p className="text-[10px] text-muted-foreground mb-1.5">
                                                                All stops ({sortedStops.length}):
                                                              </p>
                                                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                                                {sortedStops.map((stop, stopIdx) => (
                                                                  <span
                                                                    key={stop.stop_id}
                                                                    className="inline-flex items-center"
                                                                  >
                                                                    <span className="text-[10px] text-muted-foreground">
                                                                      {stop.stop_name}
                                                                    </span>
                                                                    {stopIdx < sortedStops.length - 1 && (
                                                                      <span className="mx-1.5 text-[8px] text-muted-foreground/40">→</span>
                                                                    )}
                                                                  </span>
                                                                ))}
                                                              </div>
                                                            </div>
                                                          )}
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                      </div>
                                    </div>
                                  );
                                });
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
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
