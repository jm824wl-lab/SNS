import { classOf, type ClassOverrides } from './classify';
import {
  COST_CATEGORIES,
  REVENUE_CATEGORIES,
  type Category,
  type CostBehavior,
  type Entry,
} from './types';

export interface Filters {
  fromMonth: string | null;
  toMonth: string | null;
  department: string | null;
}

export function applyFilters(entries: Entry[], f: Filters): Entry[] {
  return entries.filter((e) => {
    if (f.department !== null && e.department !== f.department) return false;
    if (f.fromMonth && (!e.month || e.month < f.fromMonth)) return false;
    if (f.toMonth && (!e.month || e.month > f.toMonth)) return false;
    return true;
  });
}

/** 区分に応じた符号付き金額(費用・資産は借方−貸方、収益は貸方−借方) */
export function signedAmount(e: Entry, category: Category): number {
  return REVENUE_CATEGORIES.has(category) ? e.credit - e.debit : e.debit - e.credit;
}

export interface AccountSummary {
  account: string;
  category: Category;
  behavior: CostBehavior;
  total: number;
  debit: number;
  credit: number;
  count: number;
  byMonth: Record<string, number>;
}

export function monthsOf(entries: Entry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) if (e.month) set.add(e.month);
  return [...set].sort();
}

/** 月の欠落を埋めた連続した月リスト */
export function fillMonths(months: string[]): string[] {
  if (months.length === 0) return [];
  const out: string[] = [];
  let [y, m] = months[0].split('-').map(Number);
  const last = months[months.length - 1];
  for (let guard = 0; guard < 600; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key >= last) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function summarizeAccounts(entries: Entry[], overrides: ClassOverrides): AccountSummary[] {
  const map = new Map<string, AccountSummary>();
  for (const e of entries) {
    let s = map.get(e.account);
    if (!s) {
      const cls = classOf(e.account, overrides);
      s = { account: e.account, ...cls, total: 0, debit: 0, credit: 0, count: 0, byMonth: {} };
      map.set(e.account, s);
    }
    const amt = signedAmount(e, s.category);
    s.total += amt;
    s.debit += e.debit;
    s.credit += e.credit;
    s.count++;
    if (e.month) s.byMonth[e.month] = (s.byMonth[e.month] ?? 0) + amt;
  }
  return [...map.values()];
}

export interface PlSummary {
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  sga: number;
  operatingProfit: number;
  nonOpIncome: number;
  nonOpExpense: number;
  ordinaryProfit: number;
  totalCost: number;
  variableCost: number;
  fixedCost: number;
  marginalProfit: number;
  /** 限界利益率(売上が0なら null) */
  marginalProfitRatio: number | null;
  /** 損益分岐点売上高(限界利益率が正でなければ null) */
  breakEvenSales: number | null;
  /** 安全余裕率 */
  safetyMargin: number | null;
}

export function plSummary(accounts: AccountSummary[]): PlSummary {
  const sumCat = (c: Category) => accounts.filter((a) => a.category === c).reduce((t, a) => t + a.total, 0);
  const revenue = sumCat('売上');
  const costOfSales = sumCat('売上原価');
  const sga = sumCat('販管費');
  const nonOpIncome = sumCat('営業外収益');
  const nonOpExpense = sumCat('営業外費用');
  const costAccounts = accounts.filter((a) => COST_CATEGORIES.has(a.category));
  const totalCost = costAccounts.reduce((t, a) => t + a.total, 0);
  const variableCost = costAccounts.filter((a) => a.behavior === '変動費').reduce((t, a) => t + a.total, 0);
  // 損益分岐点は経常段階で計算(特別損失は臨時的なため含めない)
  const fixedCost = costAccounts
    .filter((a) => a.behavior === '固定費' && a.category !== '特別損失')
    .reduce((t, a) => t + a.total, 0);
  const marginalProfit = revenue - variableCost;
  const marginalProfitRatio = revenue !== 0 ? marginalProfit / revenue : null;
  const breakEvenSales = marginalProfitRatio && marginalProfitRatio > 0 ? fixedCost / marginalProfitRatio : null;
  const safetyMargin = breakEvenSales !== null && revenue > 0 ? (revenue - breakEvenSales) / revenue : null;
  const grossProfit = revenue - costOfSales;
  const operatingProfit = grossProfit - sga;
  return {
    revenue,
    costOfSales,
    grossProfit,
    sga,
    operatingProfit,
    nonOpIncome,
    nonOpExpense,
    ordinaryProfit: operatingProfit + nonOpIncome - nonOpExpense,
    totalCost,
    variableCost,
    fixedCost,
    marginalProfit,
    marginalProfitRatio,
    breakEvenSales,
    safetyMargin,
  };
}

export interface Trend {
  latestMonth: string | null;
  latest: number;
  previous: number | null;
  /** 前月比(前月が0なら null) */
  momRatio: number | null;
  average: number;
  /** 最新月の平均比(平均が0なら null) */
  vsAverage: number | null;
}

/** 科目の最新月・前月・期間平均の比較(異常値の把握用) */
export function trendOf(s: AccountSummary, months: string[]): Trend {
  if (months.length === 0) {
    return { latestMonth: null, latest: 0, previous: null, momRatio: null, average: 0, vsAverage: null };
  }
  const latestMonth = months[months.length - 1];
  const latest = s.byMonth[latestMonth] ?? 0;
  const previous = months.length >= 2 ? (s.byMonth[months[months.length - 2]] ?? 0) : null;
  const average = months.reduce((t, m) => t + (s.byMonth[m] ?? 0), 0) / months.length;
  return {
    latestMonth,
    latest,
    previous,
    momRatio: previous ? (latest - previous) / Math.abs(previous) : null,
    average,
    vsAverage: average ? (latest - average) / Math.abs(average) : null,
  };
}

export type Dimension = 'partner' | 'department' | 'counterAccount' | 'description';

export interface BreakdownRow {
  key: string;
  amount: number;
  count: number;
}

export function breakdown(entries: Entry[], account: string, dim: Dimension, category: Category): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const e of entries) {
    if (e.account !== account) continue;
    const key = e[dim] || '(未設定)';
    const r = map.get(key) ?? { key, amount: 0, count: 0 };
    r.amount += signedAmount(e, category);
    r.count++;
    map.set(key, r);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}
