import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { trendOf, type AccountSummary, type PlSummary } from '../lib/aggregate';
import { delta, man, monthLabel, pct, yen } from '../lib/format';
import { COST_CATEGORIES } from '../lib/types';
import { Legend, YenTooltip } from './charts';
import { axisTick, useThemeColors } from './theme';

interface Props {
  accounts: AccountSummary[];
  months: string[];
  pl: PlSummary;
  onSelectAccount: (account: string) => void;
}

type Mode = 'category' | 'behavior';
const CATEGORY_SERIES = ['売上原価', '販管費', '営業外費用', '特別損失'] as const;
const BEHAVIOR_SERIES = ['変動費', '固定費', '対象外'] as const;

export function SummaryView({ accounts, months, pl, onSelectAccount }: Props) {
  const c = useThemeColors();
  const [mode, setMode] = useState<Mode>('behavior');
  const costAccounts = useMemo(() => accounts.filter((a) => COST_CATEGORIES.has(a.category)), [accounts]);

  const series = mode === 'category' ? CATEGORY_SERIES : BEHAVIOR_SERIES;
  const presentSeries = series.filter((s) =>
    costAccounts.some((a) => (mode === 'category' ? a.category : a.behavior) === s && a.total !== 0),
  );
  const seriesColor = (s: string) => c.series[(series as readonly string[]).indexOf(s)];

  const monthly = useMemo(
    () =>
      months.map((m) => {
        const row: Record<string, number | string> = { month: monthLabel(m) };
        for (const s of series) row[s] = 0;
        let revenue = 0;
        for (const a of accounts) {
          const v = a.byMonth[m] ?? 0;
          if (a.category === '売上') revenue += v;
          if (!COST_CATEGORIES.has(a.category)) continue;
          const key = mode === 'category' ? a.category : a.behavior;
          row[key] = (row[key] as number) + v;
        }
        row['売上高'] = revenue;
        return row;
      }),
    [months, accounts, mode, series],
  );

  const top = useMemo(() => {
    const sorted = [...costAccounts].sort((a, b) => b.total - a.total);
    const head = sorted.slice(0, 10).map((a) => ({ account: a.account, total: a.total }));
    const rest = sorted.slice(10).reduce((t, a) => t + a.total, 0);
    if (rest !== 0) head.push({ account: `その他(${sorted.length - 10}科目)`, total: rest });
    return head;
  }, [costAccounts]);

  const alerts = useMemo(() => {
    if (months.length < 3) return [];
    const threshold = Math.max((pl.totalCost / months.length) * 0.005, 10_000);
    return costAccounts
      .map((a) => ({ a, t: trendOf(a, months) }))
      .filter(({ t }) => t.vsAverage !== null && t.vsAverage > 0.3 && t.latest - t.average > threshold)
      .sort((x, y) => y.t.latest - y.t.average - (x.t.latest - x.t.average))
      .slice(0, 8);
  }, [costAccounts, months, pl.totalCost]);

  const hasRevenue = pl.revenue !== 0;
  const lastMonth = months[months.length - 1];

  return (
    <>
      <div className="kpis">
        <Kpi label="売上高" value={yen(pl.revenue)} sub={`${months.length}か月`} />
        <Kpi label="費用合計" value={yen(pl.totalCost)} sub={hasRevenue ? `売上比 ${pct(pl.totalCost / pl.revenue)}` : '売上原価・販管費・営業外・特損'} />
        <Kpi label="売上総利益" value={yen(pl.grossProfit)} sub={hasRevenue ? `粗利率 ${pct(pl.grossProfit / pl.revenue)}` : ''} />
        <Kpi label="営業利益" value={yen(pl.operatingProfit)} sub={hasRevenue ? `営業利益率 ${pct(pl.operatingProfit / pl.revenue)}` : ''} />
        <Kpi label="経常利益" value={yen(pl.ordinaryProfit)} sub={hasRevenue ? `経常利益率 ${pct(pl.ordinaryProfit / pl.revenue)}` : ''} />
        <Kpi
          label="変動費 / 固定費"
          value={`${pct(pl.totalCost ? pl.variableCost / pl.totalCost : null, 0)} / ${pct(pl.totalCost ? pl.fixedCost / pl.totalCost : null, 0)}`}
          sub={`${yen(pl.variableCost)} / ${yen(pl.fixedCost)}`}
        />
        <Kpi label="限界利益率" value={pct(pl.marginalProfitRatio)} sub={`限界利益 ${yen(pl.marginalProfit)}`} />
        <Kpi
          label="損益分岐点売上高"
          value={pl.breakEvenSales !== null ? yen(pl.breakEvenSales) : '—'}
          sub={pl.safetyMargin !== null ? `安全余裕率 ${pct(pl.safetyMargin)}` : '売上と変動費から算出'}
        />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>月次の費用推移と売上高</h2>
            <span className="spacer" />
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} aria-label="費用の内訳">
              <option value="behavior">固定費・変動費別</option>
              <option value="category">損益区分別</option>
            </select>
          </div>
          <Legend
            items={[
              ...presentSeries.map((s) => ({ label: s, color: seriesColor(s) })),
              ...(hasRevenue ? [{ label: '売上高', color: c['text-primary'], line: true }] : []),
            ]}
          />
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={c.grid} />
              <XAxis dataKey="month" tick={axisTick(c)} tickLine={false} axisLine={{ stroke: c.grid }} />
              <YAxis tickFormatter={man} tick={axisTick(c)} tickLine={false} axisLine={false} width={56} />
              <Tooltip content={<YenTooltip />} cursor={{ fill: c.grid, opacity: 0.5 }} />
              {presentSeries.map((s, i) => (
                <Bar
                  key={s}
                  dataKey={s}
                  name={s}
                  stackId="cost"
                  fill={seriesColor(s)}
                  stroke={c['surface-1']}
                  strokeWidth={1}
                  maxBarSize={36}
                  radius={i === presentSeries.length - 1 ? [4, 4, 0, 0] : 0}
                />
              ))}
              {hasRevenue && (
                <Line dataKey="売上高" name="売上高" stroke={c['text-primary']} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: c['surface-1'], fill: c['text-primary'] }} type="monotone" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h2>費用の大きい科目(期間合計)</h2>
          <ResponsiveContainer width="100%" height={Math.max(220, top.length * 28 + 20)}>
            <BarChart data={top} layout="vertical" margin={{ top: 0, right: 64, left: 8, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="account"
                width={110}
                tick={{ fill: c['text-secondary'], fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<YenTooltip />} cursor={{ fill: c.grid, opacity: 0.5 }} />
              <Bar
                dataKey="total"
                name="期間合計"
                fill={c['series-1']}
                radius={[0, 4, 4, 0]}
                barSize={16}
                cursor="pointer"
                onClick={(d) => {
                  const name = (d as unknown as { account?: string }).account;
                  if (name && !name.startsWith('その他(')) onSelectAccount(name);
                }}
              >
                <LabelList dataKey="total" position="right" formatter={(v) => man(Number(v))} fill={c['text-secondary']} fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="muted">棒をクリックすると科目の明細分析を表示します。</p>
        </section>
      </div>

      <section className="card">
        <h2>注目すべき変動({lastMonth ? monthLabel(lastMonth) : '—'} が期間平均を30%以上上回った科目)</h2>
        {months.length < 3 ? (
          <p className="muted">3か月以上のデータがあると、直近月の異常な増加を自動で検出します。</p>
        ) : alerts.length === 0 ? (
          <p className="muted">大きな増加は検出されませんでした。</p>
        ) : (
          <ul className="alert-list">
            {alerts.map(({ a, t }) => (
              <li key={a.account} onClick={() => onSelectAccount(a.account)}>
                <span className="icon" aria-label="注意">
                  ▲
                </span>
                <strong>{a.account}</strong>
                <span>
                  {yen(t.latest)}(期間平均 {yen(t.average)}、{delta(t.vsAverage)})
                </span>
                <span className="muted">前月比 {delta(t.momRatio)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">
          ※ 損益分岐点は「固定費 ÷ 限界利益率」で算出(営業外収益・特別損益は除く)。固定費/変動費の区分は「科目設定」タブで変更できます。
        </p>
      </section>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
