"""物件と会社ごとの購入クライテリアを照合し、紹介候補の会社を判定する。

各条件は「適合(ok) / 不適合(ng) / 判定不能(unknown: 物件側の情報が不足)」の
3値で評価する。不適合が1つもない会社を紹介候補とし、未設定の条件は評価しない。
業者メールは項目が欠けていることが多いため、情報不足だけで候補から外すことは
せず、判定不能の条件は画面上で「要確認」として明示する。
"""

from typing import Optional

from .normalize import normalize

# エリア指定で使えるまとめ表記(物件の所在地にいずれかが含まれれば適合)
AREA_PRESETS: dict[str, list[str]] = {
    "東京23区": [
        "千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区", "江東区",
        "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区", "杉並区", "豊島区",
        "北区", "荒川区", "板橋区", "練馬区", "足立区", "葛飾区", "江戸川区",
    ],
    "都心5区": ["千代田区", "中央区", "港区", "新宿区", "渋谷区"],
    "城南": ["品川区", "目黒区", "大田区", "世田谷区"],
    "城西": ["新宿区", "渋谷区", "中野区", "杉並区", "練馬区"],
    "城北": ["豊島区", "北区", "板橋区", "文京区"],
    "城東": ["台東区", "墨田区", "江東区", "荒川区", "足立区", "葛飾区", "江戸川区"],
    "東京都下": ["八王子市", "立川市", "武蔵野市", "三鷹市", "府中市", "調布市", "町田市", "小金井市", "国分寺市", "国立市", "西東京市", "多摩市", "日野市"],
    "一都三県": ["東京都", "神奈川県", "埼玉県", "千葉県", "横浜市", "川崎市", "さいたま市", "千葉市"],
    "大阪市": ["大阪市", "大阪府大阪市"],
}

# 「北区」「中央区」は他の政令市にも存在するため、東京の区として照合する場合は
# 所在地に他都市名が含まれていないことを確認する
_OTHER_CITIES_WITH_WARDS = ("大阪", "名古屋", "札幌", "横浜", "川崎", "さいたま", "千葉市", "神戸", "京都", "福岡", "仙台", "広島", "相模原", "浜松", "静岡", "新潟", "堺", "岡山", "熊本")


def _expand_areas(areas: list[str]) -> list[str]:
    expanded: list[str] = []
    for area in areas:
        area = area.strip()
        if not area:
            continue
        expanded.extend(AREA_PRESETS.get(area, [area]))
    return expanded


def _area_hit(address: str, area: str) -> bool:
    if area not in address:
        return False
    # 「大阪市北区」「名古屋市中区」等に対して東京の「北区」「港区」等が
    # 誤ってヒットするのを防ぐ
    if (
        area in AREA_PRESETS["東京23区"]
        and "東京都" not in address
        and any(city in address for city in _OTHER_CITIES_WITH_WARDS)
    ):
        return False
    return True


def _fmt_man(yen: Optional[float]) -> str:
    if yen is None:
        return "-"
    man = yen / 10_000
    if man >= 10_000:
        return f"{man / 10_000:,.2f}億円".replace(".00億", "億")
    return f"{man:,.0f}万円"


def _check(label: str, status: str, detail: str) -> dict:
    return {"label": label, "status": status, "detail": detail}


def evaluate(norm: dict, raw_text: str, criteria: dict) -> list[dict]:
    """1社分のクライテリアを評価し、条件ごとの判定結果を返す。"""
    checks: list[dict] = []
    c = criteria or {}

    categories = c.get("categories") or []
    if categories:
        cat = norm["category"]
        if cat is None:
            checks.append(_check("種別", "unknown", f"物件種別を判定できません(希望: {'・'.join(categories)})"))
        elif cat in categories:
            checks.append(_check("種別", "ok", cat))
        else:
            checks.append(_check("種別", "ng", f"{cat}(希望: {'・'.join(categories)})"))

    areas = c.get("areas") or []
    excluded = c.get("excluded_areas") or []
    address = norm["address"]
    if areas or excluded:
        if not address:
            checks.append(_check("エリア", "unknown", "所在地が不明です"))
        else:
            hit_excluded = next((a for a in _expand_areas(excluded) if _area_hit(address, a)), None)
            if hit_excluded:
                checks.append(_check("エリア", "ng", f"除外エリア「{hit_excluded}」に該当"))
            elif areas:
                hit = next((a for a in _expand_areas(areas) if _area_hit(address, a)), None)
                if hit:
                    checks.append(_check("エリア", "ok", f"「{hit}」に該当"))
                else:
                    checks.append(_check("エリア", "ng", f"対象エリア外(希望: {'・'.join(areas)})"))
            else:
                checks.append(_check("エリア", "ok", "除外エリア外"))

    min_man, max_man = c.get("min_price_man"), c.get("max_price_man")
    if min_man is not None or max_man is not None:
        price = norm["price_yen"]
        want = f"{_fmt_man(min_man * 10_000) if min_man is not None else ''}〜{_fmt_man(max_man * 10_000) if max_man is not None else ''}"
        if price is None or norm["transaction_type"] == "賃貸":
            checks.append(_check("価格", "unknown", f"売買価格が不明です(希望: {want})"))
        elif (min_man is not None and price < min_man * 10_000) or (max_man is not None and price > max_man * 10_000):
            checks.append(_check("価格", "ng", f"{_fmt_man(price)}(希望: {want})"))
        else:
            checks.append(_check("価格", "ok", _fmt_man(price)))

    min_yield = c.get("min_yield_pct")
    if min_yield is not None and norm["category"] not in ("土地", "戸建"):
        y = norm["yield_pct"]
        if y is None:
            checks.append(_check("利回り", "unknown", f"利回りが不明です(希望: {min_yield}%以上)"))
        elif y >= min_yield:
            checks.append(_check("利回り", "ok", f"{y}%"))
        else:
            checks.append(_check("利回り", "ng", f"{y}%(希望: {min_yield}%以上)"))

    max_age = c.get("max_age_years")
    if max_age is not None and norm["category"] != "土地":
        age = norm["age_years"]
        if age is None:
            checks.append(_check("築年数", "unknown", f"築年数が不明です(希望: 築{max_age}年以内)"))
        elif age <= max_age:
            checks.append(_check("築年数", "ok", f"築{age}年"))
        else:
            checks.append(_check("築年数", "ng", f"築{age}年(希望: 築{max_age}年以内)"))

    structures = c.get("structures") or []
    if structures and norm["category"] != "土地":
        s = norm["structure"]
        if s is None:
            checks.append(_check("構造", "unknown", f"構造が不明です(希望: {'・'.join(structures)})"))
        elif s in structures:
            checks.append(_check("構造", "ok", s))
        else:
            checks.append(_check("構造", "ng", f"{s}(希望: {'・'.join(structures)})"))

    min_land, max_land = c.get("min_land_tsubo"), c.get("max_land_tsubo")
    if min_land is not None or max_land is not None:
        land = norm["land_tsubo"]
        want = f"{min_land if min_land is not None else ''}〜{max_land if max_land is not None else ''}坪"
        if land is None:
            checks.append(_check("土地面積", "unknown", f"土地面積が不明です(希望: {want})"))
        elif (min_land is not None and land < min_land) or (max_land is not None and land > max_land):
            checks.append(_check("土地面積", "ng", f"{land}坪(希望: {want})"))
        else:
            checks.append(_check("土地面積", "ok", f"{land}坪"))

    max_walk = c.get("max_walk_minutes")
    if max_walk is not None:
        walk = norm["walk_minutes"]
        if walk is None:
            checks.append(_check("駅徒歩", "unknown", f"駅徒歩分数が不明です(希望: {max_walk}分以内)"))
        elif walk <= max_walk:
            checks.append(_check("駅徒歩", "ok", f"徒歩{walk}分"))
        else:
            checks.append(_check("駅徒歩", "ng", f"徒歩{walk}分(希望: {max_walk}分以内)"))

    ng_keywords = [k.strip() for k in (c.get("ng_keywords") or []) if k.strip()]
    if ng_keywords:
        hit = next((k for k in ng_keywords if k in (raw_text or "")), None)
        if hit:
            checks.append(_check("NGワード", "ng", f"本文に「{hit}」を含む"))
        else:
            checks.append(_check("NGワード", "ok", "該当なし"))

    return checks


def summarize(buyer: dict, checks: list[dict]) -> dict:
    ok = sum(1 for ch in checks if ch["status"] == "ok")
    ng = sum(1 for ch in checks if ch["status"] == "ng")
    unknown = sum(1 for ch in checks if ch["status"] == "unknown")
    evaluated = ok + ng + unknown
    if ng == 0:
        verdict = "match" if unknown == 0 else "possible"
    elif ng == 1:
        verdict = "near"
    else:
        verdict = "unmatched"
    score = round(100 * ok / evaluated) if evaluated else 0
    return {
        "buyer_id": buyer["id"],
        "buyer_name": buyer["name"],
        "contact_name": buyer.get("contact_name"),
        "contact_email": buyer.get("contact_email"),
        "verdict": verdict,
        "score": score,
        "ok_count": ok,
        "ng_count": ng,
        "unknown_count": unknown,
        "checks": checks,
    }


_VERDICT_ORDER = {"match": 0, "possible": 1, "near": 2, "unmatched": 3}


def match_property(prop: dict, buyers: list[dict]) -> dict:
    """物件1件に対し、有効な全社を評価して紹介優先度順に並べる。"""
    norm = normalize(prop)
    results = []
    for buyer in buyers:
        if not buyer.get("active", True):
            continue
        checks = evaluate(norm, prop.get("raw_text") or "", buyer.get("criteria") or {})
        results.append(summarize(buyer, checks))
    results.sort(key=lambda r: (_VERDICT_ORDER[r["verdict"]], -r["score"], -r["ok_count"], r["buyer_name"]))
    return {"normalized": norm, "results": results}
