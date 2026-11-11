import { describe, expect, it } from 'vitest';
import { decodeBytes, parseDelimited, toCsv } from './csv';
import { autoMapping, cleanAccountName, detectHeaderRow, detectMapping, isJournalMapping, parseAmount, parseDate, parseTable } from './parse';
import { guessClass } from './classify';
import { applyFilters, fillMonths, plSummary, summarizeAccounts, trendOf, monthsOf, breakdown } from './aggregate';
import { sampleLedger } from './sample';
import Encoding from 'encoding-japanese';

const opts = { fiscalStartYear: 2025, fiscalStartMonth: 4 };

describe('csv', () => {
  it('引用符・セル内改行・CRLFを扱える', () => {
    expect(parseDelimited('a,"b,1","c""d"\r\n"x\ny",2,3\r\n')).toEqual([
      ['a', 'b,1', 'c"d'],
      ['x\ny', '2', '3'],
    ]);
  });
  it('Shift_JIS を判定して復号する', () => {
    const sjis = Uint8Array.from(Encoding.convert(Encoding.stringToCode('日付,勘定科目,借方金額\n2025/4/1,旅費交通費,1000'), { to: 'SJIS', from: 'UNICODE' }));
    expect(decodeBytes(sjis)).toContain('旅費交通費');
  });
  it('UTF-8 BOM を除去する', () => {
    expect(decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('A');
  });
  it('CSV出力でエスケープする', () => {
    expect(toCsv([['a,b', 1], ['"q"', 2]])).toBe('"a,b",1\r\n"""q""",2');
  });
});

describe('値の解釈', () => {
  it('金額', () => {
    expect(parseAmount('1,234')).toBe(1234);
    expect(parseAmount('¥１２，０００')).toBe(12000);
    expect(parseAmount('△500')).toBe(-500);
    expect(parseAmount('(300)')).toBe(-300);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
  it('日付(西暦・和暦・シリアル値・年省略)', () => {
    expect(parseDate('2025/4/1', opts)).toBe('2025-04-01');
    expect(parseDate('2025年12月31日', opts)).toBe('2025-12-31');
    expect(parseDate('20250415', opts)).toBe('2025-04-15');
    expect(parseDate('R7/5/1', opts)).toBe('2025-05-01');
    expect(parseDate('令和元年5月1日', opts)).toBe('2019-05-01');
    expect(parseDate('45748', opts)).toBe('2025-04-01');
    expect(parseDate('4/1', opts)).toBe('2025-04-01');
    expect(parseDate('3/31', opts)).toBe('2026-03-31');
    expect(parseDate('前期繰越', opts)).toBeNull();
  });
  it('科目名の整形', () => {
    expect(cleanAccountName('【7100】旅費交通費')).toBe('旅費交通費');
    expect(cleanAccountName('勘定科目：消耗品費')).toBe('消耗品費');
    expect(cleanAccountName('[地代家賃]')).toBe('地代家賃');
  });
});

describe('見出し検出と列割り当て', () => {
  it('元帳形式', () => {
    const m = autoMapping(['取引日', '相手勘定科目', '取引先', '摘要', '借方金額', '貸方金額', '残高']);
    expect(m).toMatchObject({ date: 0, counterAccount: 1, partner: 2, description: 3, debit: 4, credit: 5 });
    expect(isJournalMapping(m)).toBe(false);
  });
  it('仕訳帳形式(借方/貸方の科目と金額)', () => {
    const m = autoMapping(['取引日', '借方勘定科目', '借方部門', '借方金額(円)', '貸方勘定科目', '貸方金額(円)', '摘要']);
    expect(isJournalMapping(m)).toBe(true);
    expect(m).toMatchObject({ debitAccount: 1, debitDepartment: 2, debitAmount: 3, creditAccount: 4, creditAmount: 5 });
  });
  it('タイトル行の下にある見出し行を見つける', () => {
    expect(detectHeaderRow([['総勘定元帳'], ['株式会社テスト'], ['日付', '摘要', '借方', '貸方', '残高']])).toBe(2);
  });
});

describe('parseTable', () => {
  it('科目列の無い元帳: 科目見出し行で区切る・繰越/合計行を除外する', () => {
    const rows = [
      ['総勘定元帳'],
      ['自 2025年4月1日 至 2026年3月31日'],
      ['【7100】旅費交通費'],
      ['日付', '相手科目', '摘要', '借方金額', '貸方金額', '残高'],
      ['', '', '前期繰越', '', '', '0'],
      ['2025/04/03', '現金', '電車代', '1,200', '', '1,200'],
      ['2025/04/30', '', '月計', '1,200', '0', ''],
      ['勘定科目', '消耗品費'],
      ['日付', '相手科目', '摘要', '借方金額', '貸方金額', '残高'],
      ['2025/04/10', '未払金', 'コピー用紙', '3,000', '', '3,000'],
      ['2025/04/11', '未払金', '返品', '', '500', '2,500'],
      ['', '', '合計', '3,000', '500', ''],
    ];
    const t = { name: '元帳.csv', rows };
    const h = detectHeaderRow(rows);
    const r = parseTable(t, h, autoMapping(rows[h]), opts);
    expect(r.entries.map((e) => [e.account, e.debit, e.credit, e.month])).toEqual([
      ['旅費交通費', 1200, 0, '2025-04'],
      ['消耗品費', 3000, 0, '2025-04'],
      ['消耗品費', 0, 500, '2025-04'],
    ]);
    expect(r.entries[0].counterAccount).toBe('現金');
  });
  it('科目列が無く見出しも無いシートはシート名を科目にする', () => {
    const rows = [
      ['日付', '摘要', '借方', '貸方'],
      ['2025/5/1', 'タクシー', '2000', ''],
    ];
    const r = parseTable({ name: '旅費交通費', rows }, 0, autoMapping(rows[0]), opts);
    expect(r.entries[0].account).toBe('旅費交通費');
  });
  it('仕訳帳を借方・貸方の2明細に展開する', () => {
    const rows = [
      ['日付', '借方勘定科目', '借方金額', '貸方勘定科目', '貸方金額', '取引先'],
      ['2025/6/1', '地代家賃', '100,000', '普通預金', '100,000', '大家'],
    ];
    const r = parseTable({ name: 'j', rows }, 0, autoMapping(rows[0]), opts);
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]).toMatchObject({ account: '地代家賃', debit: 100000, credit: 0, counterAccount: '普通預金', partner: '大家' });
    expect(r.entries[1]).toMatchObject({ account: '普通預金', debit: 0, credit: 100000, counterAccount: '地代家賃' });
  });
});

describe('科目分類', () => {
  it.each([
    ['売上高', '売上', '対象外'],
    ['商品仕入高', '売上原価', '変動費'],
    ['期首商品棚卸高', '売上原価', '変動費'],
    ['外注費', '売上原価', '変動費'],
    ['給料手当', '販管費', '固定費'],
    ['荷造運賃', '販管費', '変動費'],
    ['減価償却費', '販管費', '固定費'],
    ['減価償却累計額', '貸借対照表', '対象外'],
    ['貸倒引当金繰入額', '販管費', '固定費'],
    ['売掛金', '貸借対照表', '対象外'],
    ['未払法人税等', '貸借対照表', '対象外'],
    ['法人税、住民税及び事業税', '法人税等', '対象外'],
    ['支払利息', '営業外費用', '固定費'],
    ['雑収入', '営業外収益', '対象外'],
    ['仕入割引', '営業外収益', '対象外'],
    ['固定資産売却益', '特別利益', '対象外'],
  ])('%s → %s / %s', (name, cat, beh) => {
    expect(guessClass(name)).toEqual({ category: cat, behavior: beh });
  });
});

describe('集計(サンプル元帳を通しで処理)', () => {
  const t = sampleLedger();
  const h = detectHeaderRow(t.rows);
  const { entries, warnings } = parseTable(t, h, autoMapping(t.rows[h]), opts);
  const accounts = summarizeAccounts(entries, {});

  it('警告なく12か月分を取り込める', () => {
    expect(warnings).toEqual([]);
    expect(monthsOf(entries)).toHaveLength(12);
  });
  it('複式簿記の貸借が一致する', () => {
    const d = entries.reduce((t, e) => t + e.debit, 0);
    const c = entries.reduce((t, e) => t + e.credit, 0);
    expect(d).toBe(c);
  });
  it('損益の各段階が整合する', () => {
    const pl = plSummary(accounts);
    expect(pl.revenue).toBeGreaterThan(0);
    expect(pl.grossProfit).toBe(pl.revenue - pl.costOfSales);
    expect(pl.variableCost + pl.fixedCost).toBeCloseTo(pl.totalCost);
    expect(pl.breakEvenSales! * pl.marginalProfitRatio!).toBeCloseTo(pl.fixedCost);
    // BS科目は費用に混入しない
    expect(accounts.find((a) => a.account === '普通預金')?.category).toBe('貸借対照表');
  });
  it('最新月の外注費の急増を検出できる', () => {
    const months = monthsOf(entries);
    const tr = trendOf(accounts.find((a) => a.account === '外注費')!, months);
    expect(tr.vsAverage!).toBeGreaterThan(0.5);
  });
  it('期間・部門で絞り込める', () => {
    const f = applyFilters(entries, { fromMonth: '2025-10', toMonth: '2025-12', department: '管理部' });
    expect(monthsOf(f)).toEqual(['2025-10', '2025-11', '2025-12']);
    expect(f.every((e) => e.department === '管理部')).toBe(true);
  });
  it('取引先別内訳', () => {
    const rows = breakdown(entries, '地代家賃', 'partner', '販管費');
    expect(rows.map((r) => r.key)).toEqual(['丸の内ビル管理', '湾岸倉庫']);
    expect(rows[0].amount).toBe(380000 * 12);
  });
  it('欠落月を補完する', () => {
    expect(fillMonths(['2025-11', '2026-02'])).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('科目ごとにブロックが分かれた元帳(会社名・科目が同じ行、「月 日」が2段目、年が別行)', () => {
  const tax = ['', '', '', '', '', '税区分', '税込', '税抜', '課税', '非課税', '不課税'];
  const header = ['', '', '（相手科目名）', '', '摘 要', '借 方 金 額', '貸 方 金 額', '差 引 残 高'];
  const block = (code: string, name: string, lines: string[][]) => [
    ['', '', '', '元 帳'],
    tax,
    [],
    ['会社名', '株式会社 テスト', '', '科 目', code, name, '', '', '', '', 'No.', '1'],
    ['', '7年'],
    header,
    ['', '月 日'],
    ...lines,
    [],
  ];
  const rows = [
    ...block('101', '現 金', [
      ['', '4/ 1', '', '前期より繰越', '', '', '', '2,484,997'],
      ['', '', '預 り 金', '64514', '振替', '', '14,668', '2,470,329'],
      ['', '', '', '※※ 4月計 ※※', '', '0', '14,668', '2,470,329'],
      [],
      ['', '3/31', '買 掛 金', '64513', 'H29.6.30 伝票No690', '', '506,722', ''],
      ['', '', '未 収 入 金', '64515', '振替', '', '127,536', '1,836,071'],
      ['', '', '', '※※ 決算月計 ※※', '', '0', '634,258', '1,836,071'],
      ['', '', '', '翌期への繰越', '', '0', '648,926', '1,836,071'],
    ]),
    ...block('102', '小 口 現 金', [
      ['', '4/ 1', '', '前期より繰越', '', '', '', '694,015'],
      ['', '4/ 2', '売 掛 金', '1035', 'daibiki アロマ', '10,340', '', '704,355'],
      ['', '4/ 4', '旅 費 交通費', '515', '2025年3月分_経費', '', '190', ''],
      ['', '', '雑 費', '551', '2025年3月分_経費', '', '700', ''],
    ]),
  ];
  // 画面の期首年が誤っていても、帳票内の「7年」(令和7年)を優先する
  const wrongOpts = { fiscalStartYear: 2030, fiscalStartMonth: 4 };
  const t = { name: '元帳.xlsx', rows };
  const h = detectHeaderRow(rows);
  const mapping = detectMapping(rows, h);

  it('2段目の「月 日」を日付列として割り当てる', () => {
    expect(mapping).toMatchObject({ date: 1, counterAccount: 2, description: 4, debit: 5, credit: 6 });
  });

  it('科目ブロック・日付の省略・月計/繰越行・文字間スペースを正しく扱う', () => {
    const r = parseTable(t, h, mapping, wrongOpts);
    expect(r.entries.map((e) => [e.account, e.date, e.counterAccount, e.debit, e.credit])).toEqual([
      ['現金', '2025-04-01', '預り金', 0, 14668],
      ['現金', '2026-03-31', '買掛金', 0, 506722],
      ['現金', '2026-03-31', '未収入金', 0, 127536],
      ['小口現金', '2025-04-02', '売掛金', 10340, 0],
      ['小口現金', '2025-04-04', '旅費交通費', 0, 190],
      ['小口現金', '2025-04-04', '雑費', 0, 700],
    ]);
    expect(r.undatedRows).toBe(0);
  });
});

describe('見出しと数値の列がずれた元帳・「******」の合計行・差引残高の検算', () => {
  // 見出しは結合セルの左端(5,7,9列目)に入り、数値は右隣の列(6,8,10列目)に入っている
  const rows = [
    ['会社名', '株式会社 テスト', '', '科 目', '101', '現 金'],
    ['', '7年'],
    ['', '', '（相手科目名）', '', '摘 要', '借 方 金 額', '', '貸 方 金 額', '', '差 引 残 高', ''],
    ['', '月 日'],
    ['', '4/ 1', '', '前期より繰越', '', '', '', '', '', '', '100,000'],
    ['', '4/ 3', '売 上 高', '1', '現金売上', '', '50,000', '', '', '', '150,000'],
    ['', '4/ 5', '旅 費 交通費', '2', '出張', '', '', '', '20,000', '', '130,000'],
    ['', '', '雑 費', '3', '雑費', '', '', '', '5,000', '', ''],
    ['', '4/ 6', '普 通 預 金', '4', '預入', '', '', '', '25,000', '', '100,000'],
    ['', '', '', '******', '', '', '50,000', '', '50,000', '', '100,000'],
    ['', '4/10', '売 掛 金', '5', '回収', '', '10,000', '', '', '', '110,000'],
    ['', '4/12', '消 耗 品 費', '6', '文具', '', '', '', '3,000', '', '107,000'],
    ['', '4/15', '仮 払 金', '7', '戻入', '', '1,000', '', '', '', '108,000'],
    ['', '', '', '******', '', '', '61,000', '', '53,000', '', '108,000'],
  ];
  const h = detectHeaderRow(rows);
  const mapping = detectMapping(rows, h);
  const r = parseTable({ name: '元帳.xlsx', rows }, h, mapping, opts);

  it('見出しの右隣にある数値の列を借方・貸方・差引残高に割り当てる', () => {
    expect(mapping).toMatchObject({ debit: 6, credit: 8, balance: 10 });
  });
  it('「******」の合計行を除外し、差引残高を合計しない', () => {
    expect(r.entries).toHaveLength(7);
    expect(r.entries.reduce((t, e) => t + e.debit, 0)).toBe(61000);
    expect(r.entries.reduce((t, e) => t + e.credit, 0)).toBe(53000);
  });
  it('差引残高との検算がすべて一致する', () => {
    expect(r.balanceCheck).toEqual({ checked: 6, matched: 6 });
    expect(r.warnings).toEqual([]);
  });
  it('列の割り当てが誤っていれば検算で警告する', () => {
    const wrong = parseTable({ name: '元帳.xlsx', rows }, h, { ...mapping, debit: 8, credit: 10 }, opts);
    expect(wrong.warnings.some((w) => w.includes('差引残高が合わない'))).toBe(true);
  });
});
