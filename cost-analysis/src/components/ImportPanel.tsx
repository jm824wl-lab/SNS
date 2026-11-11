import { useRef, useState } from 'react';
import { FIELD_LABELS, isJournalMapping, type DateOptions } from '../lib/parse';
import type { ColumnMapping, FieldKey, RawTable } from '../lib/types';

export interface TableConfig {
  table: RawTable;
  headerRow: number;
  mapping: ColumnMapping;
  enabled: boolean;
  /** デモ用サンプル(自社データの取込時に置き換える) */
  isSample?: boolean;
}

export interface TableStat {
  entries: number;
  skipped: number;
  warnings: string[];
  balanceCheck?: { checked: number; matched: number } | null;
}

const LEDGER_FIELDS: FieldKey[] = ['date', 'account', 'counterAccount', 'debit', 'credit', 'amount', 'balance', 'partner', 'department', 'description'];
const JOURNAL_FIELDS: FieldKey[] = [
  'date',
  'debitAccount',
  'debitAmount',
  'creditAccount',
  'creditAmount',
  'partner',
  'department',
  'debitPartner',
  'creditPartner',
  'debitDepartment',
  'creditDepartment',
  'description',
];

interface Props {
  configs: TableConfig[];
  stats: TableStat[];
  dateOpts: DateOptions;
  error: string | null;
  loading: boolean;
  onFiles: (files: File[]) => void;
  onSample: () => void;
  onChange: (index: number, cfg: TableConfig) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  onDateOpts: (o: DateOptions) => void;
}

export function ImportPanel(props: Props) {
  const { configs, stats, dateOpts, error, loading } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <section className="card">
      <h2>総勘定元帳の取込</h2>
      <div
        className={`dropzone${drag ? ' active' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={() => setDrag(false)} // ファイルの受け取りはページ全体のドロップ処理(App)で行う
      >
        <strong>{loading ? '読み込み中…' : 'ここにファイルをドロップ、またはクリックして選択'}</strong>
        <span className="muted">
          CSV / TSV(Shift_JIS・UTF-8 自動判定)、Excel(.xlsx・複数シート可)。総勘定元帳・仕訳帳どちらの形式にも対応
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.tsv,.txt,.xlsx,.xlsm"
          hidden
          onChange={(e) => {
            props.onFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={props.onSample}>
          サンプルデータで試す
        </button>
        {configs.length > 0 && (
          <button className="btn" onClick={props.onClear}>
            すべてクリア
          </button>
        )}
        <span className="spacer" />
        <label className="muted row">
          年が省略された日付の期首(帳票内に「7年」等の表記があればそちらを優先):
          <input
            type="number"
            style={{ width: 80 }}
            value={dateOpts.fiscalStartYear}
            onChange={(e) => props.onDateOpts({ ...dateOpts, fiscalStartYear: Number(e.target.value) || dateOpts.fiscalStartYear })}
          />
          年
          <select
            value={dateOpts.fiscalStartMonth}
            onChange={(e) => props.onDateOpts({ ...dateOpts, fiscalStartMonth: Number(e.target.value) })}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}月
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="privacy">
        🔒 ファイルはこのブラウザ内だけで処理され、サーバーへは送信されません。科目の分類設定のみブラウザに保存されます。
      </p>
      {error && <div className="notice error">{error}</div>}
      {configs.some((c) => c.isSample) && (
        <div className="notice sample">
          <strong>サンプルデータを表示中</strong>:架空の卸売業の1年分(2025年4月〜2026年3月)の総勘定元帳です。
          自社の元帳ファイルを取り込むと、サンプルは自動で置き換わります。
        </div>
      )}

      {configs.map((cfg, i) => (
        <TableConfigView
          key={`${cfg.table.name}-${i}`}
          cfg={cfg}
          stat={stats[i]}
          onChange={(c) => props.onChange(i, c)}
          onRemove={() => props.onRemove(i)}
        />
      ))}
    </section>
  );
}

function TableConfigView({
  cfg,
  stat,
  onChange,
  onRemove,
}: {
  cfg: TableConfig;
  stat?: TableStat;
  onChange: (c: TableConfig) => void;
  onRemove: () => void;
}) {
  const journal = isJournalMapping(cfg.mapping);
  const header = cfg.headerRow >= 0 ? cfg.table.rows[cfg.headerRow] : [];
  const colCount = Math.max(header.length, ...cfg.table.rows.slice(0, 50).map((r) => r.length));
  // 見出しが2段の帳票(2段目に「月 日」など)では2段目の文字も列名に使う
  const subHeader = cfg.headerRow >= 0 ? (cfg.table.rows[cfg.headerRow + 1] ?? []) : [];
  const colName = (i: number) => {
    const own = header[i]?.trim() || (cfg.mapping.date === i && subHeader[i]?.trim());
    if (own) return own;
    // 見出しが結合セルで左隣にある場合に分かるよう、左隣の見出しを添える
    const left = header[i - 1]?.replace(/[\s　]+/g, '');
    return left ? `列${i + 1}(${left}の右)` : `列${i + 1}`;
  };
  const fields = journal ? JOURNAL_FIELDS : LEDGER_FIELDS;
  const preview = cfg.table.rows.slice(cfg.headerRow + 1, cfg.headerRow + 6);

  const setField = (key: FieldKey, v: string) => {
    const mapping = { ...cfg.mapping };
    if (v === '') delete mapping[key];
    else mapping[key] = Number(v);
    onChange({ ...cfg, mapping });
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12 }}>
      <div className="row">
        <label className="row" style={{ fontWeight: 600 }}>
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => onChange({ ...cfg, enabled: e.target.checked })} />
          {cfg.table.name}
        </label>
        <span className="badge">{journal ? '仕訳帳形式' : '元帳形式'}</span>
        {stat && (
          <span className="muted">
            明細 {stat.entries.toLocaleString()} 件取込 / 集計行・空行など {stat.skipped.toLocaleString()} 行を除外
          </span>
        )}
        {stat?.balanceCheck && (
          <span
            className={`badge ${stat.balanceCheck.matched === stat.balanceCheck.checked ? 'ok' : 'ng'}`}
            title="直前の残高 ± (借方 − 貸方) が帳票の差引残高と一致した行数"
          >
            差引残高との検算 {stat.balanceCheck.matched.toLocaleString()} / {stat.balanceCheck.checked.toLocaleString()} 行一致
          </span>
        )}
        <span className="spacer" />
        <button className="btn small" onClick={onRemove}>
          削除
        </button>
      </div>
      {stat?.warnings.map((w) => (
        <div className="notice" key={w}>
          {w}
        </div>
      ))}
      {!journal && cfg.mapping.account === undefined && (
        <p className="muted">
          勘定科目の列が無いため、シート内の科目見出し行(例:「【7100】旅費交通費」)またはシート名を勘定科目として扱います。
        </p>
      )}
      <details>
        <summary>列の割り当てを確認・変更</summary>
        <div className="row" style={{ marginTop: 8 }}>
          <label className="row muted">
            見出し行:
            <select value={cfg.headerRow} onChange={(e) => onChange({ ...cfg, headerRow: Number(e.target.value) })}>
              <option value={-1}>なし</option>
              {cfg.table.rows.slice(0, 30).map((r, i) => (
                <option key={i} value={i}>
                  {i + 1}行目: {r.filter(Boolean).slice(0, 4).join(' / ').slice(0, 40)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mapping-grid">
          {fields.map((f) => (
            <label key={f}>
              {FIELD_LABELS[f]}
              <select value={cfg.mapping[f] ?? ''} onChange={(e) => setField(f, e.target.value)}>
                <option value="">(なし)</option>
                {Array.from({ length: colCount }, (_, i) => (
                  <option key={i} value={i}>
                    {colName(i)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {Array.from({ length: colCount }, (_, i) => (
                  <th key={i}>{colName(i)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, ri) => (
                <tr key={ri}>
                  {Array.from({ length: colCount }, (_, i) => (
                    <td key={i}>{r[i] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
