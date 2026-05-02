/**
 * Canonical map URLs for marketing + in-app links.
 * Must stay aligned with client/lib/mapEntry.ts (entry=fresh|network).
 */
export const MAP_LINKS = {
  /** Welcome: blank map + Start fresh | Use existing network */
  welcome: "/map",
  /** Full GO network + Explore panel */
  exploreNetwork: "/map?entry=network&mode=browse",
  /** Empty canvas + create flow */
  designFresh: "/map?entry=fresh",
  /** Full network + extend wizard */
  extendGo: "/map?entry=network&mode=build&design=extend",
  /** Full network + simulation HUD */
  simulate: "/map?entry=network&mode=simulate",
  /** Full network + schedule modal */
  schedules: "/map?entry=network&mode=schedule",
} as const;
