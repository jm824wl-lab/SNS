import type { RawTable } from './types';

/** 再現性のある疑似乱数(mulberry32) */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * デモ用の総勘定元帳(2025年4月〜2026年3月、架空の卸売業)を
 * 会計ソフトのCSV出力と同じ「1行=1科目側の明細」形式で生成する。
 */
export function sampleLedger(): RawTable {
  const rand = rng(20250401);
  const header = ['日付', '勘定科目', '相手勘定科目', '取引先', '部門', '摘要', '借方金額', '貸方金額'];
  const rows: string[][] = [header];
  const round = (n: number, unit = 100) => Math.round(n / unit) * unit;
  const between = (lo: number, hi: number) => lo + (hi - lo) * rand();

  const push = (
    date: string,
    debitAcc: string,
    creditAcc: string,
    amount: number,
    partner: string,
    dept: string,
    desc: string,
  ) => {
    const a = String(amount);
    rows.push([date, debitAcc, creditAcc, partner, dept, desc, a, '']);
    rows.push([date, creditAcc, debitAcc, partner, dept, desc, '', a]);
  };

  const customers = ['北斗商事', 'みなと食品', '青葉リテール', '東和マート'];
  const suppliers = ['山王物産', '大川製作所', '松風トレーディング'];
  const seasonal = [1.0, 0.95, 1.05, 1.15, 0.85, 1.0, 1.05, 1.1, 1.35, 0.8, 0.9, 1.2];

  for (let i = 0; i < 12; i++) {
    const y = i < 9 ? 2025 : 2026;
    const m = ((i + 3) % 12) + 1;
    const ym = `${y}/${String(m).padStart(2, '0')}`;
    const d = (day: number) => `${ym}/${String(day).padStart(2, '0')}`;
    const isLast = i === 11;

    // 売上
    let monthSales = 0;
    for (const c of customers) {
      const amt = round(between(3_000_000, 4_600_000) * seasonal[i], 1000);
      monthSales += amt;
      push(d(25), '売掛金', '売上高', amt, c, '営業部', `${m}月分 商品売上`);
    }
    // 仕入(変動費)
    for (const s of suppliers) {
      const amt = round((monthSales * between(0.13, 0.17)), 1000);
      push(d(20), '仕入高', '買掛金', amt, s, '営業部', `${m}月分 商品仕入`);
    }
    // 外注費: 最新月に突発的な増加
    const outsource = round(monthSales * between(0.04, 0.06) * (isLast ? 2.3 : 1), 1000);
    push(d(28), '外注費', '未払金', outsource, 'コード工房', '営業部', isLast ? '物流システム改修 追加開発' : '保守・梱包作業委託');
    push(d(27), '荷造運賃', '未払金', round(monthSales * between(0.018, 0.024)), 'ヤマト便', '営業部', '発送運賃');
    push(d(26), '支払手数料', '普通預金', round(monthSales * 0.008 + between(8_000, 15_000)), '決済代行サービス', '営業部', '決済・振込手数料');

    // 人件費(固定費)
    push(d(25), '役員報酬', '普通預金', 900_000, '', '管理部', '役員報酬');
    push(d(25), '給料手当', '普通預金', round(2_150_000 + between(-40_000, 60_000), 1000), '', '営業部', '従業員給与');
    push(d(25), '給料手当', '普通預金', round(780_000 + between(-10_000, 10_000), 1000), '', '管理部', '従業員給与');
    if (m === 7 || m === 12) push(d(10), '賞与', '普通預金', 2_400_000, '', '営業部', '賞与支給');
    push(d(30), '法定福利費', '未払金', round(between(470_000, 500_000), 1000), '年金事務所', '管理部', '社会保険料 会社負担分');
    push(d(15), '福利厚生費', '普通預金', round(between(20_000, 60_000)), '', '管理部', '健康診断・慶弔');

    // その他の固定費
    push(d(1), '地代家賃', '普通預金', 380_000, '丸の内ビル管理', '管理部', '本社家賃');
    push(d(1), '地代家賃', '普通預金', 220_000, '湾岸倉庫', '営業部', '倉庫賃料');
    const heat = [0, 0, 0.1, 0.35, 0.4, 0.15, 0, 0, 0.2, 0.35, 0.3, 0.1][i];
    push(d(20), '水道光熱費', '未払金', round(62_000 * (1 + heat) + between(-3_000, 3_000)), '東京電力', '管理部', '電気料金');
    push(d(18), '通信費', '未払金', round(between(46_000, 52_000)), 'NTTコミュニケーションズ', '管理部', '回線・携帯');
    push(d(5), 'リース料', '普通預金', 64_000, 'オフィスリース', '管理部', '複合機・PCリース');
    push(d(28), '減価償却費', '減価償却累計額', 135_000, '', '管理部', '月次償却');
    push(d(27), '支払利息', '普通預金', round(28_000 - i * 400), 'みずほ銀行', '管理部', '借入金利息');
    push(d(10), '保険料', '普通預金', 42_000, '損害保険', '管理部', '火災・賠償責任保険');
    // 旅費交通費: 下期から増加傾向
    const travel = round(between(110_000, 150_000) * (i >= 6 ? 1.35 : 1));
    push(d(22), '旅費交通費', '未払金', travel, '', '営業部', '出張旅費・交通費精算');
    push(d(22), '旅費交通費', '未払金', round(between(15_000, 25_000)), '', '管理部', '交通費精算');
    push(d(12), '接待交際費', '未払金', round(between(40_000, 120_000) * (m === 12 ? 2 : 1)), '', '営業部', '得意先会食');
    push(d(14), '会議費', '未払金', round(between(8_000, 20_000)), '', '営業部', '打合せ飲食');
    push(d(16), '消耗品費', '未払金', round(between(30_000, 90_000)), 'アスクル', '管理部', '事務用品');
    if (m === 4 || m === 10) push(d(16), '消耗品費', '未払金', 280_000, 'PCショップ', '管理部', 'ノートPC購入(10万円未満)');
    if ([4, 9, 12, 3].includes(m)) push(d(8), '広告宣伝費', '未払金', round(between(300_000, 600_000), 1000), 'Webマーケ社', '営業部', 'Web広告出稿');
    push(d(20), '支払報酬料', '普通預金', 66_000, '税理士法人さくら', '管理部', '顧問料');
    push(d(28), '雑費', '普通預金', round(between(3_000, 12_000)), '', '管理部', '雑費');
    push(d(25), '普通預金', '受取利息', Math.max(1, round(between(5, 40), 1)), 'みずほ銀行', '管理部', '普通預金利息');
    if (m === 5) push(d(30), '租税公課', '普通預金', 180_000, '', '管理部', '固定資産税・印紙代');
  }
  return { name: 'サンプル_総勘定元帳_2025年度.csv', rows };
}
