"""業者からのメール本文 / PDFテキストから物件情報を抽出するルールベースの簡易パーサー。

将来的に本文フォーマットが多様化した場合は、この関数の差し替え(あるいは
LLMベースの抽出への置き換え)だけで対応できるよう、入出力を
「生テキスト -> 物件フィールドの辞書」に閉じている。
"""

import re
from typing import Optional


def _search(pattern: str, text: str) -> Optional[str]:
    m = re.search(pattern, text, re.MULTILINE)
    if not m:
        return None
    return m.group(1).strip()


def _to_int_yen(raw: Optional[str]) -> Optional[int]:
    if not raw:
        return None
    raw = raw.replace(",", "").replace("円", "").strip()
    man_match = re.search(r"([\d.]+)\s*万", raw)
    if man_match:
        try:
            return int(float(man_match.group(1)) * 10000)
        except ValueError:
            return None
    digits = re.sub(r"[^\d]", "", raw)
    return int(digits) if digits else None


def extract_property(raw_text: str) -> dict:
    text = raw_text.replace("　", " ")

    transaction_type = None
    if re.search(r"賃貸|募集賃料|賃料", text):
        transaction_type = "賃貸"
    if re.search(r"売買|販売価格|売主", text):
        transaction_type = "売買"

    title = _search(r"物件名[:：]\s*(.+)", text)
    if not title:
        first_line = text.strip().splitlines()[0] if text.strip() else ""
        title = re.sub(r"^(件名[:：]\s*)", "", first_line).strip() or "(物件名不明)"

    property_type = _search(r"種別[:：]\s*(.+)", text)

    address = _search(r"所在地[:：]\s*(.+)", text)
    access = _search(r"(?:最寄駅|交通)[:：]\s*(.+)", text)
    layout = _search(r"間取り[:：]\s*(.+)", text)

    area_raw = _search(r"(?:専有面積|面積)[:：]\s*([\d.]+)\s*(?:㎡|m2|m²)", text)
    area_sqm = float(area_raw) if area_raw else None

    built_year = _search(r"築年数[:：]\s*(.+)", text)

    price_raw = None
    if transaction_type == "売買":
        price_raw = _search(r"(?:価格|販売価格)[:：]\s*(.+)", text)
    else:
        price_raw = _search(r"(?:賃料|募集賃料)[:：]\s*(.+)", text)
    if not price_raw:
        price_raw = _search(r"(?:価格|賃料)[:：]\s*(.+)", text)

    price_yen = _to_int_yen(price_raw)
    price_label = price_raw.strip() if price_raw else None
    if price_label and transaction_type == "賃貸" and "円" in price_label and "/" not in price_label and "月" not in price_label:
        price_label = f"{price_label}/月"

    agent_name = _search(r"担当[:：]\s*(.+)", text)

    return {
        "title": title,
        "transaction_type": transaction_type,
        "property_type": property_type,
        "address": address,
        "access": access,
        "layout": layout,
        "area_sqm": area_sqm,
        "built_year": built_year,
        "price_label": price_label,
        "price_yen": price_yen,
        "agent_name": agent_name,
    }
