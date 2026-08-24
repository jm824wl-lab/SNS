"""業者からのメール本文 / PDFテキストから物件情報を抽出するルールベースの簡易パーサー。

実際の業者メールは「物件名: ○○」のような綺麗なラベル付きフォーマットだけでなく、
「■」「◆」などの記号を使った箇条書きや、ラベルの表記ゆれ(坪/㎡、価格/賃料、
満室想定利回り、等)が多いため、複数パターンでのフォールバック抽出を行う。

将来的に本文フォーマットが多様化した場合は、この関数の差し替え(あるいは
LLMベースの抽出への置き換え)だけで対応できるよう、入出力を
「生テキスト -> 物件フィールドの辞書」に閉じている。
"""

import re
from typing import Optional

# 行頭の箇条書き記号(■◆●○・-　等)を取り除いてからラベルマッチングする
_BULLET_PREFIX = re.compile(r"^[\s　]*[■◆●○・\-\*]+[\s　]*")

# 1通のメールに複数物件が【物件名】のような見出しで併記されているケースを
# 検出するためのパターン(業者メールで頻出する形式)
_LISTING_HEADING = re.compile(r"^[\s　]*[【\[]([^】\]]{2,80})[】\]]\s*$", re.MULTILINE)

# ノイズメール(セミナー案内・交流会案内・休業連絡など)を除外するための
# 「物件情報らしさ」判定に使うキーワード
_PRICE_PATTERN = re.compile(r"(?:[\d,]+\s*億円?|[\d,]+\s*万円|[\d,]{4,}\s*円)")
_SPEC_KEYWORDS = ("所在地", "物件", "駅", "坪", "㎡", "m2", "m²", "間取り", "利回り", "築")


def _strip_bullets(text: str) -> str:
    return "\n".join(_BULLET_PREFIX.sub("", line) for line in text.splitlines())


def _search(pattern: str, text: str) -> Optional[str]:
    m = re.search(pattern, text, re.MULTILINE)
    if not m:
        return None
    return m.group(1).strip()


def _to_int_yen(raw: Optional[str]) -> Optional[int]:
    if not raw:
        return None
    raw = raw.replace(",", "").replace("円", "").strip()

    total = 0.0
    found = False

    oku_match = re.search(r"([\d.]+)\s*億", raw)
    if oku_match:
        total += float(oku_match.group(1)) * 100_000_000
        found = True
        raw = raw[oku_match.end():]

    man_match = re.search(r"([\d.]+)\s*万", raw)
    if man_match:
        total += float(man_match.group(1)) * 10_000
        found = True

    if found:
        return int(total)

    digits = re.sub(r"[^\d]", "", raw)
    return int(digits) if digits else None


def split_listings(raw_text: str) -> list[str]:
    """1通のメール本文に複数物件が【物件名】見出しで併記されている場合、
    物件ごとのテキストに分割する。見出しが1つ以下ならそのまま1件として返す。

    末尾の物件の後に続くテキストには、署名(会社名・連絡先)だけでなく
    最後の物件自体の価格・利回りなどの情報が含まれることがあるため、
    他のチャンクへは一切付与しない(誤って他物件のデータとして
    抽出されるのを防ぐため)。
    """
    matches = list(_LISTING_HEADING.finditer(raw_text))
    if len(matches) < 2:
        return [raw_text]

    chunks = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(raw_text)
        chunk = raw_text[start:end].strip()
        chunks.append(chunk)
    return chunks


def is_property_listing(raw_text: str) -> bool:
    """具体的な物件の紹介メールらしいかどうかを大まかに判定する。

    セミナー案内・交流会案内・休業連絡・買いニーズ募集(具体的な価格を伴わない)
    のようなメールは、業者からのメールであっても一覧化対象の「物件情報」では
    ないため、ここで弾く。完全な判定ではなく簡易的なノイズフィルタ。
    """
    text = raw_text.replace("　", " ")
    if not _PRICE_PATTERN.search(text):
        return False
    keyword_hits = sum(1 for kw in _SPEC_KEYWORDS if kw in text)
    return keyword_hits >= 2


def extract_property(raw_text: str) -> dict:
    text = _strip_bullets(raw_text.replace("　", " "))

    transaction_type = None
    # 「賃貸中」は入居状況を表すだけで取引種別ではないため除外する
    if re.search(r"賃貸(?!中)|募集賃料|賃料[:：]", text):
        transaction_type = "賃貸"
    if re.search(r"売買|販売価格|売主|買取", text):
        transaction_type = "売買"

    title = _search(r"物件名[:：]\s*(.+)", text)
    if not title:
        # 「【エフネスト西所沢】」のような括弧見出し行を最優先で探す
        heading_match = _LISTING_HEADING.search(raw_text)
        if heading_match:
            title = heading_match.group(1).strip()
    if not title:
        # 「■ グランデール北柏」のような見出し行(元テキストで■始まり)を探す
        for line in raw_text.splitlines():
            stripped = line.strip()
            if re.match(r"^[■]\s*\S", stripped):
                title = _BULLET_PREFIX.sub("", stripped).strip()
                break
    if not title:
        first_line = text.strip().splitlines()[0] if text.strip() else ""
        title = re.sub(r"^(件名[:：]\s*)", "", first_line).strip() or "(物件名不明)"

    property_type = _search(r"種別[:：]\s*(.+)", text)
    if not property_type:
        for keyword in ("マンション", "アパート", "戸建て", "戸建", "一棟", "テナントビル", "土地"):
            if keyword in text:
                property_type = keyword
                break

    address = _search(r"所在地[:：]\s*(.+)", text)

    access = _search(r"(?:最寄駅|交通)[:：]\s*(.+)", text)
    if not access:
        station_match = re.search(r"[「『]([^「」『』]{2,12})[」』]?\s*駅\s*徒歩\s*(\d+)\s*分", text)
        if station_match:
            access = f"{station_match.group(1)}駅 徒歩{station_match.group(2)}分"
        else:
            station_match = re.search(r"([^\s、。]{2,12}駅)\s*徒歩\s*(\d+)\s*分", text)
            if station_match:
                access = f"{station_match.group(1)} 徒歩{station_match.group(2)}分"

    layout = _search(r"間取り[:：]\s*(.+)", text)

    area_raw = _search(r"(?:専有面積|面積)[:：]\s*([\d.]+)\s*(?:㎡|m2|m²)", text)
    area_sqm = float(area_raw) if area_raw else None

    land_tsubo = _search(r"土地[:：]?\s*([\d.]+)\s*坪", text)
    building_tsubo = _search(r"建物[:：]?\s*([\d.]+)\s*坪", text)

    built_year = _search(r"築年数[:：]\s*(.+)", text)
    if not built_year:
        built_year = _search(r"(築\s*\d+\s*年)", text)

    structure = _search(r"((?:RC|SRC|S|木)造[^\n、。]*)", text)
    units = _search(r"(全\s*\d+\s*戸)", text)
    yield_label = _search(r"(?:満室想定)?利回り[:：]?\s*(?:約)?\s*([\d.]+\s*[%％])", text)

    # 「価格」ラベルは売買、「賃料」ラベルは賃貸を意味するため、実際にどちらの
    # ラベルにマッチしたかで/月表記を判断する(transaction_typeは「賃貸中」等の
    # 入居状況の記述にも反応してしまうため、価格表記の判断には使わない)
    price_raw = _search(r"(?:価格|販売価格)[:：]\s*(.+)", text)
    is_rent_price = False
    if not price_raw:
        price_raw = _search(r"(?:賃料|募集賃料)[:：]\s*(.+)", text)
        is_rent_price = price_raw is not None
    if price_raw:
        # 同じ行に「価格：○○万円 利回り：△％」のように後続情報が
        # 続くケースがあるため、価格以外の情報が始まる位置で切り詰める
        price_raw = re.split(r"[\s　]*(?:利回り|想定利回り|年間賃料収入)", price_raw)[0].strip()

    price_yen = _to_int_yen(price_raw)
    price_label = price_raw.strip() if price_raw else None
    if price_label and is_rent_price and "円" in price_label and "/" not in price_label and "月" not in price_label:
        price_label = f"{price_label}/月"

    agent_name = _search(r"担当[:：]\s*(.+)", text)
    if not agent_name:
        company_match = re.search(r"(株式会社[\s　]?[^\s\n]{1,20}|[^\s\n]{1,20}株式会社)", text)
        if company_match:
            agent_name = company_match.group(1).strip()

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
        "land_tsubo_label": f"{land_tsubo}坪" if land_tsubo else None,
        "building_tsubo_label": f"{building_tsubo}坪" if building_tsubo else None,
        "structure": structure,
        "units": units,
        "yield_label": yield_label,
    }
