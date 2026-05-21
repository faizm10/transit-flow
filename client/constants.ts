import {
  Route,
  PenLine,
  BarChart2,
  Bell,
  PlayCircle,
  Layers,
  GraduationCap,
  Users,
  Code2,
  Building2,
} from "lucide-react";

/** App routes used on the marketing landing page */
export const MAP = "/map";

export const METRICS = [
  { value: "45+", label: "GO Transit routes" },
  { value: "Live", label: "GTFS-based routing" },
  { value: "4", label: "Planning modes" },
  { value: "250+", label: "Route variants" },
  { value: "Browser", label: "No install required" },
] as const;

export const FEATURES = [
  {
    icon: Route,
    title: "Route Explorer",
    body: "All 45 GO lines on a live map. Real stop sequences, headways, and GTFS trip data.",
  },
  {
    icon: BarChart2,
    title: "Schedule Comparison",
    body: "Inspect timetables, compare headways across lines, and identify service gaps.",
  },
  {
    icon: Bell,
    title: "Service Updates",
    body: "Live alerts from GO Transit — delays, cancellations, and notices, filterable by line.",
  },
  {
    icon: PlayCircle,
    title: "Simulation HUD",
    body: "Animate the entire network or a single custom route. Scrub through any hour of the day.",
  },
] as const;

export const STEPS = [
  {
    n: "01",
    title: "Connect GTFS data",
    body: "The full GO Transit network loads instantly — stops, trips, shapes, and frequencies — derived from the live GTFS feed.",
  },
  {
    n: "02",
    title: "Explore routes visually",
    body: "Browse any of the 45+ routes on an interactive map. Click a line to inspect its stops, trip count, and corridor.",
  },
  {
    n: "03",
    title: "Compare service patterns",
    body: "Switch to Schedules mode to compare headways across lines or examine departure times at any stop.",
  },
  {
    n: "04",
    title: "Simulate network changes",
    body: "Draw a new route, set its schedule, then watch it run alongside the live GO network in the simulation engine.",
  },
] as const;

export const CAPABILITIES = [
  {
    icon: Route,
    title: "GTFS-powered route intelligence",
    body: "Derived GeoJSON and stop data from the official GO Transit GTFS feed. Always accurate, always structured.",
  },
  {
    icon: PenLine,
    title: "Interactive route sketching",
    body: "Draw corridors on the map, snap to the rail network, place stops, and wire up a full schedule in minutes.",
  },
  {
    icon: BarChart2,
    title: "Schedule and departure analysis",
    body: "Inspect any line's timetable, compare peak vs. off-peak headways, and surface gaps in coverage.",
  },
  {
    icon: Bell,
    title: "Service update visualization",
    body: "Live GO Transit alerts delivered directly into the workspace — filterable by line, categorized by severity.",
  },
  {
    icon: PlayCircle,
    title: "Simulation-ready transit data",
    body: "The simulation engine animates vehicles across the real network — or any custom route you design.",
  },
  {
    icon: Layers,
    title: "Planner-friendly map workspace",
    body: "One browser tab. Four modes. No GIS software, no install, no account required to start exploring.",
  },
] as const;

export const USE_CASES = [
  {
    icon: Building2,
    tag: "For transit planners",
    title: "Evaluate service changes before they ship.",
    body: "Sketch a new route, compare it against the existing network, run a simulation, and share the result — all in one workspace.",
  },
  {
    icon: GraduationCap,
    tag: "For students & researchers",
    title: "Study real networks with real data.",
    body: "The full GO Transit GTFS feed, structured and queryable. Ideal for urban planning coursework, network analysis, and thesis research.",
  },
  {
    icon: Code2,
    tag: "For civic hackers",
    title: "Build on live GTFS without the overhead.",
    body: "Pre-processed GeoJSON, derived stop data, and a simulation engine — open source and ready to extend.",
  },
  {
    icon: Users,
    tag: "For agencies exploring changes",
    title: "Communicate proposals visually.",
    body: "Generate shareable map views of proposed service changes. Show the community what a new route looks like before a single dollar is spent.",
  },
] as const;

export const COMPARISON_FEATURES = [
  "Live network data",
  "Route design tools",
  "Schedule analysis",
  "Simulation engine",
  "Service update alerts",
  "Browser-based",
  "Free to use",
] as const;

export type CellVal = "yes" | "no" | "partial";

export const COMPARISON_DATA: Record<string, CellVal[]> = {
  TransitFlow: ["yes", "yes", "yes", "yes", "yes", "yes", "yes"],
  "Static PDF maps": ["no", "no", "no", "no", "no", "partial", "yes"],
  "Spreadsheet planning": ["no", "partial", "partial", "no", "no", "yes", "yes"],
  "Disconnected GIS tools": ["partial", "partial", "no", "no", "no", "no", "no"],
};
