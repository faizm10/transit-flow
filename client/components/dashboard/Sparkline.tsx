interface Point { day: string; count: number }

interface Props {
  data: Point[];
  label: string;
  color?: string;
}

export function Sparkline({ data, label, color = "#007A33" }: Props) {
  const W = 400;
  const H = 80;
  const PAD = 4;

  const counts = data.map((d) => d.count);
  const max = Math.max(...counts, 1);
  const min = Math.min(...counts, 0);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2);
    const y = H - PAD - ((d.count - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });

  const area = [
    `M ${points[0]}`,
    ...points.slice(1).map((p) => `L ${p}`),
    `L ${W - PAD},${H - PAD}`,
    `L ${PAD},${H - PAD}`,
    "Z",
  ].join(" ");

  const line = [`M ${points[0]}`, ...points.slice(1).map((p) => `L ${p}`)].join(" ");

  const total = counts.reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{total.toLocaleString()}</p>
          <p className="text-xs text-gray-400">last 30 days</p>
        </div>
      </div>

      <div className="mt-4">
        {data.length > 1 ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.15" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#grad-${label})`} />
            <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <div className="flex h-20 items-center justify-center text-xs text-gray-300">
            No data yet
          </div>
        )}
      </div>
    </div>
  );
}
