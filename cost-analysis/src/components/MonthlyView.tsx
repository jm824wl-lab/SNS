import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AccountSummary } from '../lib/aggregate';
import { exportTable } from '../lib/download';
import { ExportButton } from './ExportButton';
import { man, monthLabel, yen } from '../lib/format';
import { CATEGORIES, COST_CATEGORIES, type Category } from '../lib/types';
import { Legend, YenTooltip } from './charts';
import { axisTick, useThemeColors } from './theme';

interface Props {
  accounts: AccountSummary[];
  months: string[];
  onSelectAccount: (account: string) => void;
}

const MAX_LINES = 8;

export function MonthlyView({ accounts, months, onSelectAccount }: Props) {
  const c = useThemeColors();
  const [includeRevenue, setIncludeRevenue] = useState(true);

  const costAccounts = useMemo(
    () => accounts.filter((a) => COST_CATEGORIES.has(a.category)).sort((a, b) => b.total - a.total),
    [accounts],
  );

  // 科目 → 色スロット。選択時に空いている最小のスロットを割り当て、他の科目の色は変えない
  const [slots, setSlots] = useState<Record<string, number>>(() =>
    Object.fromEntries(costAccounts.slice(0, 5).map((a, i) => [a.account, i])),
  );
  const selected = Object.keys(slots).filter((acc) => costAccounts.some((a) => a.account === acc));

  const toggle = (acc: string) => {
    setSlots((s) => {
      const next = { ...s };
      if (acc in next) {
        delete next[acc];
        return next;
      }
      const used = new Set(Object.values(next));
      const free = Array.from({ length: MAX_LINES }, (_, i) => i).find((i) => !used.has(i));
      if (free === undefined) return s;
      next[acc] = free;
      return next;
    });
  };

  const chartData = useMemo(
    () =>
      months.map((m) => {
        const row: Record<string, number | string> = { month: monthLabel(m) };
        for (const acc of selected) row[acc] = costAccounts.find((a) => a.account === acc)?.byMonth[m] ?? 0;
        return row;
      }),
    [months, selected, costAccounts],
  );

  const groups = useMemo(() => {
    const cats: Category[] = CATEGORIES.filter((cat) => (includeRevenue && cat === '売上') || COST_CATEGORIES.has(cat));
    return cats
      .map((cat) => {
        const list = accounts.filter((a) => a.category === cat).sort((a, b) => b.total - a.total);
        const subtotal: Record<string, number> = {};
        for (const m of months) subtotal[m] = list.reduce((t, a) => t + (a.byMonth[m] ?? 0), 0);
        return { cat, list, subtotal, total: list.reduce((t, a) => t + a.total, 0) };
      })
      .filter((g) => g.list.length > 0);
  }, [accounts, months, includeRevenue]);

  const costGroups = groups.filter((g) => g.cat !== '売上');
  const costTotalByMonth = (m: string) => costGroups.reduce((t, g) => t + g.subtotal[m], 0);
  const costTotal = costGroups.reduce((t, g) => t + g.total, 0);

  const exportCsv = () => {
    const rows: (string | number)[][] = [['区分', '勘定科目', ...months.map(monthLabel), '合計']];
    for (const g of groups) {
      for (const a of g.list) rows.push([g.cat, a.account, ...months.map((m) => Math.round(a.byMonth[m] ?? 0)), Math.round(a.total)]);
      rows.push([g.cat, `${g.cat} 計`, ...months.map((m) => Math.round(g.subtotal[m])), Math.round(g.total)]);
    }
    rows.push(['', '費用合計', ...months.map((m) => Math.round(costTotalByMonth(m))), Math.round(costTotal)]);
    return exportTable('月次推移表.csv', rows);
  };

  return (
    <>
      <section className="card">
        <h2>科目別の月次推移</h2>
        <p className="muted">比較する科目を選択(最大{MAX_LINES}科目)</p>
        <div className="checks">
          {costAccounts.map((a) => (
            <label key={a.account}>
              <input
                type="checkbox"
                checked={a.account in slots}
                disabled={!(a.account in slots) && selected.length >= MAX_LINES}
                onChange={() => toggle(a.account)}
              />
              {a.account}
            </label>
          ))}
        </div>
        {selected.length > 0 && (
          <>
            <Legend items={selected.map((acc) => ({ label: acc, color: c.series[slots[acc]], line: true }))} />
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="month" tick={axisTick(c)} tickLine={false} axisLine={{ stroke: c.grid }} />
                <YAxis tickFormatter={man} tick={axisTick(c)} tickLine={false} axisLine={false} width={56} />
                <Tooltip content={<YenTooltip />} />
                {selected.map((acc) => (
                  <Line
                    key={acc}
                    dataKey={acc}
                    name={acc}
                    stroke={c.series[slots[acc]]}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, stroke: c['surface-1'], fill: c.series[slots[acc]] }}
                    activeDot={{ r: 5 }}
                    type="monotone"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </section>

      <section className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>月次推移表</h2>
          <span className="spacer" />
          <label className="row muted">
            <input type="checkbox" checked={includeRevenue} onChange={(e) => setIncludeRevenue(e.target.checked)} />
            売上を表示
          </label>
          <ExportButton onExport={exportCsv} />
        </div>
        <div className="table-wrap" style={{ maxHeight: 640 }}>
          <table>
            <thead>
              <tr>
                <th className="sticky">勘定科目</th>
                {months.map((m) => (
                  <th key={m} className="num">
                    {monthLabel(m)}
                  </th>
                ))}
                <th className="num">合計</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.cat} group={g} months={months} onSelectAccount={onSelectAccount} />
              ))}
              {costGroups.length > 0 && (
                <tr className="total">
                  <td className="sticky">費用合計</td>
                  {months.map((m) => (
                    <td key={m} className="num">
                      {yen(costTotalByMonth(m))}
                    </td>
                  ))}
                  <td className="num">{yen(costTotal)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function GroupRows({
  group,
  months,
  onSelectAccount,
}: {
  group: { cat: Category; list: AccountSummary[]; subtotal: Record<string, number>; total: number };
  months: string[];
  onSelectAccount: (a: string) => void;
}) {
  return (
    <>
      {group.list.map((a) => (
        <tr key={a.account} className="clickable" onClick={() => onSelectAccount(a.account)}>
          <td className="sticky">{a.account}</td>
          {months.map((m) => (
            <td key={m} className="num">
              {a.byMonth[m] ? yen(a.byMonth[m]) : '—'}
            </td>
          ))}
          <td className="num">{yen(a.total)}</td>
        </tr>
      ))}
      {group.list.length > 1 && (
      <tr className="subtotal">
        <td className="sticky">{group.cat} 計</td>
        {months.map((m) => (
          <td key={m} className="num">
            {yen(group.subtotal[m])}
          </td>
        ))}
        <td className="num">{yen(group.total)}</td>
      </tr>
      )}
    </>
  );
}
