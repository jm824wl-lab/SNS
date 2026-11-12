import type { BuyerCriteria } from "../api";
import { formatMan, formatRange } from "../format";

/** クライテリアを「ラベル: 値」のペアの一覧に変換する(未設定の条件は含めない)。 */
export function criteriaSummary(c: BuyerCriteria): [string, string][] {
  const rows: [string, string | null][] = [
    ["種別", c.categories.length ? c.categories.join("・") : null],
    ["エリア", c.areas.length ? c.areas.join("・") : null],
    ["除外エリア", c.excluded_areas.length ? c.excluded_areas.join("・") : null],
    ["価格", formatRange(c.min_price_man, c.max_price_man, formatMan)],
    ["利回り", c.min_yield_pct !== null ? `${c.min_yield_pct}%以上` : null],
    ["築年数", c.max_age_years !== null ? `築${c.max_age_years}年以内` : null],
    ["構造", c.structures.length ? c.structures.join("・") : null],
    ["土地", formatRange(c.min_land_tsubo, c.max_land_tsubo, (v) => `${v}坪`)],
    ["駅徒歩", c.max_walk_minutes !== null ? `${c.max_walk_minutes}分以内` : null],
    ["NGワード", c.ng_keywords.length ? c.ng_keywords.join("・") : null],
  ];
  return rows.filter((row): row is [string, string] => row[1] !== null);
}
