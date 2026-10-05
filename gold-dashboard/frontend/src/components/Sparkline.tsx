interface Props {
  values: number[];
  positive: boolean;
}

const W = 96;
const H = 28;

export default function Sparkline({ values, positive }: Props) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || max * 0.01 || 1;

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / span) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const dimPts = pts.slice(0, -1).join(" ");
  const lastTwo = pts.slice(-2).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sparkline" aria-hidden="true">
      <polyline points={dimPts} className="sparkline-dim" fill="none" />
      <polyline points={lastTwo} className={positive ? "sparkline-accent-up" : "sparkline-accent-down"} fill="none" />
    </svg>
  );
}
