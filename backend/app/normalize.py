"""物件フィールドを、クライテリア照合用の正規化済みの値へ変換する。

取込済み物件の各フィールドは業者ごとの表記ゆれ(「一棟収益（マンション）」
「築35年」「平成2年」「4.00％」「総戸数：14戸」等)をそのまま保持しているため、
会社ごとの購入条件と比較する前に、種別カテゴリ・数値(円/%/年/坪/分)へ揃える。
値が読み取れない場合は None を返し、照合側で「判定不能」として扱う。
"""

import re
import unicodedata
from datetime import date
from typing import Optional

# クライテリアで指定できる物件種別カテゴリ(画面の選択肢と一致させる)
PROPERTY_CATEGORIES = ["土地", "一棟マンション", "一棟アパート", "一棟ビル", "区分マンション", "戸建", "その他"]

# 構造カテゴリ
STRUCTURE_CATEGORIES = ["RC/SRC", "鉄骨", "木造"]

_ERA_BASE = {"明治": 1867, "大正": 1911, "昭和": 1925, "平成": 1988, "令和": 2018}


def _nfkc(value: Optional[str]) -> str:
    return unicodedata.normalize("NFKC", value or "")


def classify_category(prop: dict) -> Optional[str]:
    """property_type / title / 本文 から物件種別カテゴリを推定する。"""
    ptype = _nfkc(prop.get("property_type"))
    title = _nfkc(prop.get("title"))
    head = _nfkc((prop.get("raw_text") or "")[:600])

    def pick(text: str) -> Optional[str]:
        if not text:
            return None
        if re.search(r"土地|用地|売地|商業地|宅地", text) and "一棟" not in text and "建物" not in text:
            return "土地"
        if "区分" in text:
            return "区分マンション"
        if "アパート" in text:
            return "一棟アパート"
        if re.search(r"ビル|店舗|テナント|事務所|オフィス", text):
            return "一棟ビル"
        if "一棟" in text or "収益" in text:
            return "一棟マンション"
        if "戸建" in text:
            return "戸建"
        if "マンション" in text:
            return "区分マンション"
        return None

    by_type, by_title = pick(ptype), pick(title)
    # 種別ラベルが「一棟」「一棟収益」のように用途まで書かれていない場合は、
    # タイトル(「○○ビル」「○○アパート」等)からより具体的な種別を採用する
    if by_type == "一棟マンション" and by_title in ("一棟アパート", "一棟ビル"):
        return by_title
    if by_type or by_title:
        return by_type or by_title

    # 「○○ 603号室」のような部屋番号付きの物件名、または間取りがあり
    # 一棟物件の指標(総戸数・建物面積)がないものは区分マンションとみなす
    if re.search(r"\d+\s*号室", title):
        return "区分マンション"
    if re.search(r"\d[SLDK]", _nfkc(prop.get("layout"))) and not prop.get("units") and not prop.get("building_tsubo_label"):
        return "区分マンション"

    # 種別ラベルもタイトルもない場合は本文冒頭から推定する。土地は「土地」の
    # 単語が建物付き物件の説明(土地面積等)にも頻出するため、本文からは
    # 「更地」「建築条件」等の土地売り特有の語がある場合に限る
    if re.search(r"更地|建築条件|古家付", head):
        return "土地"
    if re.search(r"一棟|収益", head):
        if "アパート" in head:
            return "一棟アパート"
        if re.search(r"ビル|店舗|テナント", head):
            return "一棟ビル"
        return "一棟マンション"
    if "区分" in head:
        return "区分マンション"
    if "戸建" in head:
        return "戸建"
    return None


def parse_yield(label: Optional[str]) -> Optional[float]:
    m = re.search(r"([\d.]+)", _nfkc(label))
    if not m:
        return None
    try:
        value = float(m.group(1))
    except ValueError:
        return None
    return value if 0 < value < 100 else None


def parse_built_year(label: Optional[str]) -> Optional[int]:
    """「築8年」「1992年」「平成2年」「2026年4月竣工」等から西暦の竣工年を返す。"""
    text = _nfkc(label)
    if not text:
        return None
    if "新築" in text:
        return date.today().year
    m = re.search(r"築\s*(\d+)\s*年", text)
    if m:
        return date.today().year - int(m.group(1))
    m = re.search(r"(明治|大正|昭和|平成|令和)\s*(元|\d{1,2})\s*年", text)
    if m:
        n = 1 if m.group(2) == "元" else int(m.group(2))
        return _ERA_BASE[m.group(1)] + n
    m = re.search(r"((?:19|20)\d{2})\s*年", text)
    if m:
        return int(m.group(1))
    m = re.search(r"\b((?:19|20)\d{2})\b", text)
    if m:
        return int(m.group(1))
    return None


def parse_age(label: Optional[str]) -> Optional[int]:
    year = parse_built_year(label)
    if year is None:
        return None
    return max(0, date.today().year - year)


def parse_tsubo(label: Optional[str]) -> Optional[float]:
    m = re.search(r"([\d,.]+)", _nfkc(label))
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None


def land_tsubo(prop: dict) -> Optional[float]:
    value = parse_tsubo(prop.get("land_tsubo_label"))
    if value is not None:
        return value
    # 土地物件で面積が㎡でしか取れていない場合は坪へ換算する
    if classify_category(prop) == "土地" and prop.get("area_sqm"):
        return round(prop["area_sqm"] / 3.30578, 2)
    return None


def classify_structure(label: Optional[str]) -> Optional[str]:
    text = _nfkc(label)
    if not text:
        return None
    if re.search(r"SRC|RC|鉄筋|鉄骨鉄筋", text):
        return "RC/SRC"
    if re.search(r"鉄骨|S造|軽量", text):
        return "鉄骨"
    if "木" in text:
        return "木造"
    return None


def walk_minutes(access: Optional[str]) -> Optional[int]:
    """アクセス表記中の徒歩分数のうち最小値を返す(複数路線併記に対応)。"""
    text = _nfkc(access)
    values = [int(v) for v in re.findall(r"徒歩\s*(?:約)?\s*(\d+)\s*分", text)]
    if not values:
        values = [int(v) for v in re.findall(r"駅\s*(\d+)\s*分", text)]
    return min(values) if values else None


def normalized_address(prop: dict) -> str:
    """エリア照合に使う文字列。所在地が取れていない場合はタイトルも含める。"""
    parts = [prop.get("address") or "", prop.get("title") or ""]
    return _nfkc(" ".join(parts)).replace(" ", "")


def normalize(prop: dict) -> dict:
    return {
        "category": classify_category(prop),
        "price_yen": prop.get("price_yen"),
        "yield_pct": parse_yield(prop.get("yield_label")),
        "age_years": parse_age(prop.get("built_year")),
        "land_tsubo": land_tsubo(prop),
        "structure": classify_structure(prop.get("structure")),
        "walk_minutes": walk_minutes(prop.get("access")),
        "address": normalized_address(prop),
        "transaction_type": prop.get("transaction_type"),
    }
