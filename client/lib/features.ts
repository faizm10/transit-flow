/**
 * OpenRailwayMap raster underlay + floating “Rail map” toggle (map page).
 * Does not affect drawing, saved geometry, or simulation.
 * Set to `true` to bring the reference rail basemap back.
 */
export const OPENRAILWAYMAP_OVERLAY_ENABLED = false;

/**
 * Gap Finder (beta) — a floating panel on the map that lists underserved GO
 * corridors from `network_gaps.json` and jumps you into the route builder with
 * the corridor drawn. Phase 1: read-only ranking + build handoff, no scoring
 * of your route yet. See scripts/build_network_gaps.py.
 */
export const GAP_FINDER_BETA_ENABLED = true;
