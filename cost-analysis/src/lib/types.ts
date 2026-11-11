/** 仕訳1行を勘定科目ごとに正規化した明細(総勘定元帳の1行に相当) */
export interface Entry {
  id: number;
  /** YYYY-MM-DD。解釈できない場合は null */
  date: string | null;
  /** YYYY-MM。date が null の場合は null */
  month: string | null;
  account: string;
  debit: number;
  credit: number;
  counterAccount: string;
  partner: string;
  department: string;
  description: string;
  /** 取込元(ファイル名/シート名) */
  source: string;
}

export const CATEGORIES = [
  '売上',
  '売上原価',
  '販管費',
  '営業外収益',
  '営業外費用',
  '特別利益',
  '特別損失',
  '法人税等',
  '貸借対照表',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const BEHAVIORS = ['変動費', '固定費', '対象外'] as const;
export type CostBehavior = (typeof BEHAVIORS)[number];

export interface AccountClass {
  category: Category;
  behavior: CostBehavior;
}

/** 収益系の区分(貸方 − 借方 で集計する) */
export const REVENUE_CATEGORIES: ReadonlySet<Category> = new Set(['売上', '営業外収益', '特別利益']);
/** コスト分析の対象とする費用区分 */
export const COST_CATEGORIES: ReadonlySet<Category> = new Set([
  '売上原価',
  '販管費',
  '営業外費用',
  '特別損失',
]);

export type FieldKey =
  | 'date'
  | 'account'
  | 'counterAccount'
  | 'debit'
  | 'credit'
  | 'amount'
  | 'balance'
  | 'partner'
  | 'department'
  | 'description'
  | 'debitAccount'
  | 'creditAccount'
  | 'debitAmount'
  | 'creditAmount'
  | 'debitPartner'
  | 'creditPartner'
  | 'debitDepartment'
  | 'creditDepartment';

export type ColumnMapping = Partial<Record<FieldKey, number>>;

/** シート(CSVなら1ファイル)単位の生データ */
export interface RawTable {
  name: string;
  rows: string[][];
}
