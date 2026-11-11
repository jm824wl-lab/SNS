import type { AccountClass, Category, CostBehavior } from './types';

/**
 * 科目名から損益区分と固変区分を推定するルール。上から順に最初に一致したものを採用する。
 * 固変分解は中小企業庁方式(製造業・卸小売業)を簡略化した既定値で、画面上で変更できる。
 */
const RULES: [RegExp, Category, CostBehavior][] = [
  // 名称が他ルールと紛らわしい科目を先に判定
  [/仕入割引/, '営業外収益', '対象外'],
  [/繰入/, '販管費', '固定費'],
  // 売上原価(「売上」より先に判定)
  [/労務費|賃金|製造.*(給与|賞与|法定福利|福利厚生)/, '売上原価', '固定費'],
  [/仕入|売上原価|棚卸|材料費|外注|加工費|製造原価|原価/, '売上原価', '変動費'],
  [/減価償却費/, '販管費', '固定費'],
  // 特別損益・営業外
  [/売却益|受贈益|特別利益|戻入益|保険差益|債務免除益/, '特別利益', '対象外'],
  [/売却損|除却損|減損|特別損失|災害損失|評価損/, '特別損失', '対象外'],
  [/受取利息|受取配当|受取手数料|雑収入|為替差益|有価証券利息|仕入割引|受取家賃/, '営業外収益', '対象外'],
  [/支払利息|雑損失|為替差損|手形売却損|売上割引|社債利息/, '営業外費用', '固定費'],
  // 貸借対照表科目
  [
    /現金|預金|売掛|買掛|未払|未収|前払|前受|仮払|仮受|預り|借入|貸付|立替|資本金|資本剰余|利益剰余|繰越利益|準備金|建物|構築物|車両運搬具|工具|器具|備品|機械装置|土地|ソフトウ[ェエ]ア|減価償却累計|敷金|保証金|差入|有価証券|^商品$|^製品$|貯蔵品|仕掛品|^原材料$|手形|元入|事業主|引当金|出資金|リース債務|リース資産|長期|短期|電子記録|未決算|諸口|保険積立|株式$/,
    '貸借対照表',
    '対象外',
  ],
  [/法人税|住民税|事業税|法人税等/, '法人税等', '対象外'],
  [/売上|売上高|収入|役務収益|営業収益/, '売上', '対象外'],
  // 販管費のうち変動費とみなすもの
  [/荷造|運賃|発送|配送|保管料|販売手数料|販売促進|燃料|カード手数料|決済手数料/, '販管費', '変動費'],
];

export function guessClass(account: string): AccountClass {
  const name = account.normalize('NFKC');
  for (const [re, category, behavior] of RULES) {
    if (re.test(name)) return { category, behavior };
  }
  return { category: '販管費', behavior: '固定費' };
}

export type ClassOverrides = Record<string, AccountClass>;

const STORAGE_KEY = 'gl-cost-analysis:account-classes:v1';

export function loadOverrides(): ClassOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ClassOverrides) : {};
  } catch {
    return {};
  }
}

export function saveOverrides(o: ClassOverrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch {
    // ストレージが使えない環境では保存しない(画面上の設定は有効)
  }
}

export function classOf(account: string, overrides: ClassOverrides): AccountClass {
  return overrides[account] ?? guessClass(account);
}
