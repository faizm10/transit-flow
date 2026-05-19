interface Point { day: string; count: number }

interface Props {
  data: Point[];
  label: string;
  color?: string;
}

/** Sanitise a string for use as an SVG element id (no spaces / special chars). */
function toSvgId(s: string) {
  return "spark-" + s.replace(/[^a-z0-9]/gi, "-").toLowerCase();
}

export function Sparkline({ data, label, color = "#007A33" }: Props) {
  const W = 400;
  const H = 90;
  const PAD_X = 2;
  const PAD_Y = 6;

  const counts = data.map((d) => d.count);
  const max = Math.max(...counts, 1);
  const min = 0; // always anchor baseline at 0
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = PAD_X + (i / Math.max(data.length - 1, 1)) * (W - PAD_X * 2);
    const y = H - PAD_Y - ((d.count - min) / range) * (H - PAD_Y * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const gradId = toSvgId(label);

  const area = [
    `M ${points[0]}`,
    ...points.slice(1).map((p) => `L ${p}`),
    `L ${(W - PAD_X).toFixed(1)},${H}`,
    `L ${PAD_X},${H}`,
    "Z",
  ].join(" ");

  const line = [`M ${points[0]}`, ...points.slice(1).map((p) => `L ${p}`)].join(" ");

  const total = counts.reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{total.toLocaleString()}</p>
      <p className="mb-4 text-xs text-gray-400">total in period</p>

      {data.length > 1 ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full overflow-visible"
          preserveAspectRatio="none"
          style={{ height: 72 }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={color} stopOpacity="0.01" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradId})`} />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <div className="flex h-[72px] items-center justify-center rounded-xl bg-gray-50 text-xs text-gray-300">
          No data yet
        </div>
      )}
    </div>
  );
}
