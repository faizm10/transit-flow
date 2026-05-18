/**
 * TransitFlow demo — full-clip.mov (186 s) → 54 s screen at ~3.44×
 *
 * Chapters mapped from actual recording content:
 *  0 – 12 s screen  →  0 – 41 s source  : Explore mode, GO network overview + filter panel
 * 12 – 24 s screen  → 41 – 82 s source  : Design mode, naming route + adding stops + frequency
 * 24 – 37 s screen  → 82 – 127 s source : Schedules — picker + custom departure editing
 * 37 – 54 s screen  → 127 – 186 s source: Simulation — setup → full network → Brampton zoom
 */

import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  Video,
  Easing,
  staticFile,
} from "remotion";

// ── Brand ──────────────────────────────────────────────────────────────────
const GREEN  = "#007A33";
const DARK   = "#0a1628";
const WHITE  = "#ffffff";
const YELLOW = "#FFD047";

// ── Timing ─────────────────────────────────────────────────────────────────
const FPS      = 30;
const SOURCE_S = 186.1;
const SCREEN_S = 54;
const RATE     = SOURCE_S / SCREEN_S;  // ≈ 3.44×

const INTRO_S       = 2;
const OUTRO_S       = 3;
const CROSS_S       = 1.0;

const CLIP_START_S  = INTRO_S - CROSS_S;       // clip starts overlapping intro
const OUTRO_START_S = CLIP_START_S + SCREEN_S - CROSS_S;
const TOTAL_S       = OUTRO_START_S + OUTRO_S;
export const TOTAL_FRAMES = Math.ceil(TOTAL_S * FPS);

// ── Chapters ───────────────────────────────────────────────────────────────
// screenStart / screenEnd = clip-playback seconds (0 = first frame of clip)
// zoom  = CSS scale applied to the Video element
// ox/oy = transform-origin, tuned to the actual UI region visible in the recording
const CHAPTERS = [
  {
    // Explore mode: sidebar list of all 44 routes sits at the far LEFT edge
    screenStart: 0,
    screenEnd:   9,
    text: "Explore every GO Transit train and bus route — all on one live map.",
    zoom: 1.32,
    ox: "11%", oy: "44%",
  },
  {
    // Design panel: left-edge panel — step 1 (bus/train), step 2 (name + stops), step 3 (frequency)
    screenStart: 9,
    screenEnd:   23,
    text: "Design your own route from scratch — add stops, pick a schedule, and go.",
    zoom: 1.38,
    ox: "10%", oy: "46%",
  },
  {
    // Schedules: large center modal — Kitchener line departures, then Express Bus editing
    screenStart: 23,
    screenEnd:   35,
    text: "See exactly when every train and bus departs — or edit your own timetable.",
    zoom: 1.24,
    ox: "52%", oy: "52%",
  },
  {
    // Simulation setup: compact panel sits at BOTTOM-RIGHT corner of screen
    screenStart: 35,
    screenEnd:   41,
    text: "Pick a time, hit Start, and watch the whole network come to life.",
    zoom: 1.45,
    ox: "86%", oy: "90%",
  },
  {
    // Simulation running: full map, vehicles moving; map pans into Brampton toward end
    screenStart: 41,
    screenEnd:   54,
    text: "Nearly 900 real trips moving in real time — tap any vehicle to track it.",
    zoom: 1.12,
    ox: "48%", oy: "44%",
  },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────
const f     = (s: number) => Math.round(s * FPS);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

function easedInterp(
  frame: number,
  [t0, t1]: [number, number],
  [v0, v1]: [number, number],
  easing: (t: number) => number = Easing.inOut(Easing.ease),
) {
  return clamp(interpolate(frame, [f(t0), f(t1)], [v0, v1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  }));
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Logo({ size = 64 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size,
      borderRadius: size * 0.22,
      background: GREEN,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 0 ${size * 0.9}px rgba(0,122,51,0.5)`,
      flexShrink: 0,
    }}>
      <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M8 6V4M16 6V4" />
      </svg>
    </div>
  );
}

function Vignette() {
  return (
    <div style={{
      position: "absolute", inset: 0, pointerEvents: "none",
      background: "linear-gradient(to top, rgba(10,22,40,0.85) 0%, transparent 35%)",
    }} />
  );
}

function ChapterLabel({ text, opacity, slideY }: {
  text: string; opacity: number; slideY: number;
}) {
  return (
    <div style={{
      position: "absolute",
      bottom: 52,
      left: "50%",
      transform: `translateX(-50%) translateY(${slideY}px)`,
      opacity,
      width: "72%",
      display: "flex",
      justifyContent: "center",
    }}>
      <p style={{
        margin: 0,
        fontSize: 24, fontWeight: 600, color: YELLOW,
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: 1.45,
        textShadow: "0 2px 18px rgba(0,0,0,0.85)",
        letterSpacing: "-0.15px",
        textAlign: "center",
      }}>
        {text}
      </p>
    </div>
  );
}

// ── Main composition ────────────────────────────────────────────────────────
export const TransitFlowDemo = () => {
  const frame = useCurrentFrame();

  const clipAbsStart = CLIP_START_S;
  const clipAbsEnd   = CLIP_START_S + SCREEN_S;

  // clip-playback seconds relative to clip start
  const clipPlayS = frame / FPS - clipAbsStart;

  // ── Active chapter + next chapter (for zoom interpolation) ────────────
  const chapterIdx = CHAPTERS.findIndex(
    (ch) => clipPlayS >= ch.screenStart && clipPlayS < ch.screenEnd,
  );
  const chapter     = chapterIdx >= 0 ? CHAPTERS[chapterIdx] : null;
  const nextChapter = chapterIdx >= 0 && chapterIdx < CHAPTERS.length - 1
    ? CHAPTERS[chapterIdx + 1]
    : null;

  // Smooth zoom: interpolate from current→next during last 1 s of chapter
  let zoomScale = chapter?.zoom ?? 1;
  let zoomOx = chapter?.ox ?? "50%";
  let zoomOy = chapter?.oy ?? "50%";

  if (chapter && nextChapter) {
    const transitionStart = CLIP_START_S + chapter.screenEnd - 1;
    const transitionEnd   = CLIP_START_S + chapter.screenEnd;
    const t = easedInterp(frame, [transitionStart, transitionEnd], [0, 1]);
    zoomScale = chapter.zoom + t * (nextChapter.zoom - chapter.zoom);
    // simple cross-blend of origin (just keep current until switch)
    if (t > 0.5) { zoomOx = nextChapter.ox; zoomOy = nextChapter.oy; }
  }

  // ── Label opacity / slide ─────────────────────────────────────────────
  let labelOp = 0;
  let labelY  = 20;

  if (chapter) {
    const absStart = CLIP_START_S + chapter.screenStart;
    const absEnd   = CLIP_START_S + chapter.screenEnd;
    labelOp = clamp(interpolate(
      frame,
      [f(absStart), f(absStart + 0.7), f(absEnd - 0.8), f(absEnd - 0.1)],
      [0, 1, 1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    ));
    labelY = interpolate(frame, [f(absStart), f(absStart + 0.7)], [20, 0], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
  }

  // ── Clip opacity ──────────────────────────────────────────────────────
  const clipFadeIn  = easedInterp(frame, [clipAbsStart, clipAbsStart + CROSS_S], [0, 1], Easing.out(Easing.ease));
  const clipFadeOut = easedInterp(frame, [clipAbsEnd - CROSS_S, clipAbsEnd], [1, 0], Easing.in(Easing.ease));
  const clipOp = clamp(Math.min(clipFadeIn, clipFadeOut));

  // ── Intro ──────────────────────────────────────────────────────────────
  const introBgOp = easedInterp(frame, [INTRO_S - CROSS_S, INTRO_S], [1, 0], Easing.in(Easing.ease));
  const logoScale  = spring({ frame, fps: FPS, from: 0.7, to: 1, config: { damping: 14, stiffness: 120 } });
  const logoOp     = easedInterp(frame, [0, 0.4], [0, 1]);
  const taglineOp  = easedInterp(frame, [0.6, 1.1], [0, 1]);

  // ── Outro ──────────────────────────────────────────────────────────────
  const outroOp    = easedInterp(frame, [OUTRO_START_S, OUTRO_START_S + CROSS_S], [0, 1], Easing.out(Easing.ease));
  const outroScale = spring({
    frame: Math.max(0, frame - f(OUTRO_START_S)),
    fps: FPS, from: 0.88, to: 1, config: { damping: 16 },
  });

  return (
    <AbsoluteFill style={{ background: DARK, fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Clip with zoom ────────────────────────────────────────────── */}
      {clipOp > 0.01 && (
        <AbsoluteFill style={{ opacity: clipOp, overflow: "hidden" }}>
          {/* Zoom wrapper — scale + origin animate per chapter */}
          <div style={{
            width: "100%", height: "100%",
            transform: `scale(${zoomScale})`,
            transformOrigin: `${zoomOx} ${zoomOy}`,
            transition: "transform-origin 0s",   // origin snaps; scale interpolated by Remotion
          }}>
            <Video
              src={staticFile("full-clip.mov")}
              playbackRate={RATE}
              endAt={Math.round(SOURCE_S * FPS)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <Vignette />
          {chapter && (
            <ChapterLabel text={chapter.text} opacity={labelOp} slideY={labelY} />
          )}
        </AbsoluteFill>
      )}

      {/* ── Intro ─────────────────────────────────────────────────────── */}
      {introBgOp > 0.01 && (
        <AbsoluteFill style={{
          opacity: introBgOp, background: DARK,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 22,
        }}>
          <div style={{
            transform: `scale(${logoScale})`, opacity: logoOp,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
          }}>
            <Logo size={96} />
            <div style={{ fontSize: 60, fontWeight: 800, color: WHITE, letterSpacing: "-2px" }}>
              TransitFlow
            </div>
            <div style={{
              opacity: taglineOp, fontSize: 18, fontWeight: 400,
              color: "#94a3b8", letterSpacing: "0.01em",
            }}>
              GO Transit design and simulation in the browser.
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* ── Outro ─────────────────────────────────────────────────────── */}
      {outroOp > 0.01 && (
        <AbsoluteFill style={{
          opacity: outroOp, background: DARK,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 24,
        }}>
          <div style={{
            transform: `scale(${outroScale})`,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 22,
          }}>
            <Logo size={88} />
            <div style={{ fontSize: 54, fontWeight: 800, color: WHITE, letterSpacing: "-2px" }}>
              TransitFlow
            </div>
            <div style={{
              fontSize: 18, color: "#64748b", maxWidth: 460,
              textAlign: "center" as const, lineHeight: 1.7,
            }}>
              Design and simulate your own transit network.
            </div>
            <div style={{
              marginTop: 4, fontSize: 16, fontWeight: 500,
              color: YELLOW, letterSpacing: "0.01em",
            }}>
              transit-flow-two.vercel.app
            </div>
          </div>
        </AbsoluteFill>
      )}

    </AbsoluteFill>
  );
};
