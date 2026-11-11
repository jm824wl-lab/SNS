import { useMemo, useState } from 'react';
import { trendOf, type AccountSummary, type PlSummary } from '../lib/aggregate';
import { downloadCsv } from '../lib/download';
import { delta, monthLabel, pct, yen } from '../lib/format';
import { CATEGORIES, COST_CATEGORIES } from '../lib/types';

type Scope = 'cost' | 'pl' | 'all';
type SortKey = 'account' | 'category' | 'total' | 'share' | 'average' | 'latest' | 'mom' | 'vsAvg' | 'count';

interface Props {
  accounts: AccountSummary[];
  months: string[];
  pl: PlSummary;
  onSelectAccount: (account: string) => void;
}

export function AccountsView({ accounts, months, pl, onSelectAccount }: Props) {
  const [scope, setScope] = useState<Scope>('cost');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'total', desc: true });

  const rows = useMemo(() => {
    const q = query.trim();
    const list = accounts
      .filter((a) =>
        scope === 'cost' ? COST_CATEGORIES.has(a.category) : scope === 'pl' ? a.category !== '貸借対照表' : true,
      )
      .filter((a) => !q || a.account.includes(q))
      .map((a) => {
        const t = trendOf(a, months);
        return {
          a,
          t,
          share: COST_CATEGORIES.has(a.category) && pl.totalCost ? a.total / pl.totalCost : null,
          salesRatio: pl.revenue && a.category !== '貸借対照表' ? a.total / pl.revenue : null,
        };
      });
    const val = (r: (typeof list)[number]): number | string => {
      switch (sort.key) {
        case 'account':
          return r.a.account;
        case 'category':
          return CATEGORIES.indexOf(r.a.category) * 10 + (r.a.behavior === '変動費' ? 0 : 1);
        case 'total':
          return r.a.total;
        case 'share':
          return r.share ?? -Infinity;
        case 'average':
          return r.t.average;
        case 'latest':
          return r.t.latest;
        case 'mom':
          return r.t.momRatio ?? -Infinity;
        case 'vsAvg':
          return r.t.vsAverage ?? -Infinity;
        case 'count':
          return r.a.count;
      }
    };
    return list.sort((x, y) => {
      const a = val(x);
      const b = val(y);
      const cmp = typeof a === 'string' ? a.localeCompare(String(b), 'ja') : a - (b as number);
      return sort.desc ? -cmp : cmp;
    });
  }, [accounts, months, pl, scope, query, sort]);

  const lastMonth = months[months.length - 1];
  const th = (key: SortKey, label: string, num = true) => (
    <th
      className={`sortable${num ? ' num' : ''}`}
      onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'account' && key !== 'category' }))}
      aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}
    >
      {label}
      {sort.key === key ? (sort.desc ? ' ▼' : ' ▲') : ''}
    </th>
  );

  const exportCsv = () => {
    downloadCsv('勘定科目別集計.csv', [
      ['勘定科目', '損益区分', '固変区分', '期間合計', '借方合計', '貸方合計', '費用構成比', '売上高比', '月平均', `最新月(${lastMonth ?? ''})`, '前月比', '平均比', '件数'],
      ...rows.map(({ a, t, share, salesRatio }) => [
        a.account,
        a.category,
        a.behavior,
        Math.round(a.total),
        Math.round(a.debit),
        Math.round(a.credit),
        share === null ? '' : (share * 100).toFixed(2) + '%',
        salesRatio === null ? '' : (salesRatio * 100).toFixed(2) + '%',
        Math.round(t.average),
        Math.round(t.latest),
        t.momRatio === null ? '' : (t.momRatio * 100).toFixed(1) + '%',
        t.vsAverage === null ? '' : (t.vsAverage * 100).toFixed(1) + '%',
        a.count,
      ]),
    ]);
  };

  const sum = rows.reduce((t, r) => t + r.a.total, 0);

  return (
    <section className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>勘定科目別集計</h2>
        <span className="spacer" />
        <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} aria-label="表示する科目">
          <option value="cost">費用科目のみ</option>
          <option value="pl">損益計算書の全科目</option>
          <option value="all">すべての科目(貸借対照表を含む)</option>
        </select>
        <input type="search" placeholder="科目名で検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn" onClick={exportCsv}>
          CSV出力
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {th('account', '勘定科目', false)}
              {th('category', '区分', false)}
              {th('total', '期間合計')}
              {th('share', '費用構成比')}
              <th className="num">売上高比</th>
              {th('average', '月平均')}
              {th('latest', lastMonth ? `${monthLabel(lastMonth)}` : '最新月')}
              {th('mom', '前月比')}
              {th('vsAvg', '平均比')}
              {th('count', '件数')}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, t, share, salesRatio }) => {
              const isCost = COST_CATEGORIES.has(a.category);
              const trendClass = (r: number | null) => (!isCost || r === null ? '' : r > 0.1 ? 'up' : r < -0.1 ? 'down' : '');
              return (
                <tr key={a.account} className="clickable" onClick={() => onSelectAccount(a.account)}>
                  <td>{a.account}</td>
                  <td>
                    <span className="badge">{a.category}</span>{' '}
                    {a.behavior !== '対象外' && (
                      <span className={`badge ${a.behavior === '変動費' ? 'variable' : 'fixed'}`}>{a.behavior}</span>
                    )}
                  </td>
                  <td className="num">{yen(a.total)}</td>
                  <td className="num">{pct(share)}</td>
                  <td className="num">{pct(salesRatio)}</td>
                  <td className="num">{yen(t.average)}</td>
                  <td className="num">{yen(t.latest)}</td>
                  <td className={`num ${trendClass(t.momRatio)}`}>{delta(t.momRatio)}</td>
                  <td className={`num ${trendClass(t.vsAverage)}`}>{delta(t.vsAverage)}</td>
                  <td className="num">{a.count.toLocaleString()}</td>
                </tr>
              );
            })}
            {scope !== 'all' && rows.length > 0 && (
              <tr className="total">
                <td>合計({rows.length}科目)</td>
                <td />
                <td className="num">{scope === 'cost' ? yen(sum) : ''}</td>
                <td className="num">{scope === 'cost' && !query ? '100.0%' : ''}</td>
                <td className="num">{scope === 'cost' ? pct(pl.revenue ? sum / pl.revenue : null) : ''}</td>
                <td colSpan={5} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted">
        金額は費用・資産科目が「借方−貸方」、収益科目が「貸方−借方」。前月比・平均比は費用科目の増加を赤、減少を緑で表示。行をクリックすると明細分析へ移動します。
      </p>
    </section>
  );
}
