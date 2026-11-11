import { yen } from '../lib/format';

interface TooltipItem {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
}

/** 金額用ツールチップ(値はテキスト色、色は横のマーカーのみで示す) */
export function YenTooltip(props: { active?: boolean; label?: unknown; payload?: readonly TooltipItem[]; total?: boolean }) {
  const { active, payload, label, total } = props;
  if (!active || !payload || payload.length === 0) return null;
  const items = payload.filter((p) => typeof p.value === 'number');
  const sum = items.reduce((t, p) => t + (p.value as number), 0);
  return (
    <div className="tooltip">
      <div className="t-title">{String(label ?? '')}</div>
      {items.map((p) => (
        <div className="t-row" key={String(p.dataKey ?? p.name)}>
          <span>
            <span className="legend">
              <span className="swatch" style={{ background: p.color }} />
            </span>
            {p.name}
          </span>
          <span>{yen(p.value as number)}</span>
        </div>
      ))}
      {total && items.length > 1 && (
        <div className="t-row" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
          <span>合計</span>
          <span>{yen(sum)}</span>
        </div>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <span className={`swatch${i.line ? ' line' : ''}`} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
