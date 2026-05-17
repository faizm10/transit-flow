/**
 * TransitFlow demo video.
 *
 * Background: the raw screen recording at ./assets/demo-raw.mp4
 * On top: animated title cards, feature labels, logo intro and outro.
 *
 * Adjust SEGMENT_* constants to match where each section starts/ends
 * in your recording (in seconds), then re-run `npm run video:preview`.
 */

import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Video,
  Easing,
  staticFile,
} from "remotion";

// ─── Tweak these to match your recording timestamps (in seconds) ─────────────
const SEGMENTS = {
  landing:   { start:  0, end:  5 },
  explore:   { start:  5, end: 20 },
  design:    { start: 20, end: 45 },
  schedule:  { start: 45, end: 55 },
  simulate:  { start: 55, end: 70 },
  community: { start: 70, end: 80 },
  account:   { start: 80, end: 88 },
};

// Total raw recording length in seconds — update after you record
const RAW_DURATION_S = 88;

// ─── Brand colours ────────────────────────────────────────────────────────────
const GREEN  = "#007A33";
const DARK   = "#0a1628";
const WHITE  = "#ffffff";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toFrames(seconds: number, fps: number) {
  return Math.round(seconds * fps);
}

function fadeIn(frame: number, startFrame: number, durationFrames = 15) {
  return interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function fadeOut(frame: number, startFrame: number, durationFrames = 15) {
  return interpolate(frame, [startFrame, startFrame + durationFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function slideUpFade(
  frame: number,
  startFrame: number,
  endFrame: number,
  distance = 28
) {
  const opacity = interpolate(
    frame,
    [startFrame, startFrame + 18, endFrame - 12, endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const y = interpolate(
    frame,
    [startFrame, startFrame + 18],
    [distance, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }
  );
  return { opacity, y };
}

// ─── Components ───────────────────────────────────────────────────────────────

function Logo({ size = 64 }: { size?: number }) {
  const r = size * 0.22;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: GREEN,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 0 ${size * 0.8}px rgba(0,122,51,0.55)`,
        flexShrink: 0,
      }}
    >
      <svg
        width={size * 0.54}
        height={size * 0.54}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2"
      >
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M8 6V4M16 6V4" />
      </svg>
    </div>
  );
}

/** Pill badge shown above each feature title */
function Pill({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "inline-block",
        background: "rgba(0,122,51,0.18)",
        border: "1px solid rgba(0,122,51,0.45)",
        borderRadius: 99,
        padding: "4px 14px",
        marginBottom: 10,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.09em",
          color: "#4ade80",
          textTransform: "uppercase" as const,
          fontFamily: "system-ui",
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** Large feature title over the recording */
function FeatureOverlay({
  pill,
  title,
  frame,
  startFrame,
  endFrame,
}: {
  pill: string;
  title: string;
  frame: number;
  startFrame: number;
  endFrame: number;
}) {
  const { opacity, y } = slideUpFade(frame, startFrame, endFrame);
  const lines = title.split("\n");

  return (
    <div
      style={{
        position: "absolute",
        bottom: 64,
        left: 64,
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      <Pill label={pill} />
      <div
        style={{
          fontSize: 52,
          fontWeight: 800,
          color: WHITE,
          fontFamily: "system-ui, -apple-system, sans-serif",
          lineHeight: 1.1,
          textShadow: "0 3px 28px rgba(0,0,0,0.55)",
        }}
      >
        {lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}

/** Dark vignette at the bottom so text is legible over any map background */
function BottomVignette() {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 300,
        background:
          "linear-gradient(to top, rgba(10,22,40,0.72) 0%, transparent 100%)",
        pointerEvents: "none",
      }}
    />
  );
}

// ─── Main composition ─────────────────────────────────────────────────────────
export const TransitFlowDemo = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const f = (s: number) => toFrames(s, fps);

  // ── Intro: 0 → 3 s ───────────────────────────────────────────────────────
  const INTRO_IN  = 0;
  const INTRO_OUT = f(2.5);
  const introBg   = frame < f(3) ? 1 : fadeOut(frame, INTRO_OUT, 18);
  const logoScale = spring({ frame, fps, from: 0.72, to: 1, config: { damping: 14, stiffness: 130 } });
  const logoOp    = fadeIn(frame, INTRO_IN, 14);

  // ── Video starts at intro end, offset so it aligns ────────────────────────
  //    We start the <Video> slightly before the intro fades so there's no gap.
  const VIDEO_START_FRAME = f(2.8); // frame at which the raw video begins playing
  const videoOpacity = frame < VIDEO_START_FRAME
    ? 0
    : interpolate(frame, [VIDEO_START_FRAME, VIDEO_START_FRAME + 14], [0, 1], {
        extrapolateRight: "clamp",
      });

  // ── Feature overlays: keyed to SEGMENTS ──────────────────────────────────
  const seg = SEGMENTS;
  const features: { pill: string; title: string; seg: keyof typeof SEGMENTS }[] = [
    { pill: "Live GTFS data",           title: "Explore the\nGO network",      seg: "explore"   },
    { pill: "Route Builder",            title: "Design your\nown route",        seg: "design"    },
    { pill: "Frequency & Fixed times",  title: "Set a custom\nschedule",        seg: "schedule"  },
    { pill: "Time simulation",          title: "Simulate vehicle\nmovement",    seg: "simulate"  },
    { pill: "Community feed",           title: "Share with\nthe community",     seg: "community" },
    { pill: "Your routes",              title: "Manage your\naccount",           seg: "account"   },
  ];

  // ── Outro: last 4 s ───────────────────────────────────────────────────────
  const OUTRO_START = durationInFrames - f(4);
  const outroOp = fadeIn(frame, OUTRO_START, 20);
  const outroScale = spring({
    frame: Math.max(0, frame - OUTRO_START),
    fps,
    from: 0.82,
    to: 1,
    config: { damping: 14 },
  });

  return (
    <AbsoluteFill
      style={{ background: DARK, fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      {/* ── Logo intro ──────────────────────────────────────────────────────── */}
      <AbsoluteFill
        style={{
          opacity: introBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 22,
          pointerEvents: "none",
          zIndex: frame < f(3) ? 10 : -1,
        }}
      >
        <div style={{ transform: `scale(${logoScale})`, opacity: logoOp, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <Logo size={100} />
          <div style={{ fontSize: 58, fontWeight: 800, color: WHITE, letterSpacing: "-1.5px" }}>
            TransitFlow
          </div>
          <div style={{ fontSize: 20, color: "#4ade80", fontWeight: 500 }}>
            Design. Simulate. Share.
          </div>
        </div>
      </AbsoluteFill>

      {/* ── Screen recording ────────────────────────────────────────────────── */}
      <AbsoluteFill style={{ opacity: videoOpacity }}>
        <Video
          src={staticFile("demo-raw.mp4")}
          startFrom={0}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <BottomVignette />

        {/* Feature label overlays synced to segments */}
        {features.map(({ pill, title, seg: segKey }) => {
          const s = seg[segKey];
          const startF = f(s.start) + (VIDEO_START_FRAME - f(0));
          const endF   = f(s.end)   + (VIDEO_START_FRAME - f(0));
          // Only render within the segment window
          if (frame < startF - 10 || frame > endF + 10) return null;
          return (
            <FeatureOverlay
              key={segKey}
              pill={pill}
              title={title}
              frame={frame}
              startFrame={startF}
              endFrame={endF}
            />
          );
        })}
      </AbsoluteFill>

      {/* ── Outro ───────────────────────────────────────────────────────────── */}
      {frame >= OUTRO_START && (
        <AbsoluteFill
          style={{
            opacity: outroOp,
            background: DARK,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 24,
            zIndex: 20,
          }}
        >
          <div style={{ transform: `scale(${outroScale})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
            <Logo size={90} />
            <div style={{ fontSize: 54, fontWeight: 800, color: WHITE, letterSpacing: "-1.5px" }}>
              TransitFlow
            </div>
            <div style={{ fontSize: 19, color: "#94a3b8", maxWidth: 500, textAlign: "center", lineHeight: 1.55 }}>
              Design and simulate your own transit network.<br />
              No software required.
            </div>
            <div
              style={{
                marginTop: 8,
                background: GREEN,
                borderRadius: 14,
                padding: "14px 38px",
                fontSize: 18,
                fontWeight: 700,
                color: WHITE,
                boxShadow: "0 0 50px rgba(0,122,51,0.45)",
              }}
            >
              transit-flow-two.vercel.app
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
