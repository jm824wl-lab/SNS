import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { breakdown, signedAmount, type AccountSummary, type Dimension } from '../lib/aggregate';
import { downloadCsv } from '../lib/download';
import { man, monthLabel, pct, yen } from '../lib/format';
import type { Entry } from '../lib/types';
import { YenTooltip } from './charts';
import { axisTick, useThemeColors } from './theme';

interface Props {
  account: string | null;
  accounts: AccountSummary[];
  entries: Entry[];
  months: string[];
  onSelectAccount: (account: string) => void;
}

const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: 'partner', label: '取引先別' },
  { key: 'department', label: '部門別' },
  { key: 'counterAccount', label: '相手勘定科目別' },
  { key: 'description', label: '摘要別' },
];
const PAGE = 100;

export function DrilldownView({ account, accounts, entries, months, onSelectAccount }: Props) {
  const c = useThemeColors();
  const [dim, setDim] = useState<Dimension>('partner');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => [...accounts].sort((a, b) => a.account.localeCompare(b.account, 'ja')), [accounts]);
  const summary = accounts.find((a) => a.account === account) ?? null;

  const chart = useMemo(
    () => (summary ? months.map((m) => ({ month: monthLabel(m), amount: summary.byMonth[m] ?? 0 })) : []),
    [summary, months],
  );
  const parts = useMemo(
    () => (summary ? breakdown(entries, summary.account, dim, summary.category) : []),
    [entries, summary, dim],
  );
  const lines = useMemo(() => {
    if (!summary) return [];
    const q = query.trim();
    return entries
      .filter((e) => e.account === summary.account)
      .filter((e) => !q || [e.description, e.partner, e.counterAccount, e.department].some((v) => v.includes(q)))
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id - b.id);
  }, [entries, summary, query]);

  if (!summary) {
    return (
      <section className="card">
        <h2>科目の明細分析</h2>
        <AccountPicker accounts={sorted} value="" onChange={onSelectAccount} />
        <p className="muted">分析する勘定科目を選んでください(他のタブの表やグラフからも選択できます)。</p>
      </section>
    );
  }

  const pages = Math.max(1, Math.ceil(lines.length / PAGE));
  const curPage = Math.min(page, pages - 1);
  const partTotal = parts.reduce((t, p) => t + p.amount, 0);

  const exportCsv = () =>
    downloadCsv(`明細_${summary.account}.csv`, [
      ['日付', '勘定科目', '相手勘定科目', '取引先', '部門', '摘要', '借方金額', '貸方金額', '取込元'],
      ...lines.map((e) => [e.date ?? '', e.account, e.counterAccount, e.partner, e.department, e.description, e.debit, e.credit, e.source]),
    ]);

  return (
    <>
      <section className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <AccountPicker accounts={sorted} value={summary.account} onChange={(a) => { setPage(0); onSelectAccount(a); }} />
          <span className="badge">{summary.category}</span>
          {summary.behavior !== '対象外' && <span className="badge">{summary.behavior}</span>}
          <span className="spacer" />
          <strong style={{ fontSize: 18 }}>{yen(summary.total)}</strong>
          <span className="muted">{summary.count.toLocaleString()}件</span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="month" tick={axisTick(c)} tickLine={false} axisLine={{ stroke: c.grid }} />
            <YAxis tickFormatter={man} tick={axisTick(c)} tickLine={false} axisLine={false} width={56} />
            <Tooltip content={<YenTooltip />} cursor={{ fill: c.grid, opacity: 0.5 }} />
            <Bar dataKey="amount" name={summary.account} fill={c['series-1']} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>内訳</h2>
            <span className="spacer" />
            <select value={dim} onChange={(e) => setDim(e.target.value as Dimension)} aria-label="内訳の軸">
              {DIMENSIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="table-wrap" style={{ maxHeight: 420 }}>
            <table>
              <thead>
                <tr>
                  <th>{DIMENSIONS.find((d) => d.key === dim)?.label.replace('別', '')}</th>
                  <th className="num">金額</th>
                  <th className="num">構成比</th>
                  <th className="num">件数</th>
                </tr>
              </thead>
              <tbody>
                {parts.slice(0, 200).map((p) => (
                  <tr key={p.key} className="clickable" onClick={() => { setQuery(p.key === '(未設定)' ? '' : p.key); setPage(0); }}>
                    <td style={{ whiteSpace: 'normal' }}>{p.key}</td>
                    <td className="num">{yen(p.amount)}</td>
                    <td className="num">{pct(partTotal ? p.amount / partTotal : null)}</td>
                    <td className="num">{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">行をクリックすると明細をその値で絞り込みます。</p>
        </section>

        <section className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>明細</h2>
            <span className="spacer" />
            <input
              type="search"
              placeholder="摘要・取引先で検索"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
            <button className="btn" onClick={exportCsv}>
              CSV出力
            </button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 420 }}>
            <table>
              <thead>
                <tr>
                  <th>日付</th>
                  <th>摘要</th>
                  <th>取引先</th>
                  <th>相手科目</th>
                  <th className="num">金額</th>
                </tr>
              </thead>
              <tbody>
                {lines.slice(curPage * PAGE, (curPage + 1) * PAGE).map((e) => (
                  <tr key={e.id}>
                    <td>{e.date ?? '—'}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 160 }}>{e.description}</td>
                    <td>{e.partner}</td>
                    <td>{e.counterAccount}</td>
                    <td className="num">{yen(signedAmount(e, summary.category))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <span className="muted">{lines.length.toLocaleString()}件</span>
            <button className="btn small" disabled={curPage === 0} onClick={() => setPage(curPage - 1)}>
              前へ
            </button>
            <span>
              {curPage + 1} / {pages}
            </span>
            <button className="btn small" disabled={curPage >= pages - 1} onClick={() => setPage(curPage + 1)}>
              次へ
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

function AccountPicker({ accounts, value, onChange }: { accounts: AccountSummary[]; value: string; onChange: (a: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="勘定科目" style={{ fontSize: 15, fontWeight: 600 }}>
      {!value && <option value="">勘定科目を選択</option>}
      {accounts.map((a) => (
        <option key={a.account} value={a.account}>
          {a.account}
        </option>
      ))}
    </select>
  );
}
