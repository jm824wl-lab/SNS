import type { ColumnMapping, Entry, FieldKey, RawTable } from './types';

/**
 * 見出しキーワード → 項目の対応。上から順に評価するため、
 * 「借方勘定科目」「相手勘定科目」のような複合語を単純な「勘定科目」「借方」より先に置く。
 */
const HEADER_RULES: [FieldKey, RegExp][] = [
  ['debitAccount', /^借方(勘定)?科目(名)?$/],
  ['creditAccount', /^貸方(勘定)?科目(名)?$/],
  ['debitPartner', /^借方取引先(名)?$/],
  ['creditPartner', /^貸方取引先(名)?$/],
  ['debitDepartment', /^借方部門(名)?$/],
  ['creditDepartment', /^貸方部門(名)?$/],
  ['counterAccount', /^相手(勘定)?科目(名)?$|^相手勘定$/],
  ['debit', /^借方(金額)?$/],
  ['credit', /^貸方(金額)?$/],
  ['amount', /^(取引)?金額$|^税込金額$/],
  ['account', /^(勘定)?科目(名)?$|^勘定科目名称$/],
  ['date', /^(取引|伝票|計上|発生|仕訳)?日付$|^取引日$|^年?月日$|^月\/日$|^発生日$|^計上日$/],
  ['partner', /^(取引先|得意先|仕入先|相手先)(名)?$/],
  ['department', /^部門(名)?$/],
  ['description', /^(摘要|内容|備考|品目|メモ)$/],
];

export const FIELD_LABELS: Record<FieldKey, string> = {
  date: '日付',
  account: '勘定科目',
  counterAccount: '相手勘定科目',
  debit: '借方金額',
  credit: '貸方金額',
  amount: '金額(借方扱い)',
  partner: '取引先',
  department: '部門',
  description: '摘要',
  debitAccount: '借方勘定科目',
  creditAccount: '貸方勘定科目',
  debitAmount: '借方金額(仕訳帳)',
  creditAmount: '貸方金額(仕訳帳)',
  debitPartner: '借方取引先',
  creditPartner: '貸方取引先',
  debitDepartment: '借方部門',
  creditDepartment: '貸方部門',
};

function normHeader(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\s　]/g, '')
    .replace(/[()（）[\]【】<>＜＞]/g, '')
    .replace(/\(円\)|円$/, '');
}

/** 見出し行の各セルに項目を割り当てる */
export function autoMapping(header: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  header.forEach((raw, idx) => {
    const h = normHeader(raw);
    if (!h) return;
    for (const [key, re] of HEADER_RULES) {
      if (re.test(h) && mapping[key] === undefined) {
        mapping[key] = idx;
        return;
      }
    }
  });
  // 仕訳帳形式では「借方金額」「貸方金額」がそれぞれの側の金額を指す
  if (mapping.debitAccount !== undefined && mapping.creditAccount !== undefined) {
    if (mapping.debit !== undefined) {
      mapping.debitAmount = mapping.debit;
      delete mapping.debit;
    }
    if (mapping.credit !== undefined) {
      mapping.creditAmount = mapping.credit;
      delete mapping.credit;
    }
    // 金額列が1本しかない仕訳帳(借貸同額)
    if (mapping.amount !== undefined) {
      mapping.debitAmount ??= mapping.amount;
      mapping.creditAmount ??= mapping.amount;
      delete mapping.amount;
    }
  }
  return mapping;
}

export function isJournalMapping(m: ColumnMapping): boolean {
  return m.debitAccount !== undefined && m.creditAccount !== undefined;
}

function headerScore(row: string[]): number {
  return Object.keys(autoMapping(row)).length;
}

/**
 * 見出し行の列割り当て。見出しが2段(例: 1段目に「摘要」「借方金額」、2段目に「月 日」)の場合は、
 * 1段目で埋まらなかった列を2段目の見出しで補う。
 */
export function detectMapping(rows: string[][], headerRow: number): ColumnMapping {
  if (headerRow < 0) return {};
  const mapping = autoMapping(rows[headerRow]);
  const next = rows[headerRow + 1];
  if (next && !next.some((c) => parseAmount(c) !== null && !/^\d{1,2}[/.月]/.test(c.trim()))) {
    const used = new Set(Object.values(mapping));
    for (const [key, col] of Object.entries(autoMapping(next)) as [FieldKey, number][]) {
      if (mapping[key] === undefined && !used.has(col)) mapping[key] = col;
    }
  }
  return mapping;
}

/** 先頭30行から見出し行らしい行を探す。見つからなければ -1 */
export function detectHeaderRow(rows: string[][]): number {
  let best = -1;
  let bestScore = 1;
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    const s = headerScore(rows[i]);
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  }
  return best;
}

/** 金額文字列を数値化。△▲・括弧はマイナス。解釈不能なら null */
export function parseAmount(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.normalize('NFKC').trim();
  if (!s || s === '-') return null;
  let negative = false;
  if (/^[△▲-]/.test(s)) {
    negative = true;
    s = s.slice(1);
  }
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[,¥\\円\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

export interface DateOptions {
  /** 年が省略された日付(例: 4/1)を補完するための期首年 */
  fiscalStartYear: number;
  /** 期首月(1〜12) */
  fiscalStartMonth: number;
}

const ERA_BASE: Record<string, number> = { R: 2018, H: 1988, S: 1925, 令和: 2018, 平成: 1988, 昭和: 1925 };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function validYmd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 日付文字列を YYYY-MM-DD に正規化(西暦・和暦・Excelシリアル値・年省略に対応) */
export function parseDate(raw: string | undefined, opts: DateOptions): string | null {
  if (!raw) return null;
  // 「4/ 1」「2025 / 4 / 1」のような桁揃えの空白を除去
  const s = raw.normalize('NFKC').replace(/\s+/g, '');
  if (!s) return null;

  let m = s.match(/^(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})日?/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);

  m = s.match(/^(令和|平成|昭和|[RHS])\.?\s*(\d{1,2}|元)[/\-.年](\d{1,2})[/\-.月](\d{1,2})日?/i);
  if (m) {
    const base = ERA_BASE[m[1].toUpperCase()] ?? ERA_BASE[m[1]];
    const ey = m[2] === '元' ? 1 : +m[2];
    return validYmd(base + ey, +m[3], +m[4]);
  }

  // Excel のシリアル値(1900年基準)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial > 20000 && serial < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return validYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }

  // 年が省略された日付(M/D, M月D日)
  m = s.match(/^(\d{1,2})[/\-.月](\d{1,2})日?$/);
  if (m) {
    const month = +m[1];
    const year = month >= opts.fiscalStartMonth ? opts.fiscalStartYear : opts.fiscalStartYear + 1;
    return validYmd(year, month, +m[2]);
  }
  return null;
}

/**
 * 帳票内の年の表記(「7年」「令和7年」「2025年度」)を西暦に変換する。年の表記でなければ null。
 * 元号の無い2桁以下の年は令和とみなす。
 */
export function parseYearLabel(raw: string): number | null {
  const s = raw.normalize('NFKC').replace(/\s+/g, '');
  let m = s.match(/^(\d{4})年度?$/);
  if (m) return +m[1];
  m = s.match(/^(令和|平成|R|H)?(\d{1,2}|元)年度?$/i);
  if (!m) return null;
  const n = m[2] === '元' ? 1 : +m[2];
  return (/^(平成|H)$/i.test(m[1] ?? '') ? 1988 : 2018) + n;
}

/**
 * 繰越・合計などの集計行は明細ではないので除外する。
 * 「※※ 4月計 ※※」「前期より繰越」「翌期への繰越」「決算月計」などの表記ゆれに対応するため、
 * 記号と空白を除いた短いセル全体で判定する。
 */
function isSummaryCell(raw: string): boolean {
  const s = raw.normalize('NFKC').replace(/[\s※*＊【】[\]<>()]/g, '');
  if (!s || s.length > 14) return false;
  return /^.{0,8}(繰越|繰り越し)(高|額)?$/.test(s) || /^.{0,8}(月計|合計|累計|小計|総計|期間計|日計)$/.test(s) || /^(残高|差引残高)$/.test(s);
}

/** 「【7100】旅費交通費」「勘定科目: 旅費交通費」などから科目名を取り出す */
export function cleanAccountName(raw: string): string {
  return raw
    .normalize('NFKC')
    // 「旅 費 交通費」のような桁揃えの空白を除去(勘定科目名には通常空白を含まない)
    .replace(/\s+/g, '')
    .replace(/^(勘定)?科目(名)?[:：]*/, '')
    .replace(/^[[【(]?\d{2,6}[\]】)]?[:：-]*/, '')
    .replace(/^[[【(]\s*(.+?)\s*[\]】)]$/, '$1')
    .replace(/[:：]\s*$/, '')
    .trim();
}

/** 元帳の科目見出し行として扱わない文言(帳票タイトル・会社名・期間など) */
const NOT_ACCOUNT_TITLE = /元帳|仕訳帳|補助元帳|株式会社|有限会社|合同会社|\(株\)|期間|自\s*\d|至\s*\d|\d+年\d+月|ページ|page|作成日|出力日|単位/i;

export interface ParseResult {
  entries: Entry[];
  warnings: string[];
  skippedRows: number;
  undatedRows: number;
}

/**
 * 1シート分の行データを、与えられた列割り当てに従って明細へ変換する。
 *
 * - 元帳形式: 勘定科目列があればその値、無ければ科目見出し行(シート内の区切り)またはシート名を科目とする
 * - 仕訳帳形式: 1仕訳を「借方科目の借方明細」と「貸方科目の貸方明細」の2行に展開する
 */
export function parseTable(
  table: RawTable,
  headerRow: number,
  mapping: ColumnMapping,
  dateOpts: DateOptions,
  idStart = 0,
): ParseResult {
  const entries: Entry[] = [];
  const warnings: string[] = [];
  let skippedRows = 0;
  let undatedRows = 0;
  let nextId = idStart;

  const header = headerRow >= 0 ? table.rows[headerRow] : [];
  const headerKey = header.join('\u0001');
  const journal = isJournalMapping(mapping);
  const get = (row: string[], key: FieldKey): string =>
    mapping[key] !== undefined ? (row[mapping[key]!] ?? '').trim() : '';

  const amountCols = journal
    ? [mapping.debitAmount, mapping.creditAmount]
    : [mapping.debit, mapping.credit, mapping.amount];

  const amountColSet = new Set(amountCols.filter((c): c is number => c !== undefined));
  const hasAmountIn = (row: string[]) => [...amountColSet].some((c) => parseAmount(row[c]) !== null);
  const compact = (c: string) => c.normalize('NFKC').replace(/\s+/g, '');

  // 科目列が無い元帳: 科目ブロックの見出しから科目名を取る
  let sectionAccount = '';
  const useSections = !journal && mapping.account === undefined;

  /** 「科目」ラベルの右にある科目名(例: 会社名 | ○○ | 科目 | 101 | 現金)。コード番号は読み飛ばす */
  const labeledAccount = (row: string[]): string | null => {
    const idx = row.findIndex((c) => /^(勘定)?科目(名)?[:：]?$/.test(compact(c)));
    if (idx < 0) return null;
    for (let j = idx + 1; j < row.length; j++) {
      const v = compact(row[j]);
      if (!v || /^\d+$/.test(v)) continue;
      const name = cleanAccountName(row[j]);
      return name && Object.keys(autoMapping([row[j]])).length === 0 ? name : null;
    }
    return null;
  };
  /** ラベルの無い科目見出し行(例:「【7100】旅費交通費」) */
  const sectionCandidate = (row: string[]): string | null => {
    const texts = row.filter((c) => c.trim() !== '');
    if (texts.length === 0 || texts.length > 3) return null;
    if (hasAmountIn(row)) return null;
    if (NOT_ACCOUNT_TITLE.test(compact(texts.join('')))) return null;
    if (Object.keys(autoMapping(row)).length > 0) return null; // 「月 日」など見出しの段
    if (texts.some((t) => parseYearLabel(t) !== null)) return null;
    // 「勘定科目」「旅費交通費」が別セルの場合
    const label = texts.length >= 2 && /^勘定科目(名)?[:：]?$/.test(compact(texts[0])) ? texts[1] : texts[0];
    const name = cleanAccountName(label);
    return name && !/^\d+$/.test(name) && name.length <= 30 ? name : null;
  };

  // 帳票内の年表記(「7年」など)。年が省略された日付の補完に使う
  let labeledYear: number | null = null;
  // 同じ日の2行目以降は日付が省略されることが多いため、直前の日付を引き継ぐ
  let lastDate: string | null = null;

  /** 金額の無い行から、科目ブロックの区切り・年表記を読み取る。読み取れたら true */
  const readContextRow = (row: string[]): boolean => {
    const texts = row.filter((c) => c.trim() !== '');
    if (texts.length > 0 && texts.length <= 2) {
      const y = texts.map(parseYearLabel).find((v) => v !== null);
      if (y != null) {
        labeledYear = y;
        return true;
      }
    }
    if (!useSections) return false;
    const c = labeledAccount(row) ?? sectionCandidate(row);
    if (c) {
      sectionAccount = c;
      lastDate = null;
      return true;
    }
    return false;
  };

  for (let i = 0; i < Math.max(headerRow, 0); i++) readContextRow(table.rows[i]);

  for (let i = headerRow + 1; i < table.rows.length; i++) {
    const row = table.rows[i];
    if (row.every((c) => c.trim() === '')) continue;
    if (row.join('\u0001') === headerKey) continue; // ページごとに繰り返される見出し

    const opts = labeledYear !== null ? { ...dateOpts, fiscalStartYear: labeledYear } : dateOpts;
    const dateRaw = get(row, 'date');
    const rowDate = parseDate(dateRaw, opts);
    if (rowDate) lastDate = rowDate;

    if (row.some((c, idx) => !amountColSet.has(idx) && isSummaryCell(c))) {
      skippedRows++;
      continue;
    }

    if (!hasAmountIn(row)) {
      if (!readContextRow(row)) skippedRows++;
      continue;
    }

    const desc = get(row, 'description');
    const date = dateRaw ? rowDate : mapping.date !== undefined ? lastDate : null;
    if (!date) undatedRows++;
    const base = {
      date,
      month: date ? date.slice(0, 7) : null,
      description: desc,
      source: table.name,
    };

    if (journal) {
      const dAmt = parseAmount(get(row, 'debitAmount')) ?? 0;
      const cAmt = parseAmount(get(row, 'creditAmount')) ?? 0;
      const dAcc = cleanAccountName(get(row, 'debitAccount'));
      const cAcc = cleanAccountName(get(row, 'creditAccount'));
      const partner = get(row, 'partner');
      const dept = get(row, 'department');
      if (dAcc && dAmt !== 0) {
        entries.push({
          ...base,
          id: nextId++,
          account: dAcc,
          debit: dAmt,
          credit: 0,
          counterAccount: cAcc,
          partner: get(row, 'debitPartner') || partner,
          department: get(row, 'debitDepartment') || dept,
        });
      }
      if (cAcc && cAmt !== 0) {
        entries.push({
          ...base,
          id: nextId++,
          account: cAcc,
          debit: 0,
          credit: cAmt,
          counterAccount: dAcc,
          partner: get(row, 'creditPartner') || partner,
          department: get(row, 'creditDepartment') || dept,
        });
      }
      continue;
    }

    const account = mapping.account !== undefined ? cleanAccountName(get(row, 'account')) : sectionAccount || cleanAccountName(table.name);
    if (!account) {
      skippedRows++;
      continue;
    }
    let debit = parseAmount(get(row, 'debit')) ?? 0;
    let credit = parseAmount(get(row, 'credit')) ?? 0;
    if (mapping.debit === undefined && mapping.credit === undefined) {
      debit = parseAmount(get(row, 'amount')) ?? 0;
    }
    if (debit === 0 && credit === 0) {
      skippedRows++;
      continue;
    }
    entries.push({
      ...base,
      id: nextId++,
      account,
      debit,
      credit,
      counterAccount: cleanAccountName(get(row, 'counterAccount')),
      partner: get(row, 'partner'),
      department: get(row, 'department'),
    });
  }

  if (headerRow < 0) warnings.push(`「${table.name}」: 見出し行を検出できませんでした。列の割り当てを確認してください。`);
  if (!journal && mapping.debit === undefined && mapping.credit === undefined && mapping.amount === undefined) {
    warnings.push(`「${table.name}」: 金額列が割り当てられていません。`);
  }
  if (undatedRows > 0) {
    warnings.push(`「${table.name}」: 日付を解釈できない行が ${undatedRows} 行あります(合計には含め、月次推移からは除外)。`);
  }
  return { entries, warnings, skippedRows, undatedRows };
}
