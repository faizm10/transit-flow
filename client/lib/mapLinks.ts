/**
 * Canonical map URLs for marketing + in-app links.
 */
export const MAP_LINKS = {
  /** GO network + Explore panel (default entry) */
  welcome: "/map?entry=network&mode=browse",
  /** Full GO network + Explore panel */
  exploreNetwork: "/map?entry=network&mode=browse",
  /** Full network + Design panel */
  designFresh: "/map?entry=network&mode=build",
  /** Full network + extend wizard */
  extendGo: "/map?entry=network&mode=build&design=extend",
  /** Full network + simulation HUD */
  simulate: "/map?entry=network&mode=simulate",
  /** Full network + schedule modal */
  schedules: "/map?entry=network&mode=schedule",
} as const;
