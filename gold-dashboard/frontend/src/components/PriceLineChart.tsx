import { useId, useMemo, useState } from "react";
import type { HistoryPoint, HistoryRange } from "../api";
import { formatPrice } from "../format";

interface Props {
  data: HistoryPoint[];
  range: HistoryRange;
  decimals: number;
  unit: string;
}

const WIDTH = 720;
const HEIGHT = 260;
const PAD_LEFT = 56;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const span = max - min;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual >= 5 ? 5 : residual >= 2 ? 2 : 1) * magnitude;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max; v += step) ticks.push(v);
  return ticks;
}

function formatAxisDate(t: number, range: HistoryRange): string {
  const d = new Date(t * 1000);
  if (range === "1D") {
    return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  }
  if (range === "1Y") {
    return d.toLocaleDateString("ja-JP", { year: "2-digit", month: "numeric" });
  }
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export default function PriceLineChart({ data, range, decimals, unit }: Props) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const { path, areaPath, points, minV, maxV } = useMemo(() => {
    if (data.length === 0) {
      return { path: "", areaPath: "", points: [] as { x: number; y: number }[], minV: 0, maxV: 0 };
    }
    const values = data.map((p) => p.v);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const span = rawMax - rawMin || rawMax * 0.01 || 1;
    const minV = rawMin - span * 0.08;
    const maxV = rawMax + span * 0.08;

    const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;

    const points = data.map((p, i) => {
      const x = PAD_LEFT + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
      const y = PAD_TOP + innerH - ((p.v - minV) / (maxV - minV)) * innerH;
      return { x, y };
    });

    const path = points.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(" ");
    const baseline = PAD_TOP + innerH;
    const areaPath = `${path} L${points[points.length - 1].x.toFixed(2)},${baseline} L${points[0].x.toFixed(2)},${baseline} Z`;

    return { path, areaPath, points, minV, maxV };
  }, [data]);

  if (data.length === 0) {
    return <div className="chart-empty">データがありません</div>;
  }

  const yTicks = niceTicks(minV, maxV);
  const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const xTickIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1];

  const active = hoverIndex !== null ? data[hoverIndex] : null;
  const activePt = hoverIndex !== null ? points[hoverIndex] : null;

  function handlePointer(clientX: number, svgEl: SVGSVGElement) {
    const rect = svgEl.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * WIDTH;
    const ratio = Math.min(Math.max((relX - PAD_LEFT) / innerW, 0), 1);
    const idx = Math.round(ratio * (data.length - 1));
    setHoverIndex(idx);
  }

  return (
    <div className="price-chart">
      <div className="price-chart-toolbar">
        <span className="price-chart-title">
          金価格 ({range}) <span className="price-chart-unit">{unit}</span>
        </span>
        <button
          type="button"
          className="table-toggle"
          onClick={() => setShowTable((s) => !s)}
          aria-pressed={showTable}
        >
          {showTable ? "チャート表示" : "表で表示"}
        </button>
      </div>

      {showTable ? (
        <div className="price-chart-table-wrap">
          <table className="price-chart-table">
            <thead>
              <tr>
                <th>日時</th>
                <th>価格</th>
              </tr>
            </thead>
            <tbody>
              {data
                .slice()
                .reverse()
                .map((p) => (
                  <tr key={p.t}>
                    <td>{new Date(p.t * 1000).toLocaleString("ja-JP")}</td>
                    <td className="num">{formatPrice(p.v, decimals)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="price-chart-svg"
          role="img"
          aria-label={`金価格の推移チャート (${range})`}
          tabIndex={0}
          onPointerMove={(e) => handlePointer(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHoverIndex(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              setHoverIndex((i) => Math.min((i ?? -1) + 1, data.length - 1));
            } else if (e.key === "ArrowLeft") {
              setHoverIndex((i) => Math.max((i ?? data.length) - 1, 0));
            }
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => {
            const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
            const y = PAD_TOP + innerH - ((tick - minV) / (maxV - minV)) * innerH;
            return (
              <g key={tick}>
                <line x1={PAD_LEFT} y1={y} x2={WIDTH - PAD_RIGHT} y2={y} className="chart-gridline" />
                <text x={PAD_LEFT - 8} y={y + 4} className="chart-axis-label" textAnchor="end">
                  {formatPrice(tick, decimals)}
                </text>
              </g>
            );
          })}

          {xTickIdx.map((idx) => (
            <text
              key={idx}
              x={points[idx].x}
              y={HEIGHT - 8}
              className="chart-axis-label"
              textAnchor={idx === 0 ? "start" : idx === data.length - 1 ? "end" : "middle"}
            >
              {formatAxisDate(data[idx].t, range)}
            </text>
          ))}

          <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
          <path d={path} className="chart-line" fill="none" />

          {activePt && (
            <>
              <line
                x1={activePt.x}
                y1={PAD_TOP}
                x2={activePt.x}
                y2={HEIGHT - PAD_BOTTOM}
                className="chart-crosshair"
              />
              <circle cx={activePt.x} cy={activePt.y} r={5} className="chart-dot" />
            </>
          )}
        </svg>
      )}

      {active && activePt && !showTable && (
        <div
          className="chart-tooltip"
          style={{
            left: `${(activePt.x / WIDTH) * 100}%`,
            top: `${(activePt.y / HEIGHT) * 100}%`,
          }}
        >
          <div className="chart-tooltip-value">{formatPrice(active.v, decimals)}</div>
          <div className="chart-tooltip-label">{new Date(active.t * 1000).toLocaleString("ja-JP")}</div>
        </div>
      )}
    </div>
  );
}
