/**
 * TransitFlow demo video — built from 4 real screen-recording clips.
 * Target: ≤ 60 s total
 *
 * clip1.mov  12.1 s source → 10 s screen  @ 1.2×
 * clip2.mov  71.9 s source → 17 s screen  @ ~4.2×
 * clip3.mov  29.6 s source → 12 s screen  @ ~2.5×
 * clip4.mov  43.6 s source → 14 s screen  @ ~3.1×
 *
 * Intro 2 s + clips 53 s + outro 3 s − 3 crossfades (1 s each) = 55 s
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
const GREEN   = "#007A33";
const DARK    = "#0a1628";
const WHITE   = "#ffffff";
const YELLOW  = "#FFD047";   // feature label text

// ── Clip definitions ──────────────────────────────────────────────────────
// screenS  = how long the viewer sees this clip
// sourceS  = actual recording length (used to compute playbackRate)
const CLIPS = [
  { file: "clip1.mov", label: "Browse real GO Transit routes on a live map.",       screenS: 10, sourceS: 12.1 },
  { file: "clip2.mov", label: "Draw your own route, add stops, set a schedule.",    screenS: 17, sourceS: 71.9 },
  { file: "clip3.mov", label: "Watch your route run as a time simulation.",         screenS: 12, sourceS: 29.6 },
  { file: "clip4.mov", label: "Simulate the entire GO network at any time of day.", screenS: 14, sourceS: 43.6 },
].map(c => ({ ...c, playbackRate: c.sourceS / c.screenS }));

const FPS     = 30;
const INTRO_S = 2;
const CROSS_S = 1.0;  // crossfade overlap between clips (both visible simultaneously)
const OUTRO_S = 3;

// Pre-compute timeline — each clip starts CROSS_S before the previous one ends
// so they overlap during the transition, producing a true crossfade.
function buildTimeline() {
  let cursor = INTRO_S;
  return CLIPS.map((c, i) => {
    const startS = i === 0 ? cursor : cursor - CROSS_S;
    const endS   = startS + c.screenS;
    cursor = endS;
    return { ...c, startS, endS };
  });
}

const TIMELINE = buildTimeline();
const TOTAL_S  = TIMELINE[TIMELINE.length - 1].endS + OUTRO_S;
const TOTAL_FRAMES = Math.ceil(TOTAL_S * FPS);

// ── Helpers ───────────────────────────────────────────────────────────────
const f = (s: number) => Math.round(s * FPS);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

function fadeIn(frame: number, startS: number, durS = 0.5) {
  return clamp(interpolate(frame, [f(startS), f(startS + durS)], [0, 1]));
}
function fadeOut(frame: number, startS: number, durS = 0.5) {
  return clamp(interpolate(frame, [f(startS), f(startS + durS)], [1, 0]));
}
function ramp(frame: number, inS: number, holdS: number, outS: number) {
  return clamp(
    interpolate(
      frame,
      [f(inS), f(inS + 0.4), f(inS + holdS), f(inS + holdS + 0.4)],
      [0, 1, 1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    )
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

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

/** Dark vignette so text stays readable over any map background */
function Vignette() {
  return (
    <div style={{
      position: "absolute", inset: 0, pointerEvents: "none",
      background: "linear-gradient(to top, rgba(10,22,40,0.75) 0%, transparent 45%)",
    }} />
  );
}

/** Simple sentence label — no badges, no pills, just clean text */
function FeatureLabel({ title, opacity, slideY }: {
  title: string; opacity: number; slideY: number;
}) {
  return (
    <div style={{
      position: "absolute", bottom: 64, left: 64,
      opacity, transform: `translateY(${slideY}px)`,
    }}>
      <div style={{
        fontSize: 28, fontWeight: 600, color: YELLOW,
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: 1.4,
        textShadow: "0 2px 16px rgba(0,0,0,0.7)",
        letterSpacing: "-0.2px",
      }}>
        {title}
      </div>
    </div>
  );
}


// ── Main composition ───────────────────────────────────────────────────────
export const TransitFlowDemo = () => {
  const frame = useCurrentFrame();

  // ── INTRO (0 → INTRO_S) ────────────────────────────────────────────────
  // Fades out smoothly into the first clip (overlapping by CROSS_S)
  const introBgOp = clamp(interpolate(
    frame,
    [f(INTRO_S - CROSS_S), f(INTRO_S)],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.in(Easing.ease) }
  ));
  const logoScale  = spring({ frame, fps: FPS, from: 0.7, to: 1, config: { damping: 14, stiffness: 120 } });
  const logoOp     = fadeIn(frame, 0, 0.4);
  const taglineOp  = fadeIn(frame, 0.6, 0.5);

  // ── OUTRO ─────────────────────────────────────────────────────────────
  // Fades in over the tail of the last clip (crossfade in)
  const outroStartS = TOTAL_S - OUTRO_S;
  const outroOp     = clamp(interpolate(
    frame,
    [f(outroStartS), f(outroStartS + CROSS_S)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.out(Easing.ease) }
  ));
  const outroScale  = spring({
    frame: Math.max(0, frame - f(outroStartS)),
    fps: FPS, from: 0.88, to: 1, config: { damping: 16 },
  });

  return (
    <AbsoluteFill style={{ background: DARK, fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── CLIPS with crossfade transitions ──────────────────────────── */}
      {TIMELINE.map((clip, i) => {
        const { startS, endS } = clip;
        const isFirst = i === 0;
        const isLast  = i === CLIPS.length - 1;

        // Fade-in: ease out (starts fast, settles smoothly)
        const fadeInOp = interpolate(
          frame,
          [f(startS), f(startS + CROSS_S)],
          [isFirst ? 0 : 0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: Easing.out(Easing.ease) }
        );

        // Fade-out: ease in (lingers then drops — feels like a dissolve)
        const fadeOutOp = isLast ? 1 : interpolate(
          frame,
          [f(endS - CROSS_S), f(endS)],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: Easing.in(Easing.ease) }
        );

        const clipOp = clamp(Math.min(fadeInOp, fadeOutOp));
        if (clipOp < 0.01 && frame > f(endS)) return null;

        // Label: slides up + fades in for the first 4 s after the crossfade settles,
        // then fades out 1 s before the next transition starts
        const labelStart = startS + CROSS_S * 0.5;
        const labelEnd   = isLast ? endS - 1 : endS - CROSS_S - 0.5;
        const labelOp    = clamp(
          interpolate(frame,
            [f(labelStart), f(labelStart + 0.5), f(labelEnd - 0.5), f(labelEnd)],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          )
        );
        const labelY = interpolate(frame, [f(labelStart), f(labelStart + 0.6)], [20, 0], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });

        return (
          <AbsoluteFill key={i} style={{ opacity: clipOp }}>
            <Video
              src={staticFile(clip.file)}
              playbackRate={clip.playbackRate}
              endAt={Math.round(clip.sourceS * FPS)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <Vignette />
            <FeatureLabel title={clip.label} opacity={labelOp} slideY={labelY} />
          </AbsoluteFill>
        );
      })}

      {/* ── INTRO overlay ─────────────────────────────────────────────── */}
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

      {/* ── OUTRO overlay ─────────────────────────────────────────────── */}
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

// Export computed total for Root.tsx
export { TOTAL_FRAMES };
