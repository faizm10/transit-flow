/**
 * TransitFlow demo video — single full-clip recording, sped up to ≤ 60 s.
 *
 * full-clip.mov  186 s source → 54 s screen  @ ~3.44×
 *
 * Intro 2 s + clip 54 s + outro 3 s − 2 crossfades (1 s each) = 57 s total
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
const FPS       = 30;
const SOURCE_S  = 186.1;   // full-clip.mov actual duration
const SCREEN_S  = 54;      // how long the viewer sees it
const RATE      = SOURCE_S / SCREEN_S;  // ≈ 3.44×

const INTRO_S   = 2;
const OUTRO_S   = 3;
const CROSS_S   = 1.0;     // crossfade overlap at intro→clip and clip→outro

// Clip starts CROSS_S before intro ends (they overlap during the fade)
const CLIP_START_S  = INTRO_S - CROSS_S;
const OUTRO_START_S = CLIP_START_S + SCREEN_S - CROSS_S;
const TOTAL_S       = OUTRO_START_S + OUTRO_S;
const TOTAL_FRAMES  = Math.ceil(TOTAL_S * FPS);

// ── Chapter labels ─────────────────────────────────────────────────────────
// Each label appears relative to clip-playback time (in SCREEN seconds)
const CHAPTERS = [
  { screenStart: 0,    screenEnd: 13,   text: "Explore real GO Transit routes on a live map." },
  { screenStart: 13,   screenEnd: 27,   text: "Draw your own route, add stops, set a schedule." },
  { screenStart: 27,   screenEnd: 40,   text: "Watch your route run as a time-of-day simulation." },
  { screenStart: 40,   screenEnd: 54,   text: "Simulate the full GO network at any time of day." },
];

// ── Helpers ────────────────────────────────────────────────────────────────
const f     = (s: number) => Math.round(s * FPS);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

function fadeIn(frame: number, startS: number, durS = 0.5) {
  return clamp(interpolate(frame, [f(startS), f(startS + durS)], [0, 1]));
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
      background: "linear-gradient(to top, rgba(10,22,40,0.78) 0%, transparent 42%)",
    }} />
  );
}

function ChapterLabel({ text, opacity, slideY }: {
  text: string; opacity: number; slideY: number;
}) {
  return (
    <div style={{
      position: "absolute", bottom: 64, left: 64, right: 64,
      opacity, transform: `translateY(${slideY}px)`,
    }}>
      <div style={{
        fontSize: 28, fontWeight: 600, color: YELLOW,
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: 1.4,
        textShadow: "0 2px 16px rgba(0,0,0,0.7)",
        letterSpacing: "-0.2px",
      }}>
        {text}
      </div>
    </div>
  );
}

// ── Main composition ────────────────────────────────────────────────────────
export const TransitFlowDemo = () => {
  const frame = useCurrentFrame();

  // timeline seconds (absolute, from frame 0)
  const clipTimelineStart = CLIP_START_S;
  const clipTimelineEnd   = CLIP_START_S + SCREEN_S;

  // ── Intro ──────────────────────────────────────────────────────────────
  const introBgOp = clamp(interpolate(
    frame,
    [f(INTRO_S - CROSS_S), f(INTRO_S)],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.ease) }
  ));
  const logoScale = spring({ frame, fps: FPS, from: 0.7, to: 1, config: { damping: 14, stiffness: 120 } });
  const logoOp    = fadeIn(frame, 0, 0.4);
  const taglineOp = fadeIn(frame, 0.6, 0.5);

  // ── Clip opacity (fade in from intro, fade out into outro) ──────────────
  const clipFadeIn = clamp(interpolate(
    frame,
    [f(clipTimelineStart), f(clipTimelineStart + CROSS_S)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.ease) }
  ));
  const clipFadeOut = clamp(interpolate(
    frame,
    [f(clipTimelineEnd - CROSS_S), f(clipTimelineEnd)],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.ease) }
  ));
  const clipOp = clamp(Math.min(clipFadeIn, clipFadeOut));

  // ── Outro ──────────────────────────────────────────────────────────────
  const outroOp = clamp(interpolate(
    frame,
    [f(OUTRO_START_S), f(OUTRO_START_S + CROSS_S)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.ease) }
  ));
  const outroScale = spring({
    frame: Math.max(0, frame - f(OUTRO_START_S)),
    fps: FPS, from: 0.88, to: 1, config: { damping: 16 },
  });

  // ── Chapter label (which chapter is active right now?) ─────────────────
  // Convert absolute frame → clip-playback seconds
  const clipPlayS = (frame / FPS - CLIP_START_S);

  const activeChapter = CHAPTERS.find(
    (ch) => clipPlayS >= ch.screenStart && clipPlayS < ch.screenEnd
  );

  let labelOp = 0;
  let labelY  = 0;

  if (activeChapter) {
    const absStart = CLIP_START_S + activeChapter.screenStart;
    const absEnd   = CLIP_START_S + activeChapter.screenEnd;
    labelOp = clamp(interpolate(
      frame,
      [f(absStart), f(absStart + 0.6), f(absEnd - 0.6), f(absEnd)],
      [0, 1, 1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    ));
    labelY = interpolate(frame, [f(absStart), f(absStart + 0.6)], [20, 0], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
  }

  return (
    <AbsoluteFill style={{ background: DARK, fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Full clip ─────────────────────────────────────────────────── */}
      {clipOp > 0.01 && (
        <AbsoluteFill style={{ opacity: clipOp }}>
          <Video
            src={staticFile("full-clip.mov")}
            playbackRate={RATE}
            endAt={Math.round(SOURCE_S * FPS)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <Vignette />
          {activeChapter && (
            <ChapterLabel text={activeChapter.text} opacity={labelOp} slideY={labelY} />
          )}
        </AbsoluteFill>
      )}

      {/* ── Intro overlay ─────────────────────────────────────────────── */}
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

      {/* ── Outro overlay ─────────────────────────────────────────────── */}
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

export { TOTAL_FRAMES };
