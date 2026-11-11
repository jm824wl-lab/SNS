import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccountsView } from './components/AccountsView';
import { DrilldownView } from './components/DrilldownView';
import { ImportPanel, type TableConfig, type TableStat } from './components/ImportPanel';
import { MonthlyView } from './components/MonthlyView';
import { SettingsView } from './components/SettingsView';
import { SummaryView } from './components/SummaryView';
import { applyFilters, fillMonths, monthsOf, plSummary, summarizeAccounts, type Filters } from './lib/aggregate';
import { loadOverrides, saveOverrides, type ClassOverrides } from './lib/classify';
import { monthLabel } from './lib/format';
import { loadFile } from './lib/load';
import { autoMapping, detectHeaderRow, parseTable, type DateOptions } from './lib/parse';
import { sampleLedger } from './lib/sample';
import type { Entry, RawTable } from './lib/types';

type Tab = 'summary' | 'accounts' | 'monthly' | 'drilldown' | 'settings';
const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'サマリー' },
  { key: 'accounts', label: '科目別集計' },
  { key: 'monthly', label: '月次推移' },
  { key: 'drilldown', label: '明細分析' },
  { key: 'settings', label: '科目設定' },
];

function configFor(table: RawTable): TableConfig {
  const headerRow = detectHeaderRow(table.rows);
  return { table, headerRow, mapping: headerRow >= 0 ? autoMapping(table.rows[headerRow]) : {}, enabled: true };
}

function defaultDateOpts(): DateOptions {
  const now = new Date();
  const y = now.getFullYear();
  return { fiscalStartYear: now.getMonth() + 1 >= 4 ? y : y - 1, fiscalStartMonth: 4 };
}

export default function App() {
  // 初回は使い方が分かるようサンプルを表示し、自社データの取込時に置き換える
  const [configs, setConfigs] = useState<TableConfig[]>(() => [{ ...configFor(sampleLedger()), isSample: true }]);
  const [dateOpts, setDateOpts] = useState<DateOptions>(defaultDateOpts);
  const [overrides, setOverrides] = useState<ClassOverrides>(loadOverrides);
  const [filters, setFilters] = useState<Filters>({ fromMonth: null, toMonth: null, department: null });
  const [tab, setTab] = useState<Tab>('summary');
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => saveOverrides(overrides), [overrides]);

  const parsed = useMemo(() => {
    const entries: Entry[] = [];
    const stats: TableStat[] = [];
    for (const cfg of configs) {
      if (!cfg.enabled) {
        stats.push({ entries: 0, skipped: 0, warnings: [] });
        continue;
      }
      try {
        const r = parseTable(cfg.table, cfg.headerRow, cfg.mapping, dateOpts, entries.length);
        // 数十万行の元帳でも落ちないよう、スプレッド構文(引数数に上限あり)ではなくループで追加する
        for (const e of r.entries) entries.push(e);
        stats.push({ entries: r.entries.length, skipped: r.skippedRows, warnings: r.warnings });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        stats.push({ entries: 0, skipped: 0, warnings: [`「${cfg.table.name}」を解析できませんでした(${msg})。列の割り当てを確認してください。`] });
      }
    }
    return { entries, stats };
  }, [configs, dateOpts]);

  const allMonths = useMemo(() => fillMonths(monthsOf(parsed.entries)), [parsed.entries]);
  const departments = useMemo(
    () => [...new Set(parsed.entries.map((e) => e.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja')),
    [parsed.entries],
  );

  const filtered = useMemo(() => applyFilters(parsed.entries, filters), [parsed.entries, filters]);
  const months = useMemo(
    () => allMonths.filter((m) => (!filters.fromMonth || m >= filters.fromMonth) && (!filters.toMonth || m <= filters.toMonth)),
    [allMonths, filters],
  );
  const accounts = useMemo(() => summarizeAccounts(filtered, overrides), [filtered, overrides]);
  const pl = useMemo(() => plSummary(accounts), [accounts]);

  const addTables = useCallback((tables: RawTable[], isSample = false) => {
    setConfigs((prev) => [
      ...prev.filter((c) => !c.isSample),
      ...tables.map((t) => ({ ...configFor(t), isSample })),
    ]);
    setAccount(null);
    setFilters({ fromMonth: null, toMonth: null, department: null });
    setDataVersion((v) => v + 1);
  }, []);

  const onFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    setLoading(true);
    const errors: string[] = [];
    const tables: RawTable[] = [];
    for (const f of files) {
      try {
        tables.push(...(await loadFile(f)));
      } catch (e) {
        errors.push(e instanceof Error ? e.message : `「${f.name}」を読み込めませんでした。`);
      }
    }
    setLoading(false);
    if (errors.length) setError(errors.join('\n'));
    if (tables.length) addTables(tables);
  };

  // ページのどこにドロップしても取り込む(枠外へのドロップでブラウザがファイルを開いて画面が消えるのを防ぐ)
  const onFilesRef = useRef(onFiles);
  useEffect(() => {
    onFilesRef.current = onFiles;
  });
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) void onFilesRef.current(files);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const selectAccount = (a: string) => {
    setAccount(a);
    setTab('drilldown');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const hasData = parsed.entries.length > 0;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>総勘定元帳 コスト分析</h1>
          <p>元帳・仕訳帳を取り込み、勘定科目ごとの集計・月次推移・固定費/変動費・損益分岐点を分析します</p>
        </div>
      </header>

      <ImportPanel
        configs={configs}
        stats={parsed.stats}
        dateOpts={dateOpts}
        error={error}
        loading={loading}
        onFiles={onFiles}
        onSample={() => addTables([sampleLedger()], true)}
        onChange={(i, cfg) =>
          setConfigs((prev) =>
            prev.map((c, j) => {
              if (j !== i) return c;
              // 見出し行を変えた場合は列割り当てを再判定する
              if (cfg.headerRow !== c.headerRow) {
                return { ...cfg, mapping: cfg.headerRow >= 0 ? autoMapping(cfg.table.rows[cfg.headerRow]) : {} };
              }
              return cfg;
            }),
          )
        }
        onRemove={(i) => {
          setConfigs((prev) => prev.filter((_, j) => j !== i));
          setDataVersion((v) => v + 1);
        }}
        onClear={() => {
          setConfigs([]);
          setAccount(null);
          setDataVersion((v) => v + 1);
        }}
        onDateOpts={setDateOpts}
      />

      {hasData && (
        <>
          <div className="filters">
            <label>
              期間
              <select
                value={filters.fromMonth ?? ''}
                onChange={(e) => setFilters({ ...filters, fromMonth: e.target.value || null })}
                aria-label="開始月"
              >
                <option value="">最初から</option>
                {allMonths.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
              〜
              <select
                value={filters.toMonth ?? ''}
                onChange={(e) => setFilters({ ...filters, toMonth: e.target.value || null })}
                aria-label="終了月"
              >
                <option value="">最後まで</option>
                {allMonths.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            {departments.length > 0 && (
              <label>
                部門
                <select
                  value={filters.department ?? '\u0000all'}
                  onChange={(e) => setFilters({ ...filters, department: e.target.value === '\u0000all' ? null : e.target.value })}
                >
                  <option value={'\u0000all'}>全部門</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(filters.fromMonth || filters.toMonth || filters.department !== null) && (
              <button className="btn small" onClick={() => setFilters({ fromMonth: null, toMonth: null, department: null })}>
                絞り込み解除
              </button>
            )}
            <span className="muted">
              明細 {filtered.length.toLocaleString()} 件 / {accounts.length} 科目
            </span>
          </div>

          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </nav>

          {tab === 'summary' && <SummaryView accounts={accounts} months={months} pl={pl} onSelectAccount={selectAccount} />}
          {tab === 'accounts' && <AccountsView accounts={accounts} months={months} pl={pl} onSelectAccount={selectAccount} />}
          {tab === 'monthly' && <MonthlyView key={dataVersion} accounts={accounts} months={months} onSelectAccount={selectAccount} />}
          {tab === 'drilldown' && (
            <DrilldownView account={account} accounts={accounts} entries={filtered} months={months} onSelectAccount={setAccount} />
          )}
          {tab === 'settings' && <SettingsView accounts={accounts} overrides={overrides} onChange={setOverrides} />}
        </>
      )}
    </div>
  );
}
