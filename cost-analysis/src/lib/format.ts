const yenFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });

export function yen(n: number): string {
  return `${n < 0 ? '△' : ''}${yenFmt.format(Math.abs(Math.round(n)))}`;
}

/** グラフ軸用の短縮表記(万円) */
export function man(n: number): string {
  const v = n / 10_000;
  if (Math.abs(v) >= 100) return `${yenFmt.format(Math.round(v))}万`;
  return `${v.toFixed(Math.abs(v) >= 10 ? 0 : 1)}万`;
}

export function pct(r: number | null, digits = 1): string {
  if (r === null || !Number.isFinite(r)) return '—';
  return `${(r * 100).toFixed(digits)}%`;
}

/** 増減率(+12.3% / −4.5%) */
export function delta(r: number | null): string {
  if (r === null || !Number.isFinite(r)) return '—';
  const s = (Math.abs(r) * 100).toFixed(1);
  return r > 0 ? `+${s}%` : r < 0 ? `−${s}%` : '±0.0%';
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}/${m}`;
}
