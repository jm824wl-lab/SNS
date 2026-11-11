import { useMemo, useState } from 'react';
import type { AccountSummary } from '../lib/aggregate';
import { guessClass, type ClassOverrides } from '../lib/classify';
import { yen } from '../lib/format';
import { BEHAVIORS, CATEGORIES, type AccountClass } from '../lib/types';

interface Props {
  accounts: AccountSummary[];
  overrides: ClassOverrides;
  onChange: (o: ClassOverrides) => void;
}

export function SettingsView({ accounts, overrides, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState(false);
  const list = useMemo(
    () =>
      [...accounts]
        .filter((a) => !query.trim() || a.account.includes(query.trim()))
        .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || b.total - a.total),
    [accounts, query],
  );

  const set = (account: string, cls: AccountClass) => {
    const next = { ...overrides };
    const guess = guessClass(account);
    if (guess.category === cls.category && guess.behavior === cls.behavior) delete next[account];
    else next[account] = cls;
    onChange(next);
  };

  return (
    <section className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>科目設定(損益区分・固定費/変動費)</h2>
        <span className="spacer" />
        <input type="search" placeholder="科目名で検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        {confirming ? (
          <>
            <span className="muted">すべての変更を取り消しますか?</span>
            <button
              className="btn primary"
              onClick={() => {
                onChange({});
                setConfirming(false);
              }}
            >
              初期値に戻す
            </button>
            <button className="btn" onClick={() => setConfirming(false)}>
              キャンセル
            </button>
          </>
        ) : (
          <button className="btn" disabled={Object.keys(overrides).length === 0} onClick={() => setConfirming(true)}>
            初期値に戻す
          </button>
        )}
      </div>
      <p className="muted">
        科目名から自動判定した区分を初期値として表示しています(固変分解は中小企業庁方式を簡略化した目安)。
        自社の実態に合わせて変更すると、全画面の集計・損益分岐点に即時反映され、このブラウザに保存されます。
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>勘定科目</th>
              <th>損益区分</th>
              <th>固変区分</th>
              <th className="num">期間合計</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const changed = a.account in overrides;
              return (
                <tr key={a.account}>
                  <td>{a.account}</td>
                  <td>
                    <select value={a.category} onChange={(e) => set(a.account, { category: e.target.value as AccountClass['category'], behavior: a.behavior })}>
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={a.behavior} onChange={(e) => set(a.account, { category: a.category, behavior: e.target.value as AccountClass['behavior'] })}>
                      {BEHAVIORS.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </td>
                  <td className="num">{yen(a.total)}</td>
                  <td>{changed && <span className="badge">変更済み</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
