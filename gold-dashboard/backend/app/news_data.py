"""Mock market news feed.

Sample/mock data only — see README for the intended swap-in point for a
real news API.
"""
from __future__ import annotations

import time

_NOW = time.time()
_HOUR = 3600.0

_RAW_ITEMS = [
    dict(
        hours_ago=1.2,
        impact="high",
        source="ロイター",
        title="FRB高官、利下げペースは「データ次第」と発言 金は上値試す",
        summary=(
            "米連邦準備理事会(FRB)高官が講演で、追加利下げの是非は今後の雇用・物価指標"
            "次第との見解を示した。実質金利低下観測が支援材料となり、金相場は堅調地合いを維持。"
        ),
        related=["XAUUSD", "DXY", "US10Y"],
    ),
    dict(
        hours_ago=3.5,
        impact="high",
        source="ブルームバーグ",
        title="中国人民銀行、9カ月連続で金準備を積み増し",
        summary=(
            "中国人民銀行(PBOC)の外貨準備統計で、金保有量が9カ月連続で増加したことが判明。"
            "新興国中央銀行による外貨準備の分散需要が、金の下値を支える構造要因として引き続き意識される。"
        ),
        related=["XAUUSD"],
    ),
    dict(
        hours_ago=6.0,
        impact="medium",
        source="Kitco News",
        title="金ETF(SPDRゴールド・シェア)、残高が3営業日連続で増加",
        summary=(
            "世界最大の金ETFであるSPDRゴールド・シェアの保有残高が3営業日連続で増加。"
            "投機筋だけでなく実需資金の流入が続いており、市場心理の改善を示唆している。"
        ),
        related=["XAUUSD"],
    ),
    dict(
        hours_ago=9.0,
        impact="medium",
        source="日本経済新聞",
        title="国内金価格、円安一服も高値圏でもみ合い",
        summary=(
            "国内の金小売価格は、ドル建て金価格の高止まりとドル円相場の一服感から、"
            "1グラムあたり過去最高値圏でのもみ合いとなっている。個人投資家の売却も増加傾向。"
        ),
        related=["GOLDJPYG", "USDJPY"],
    ),
    dict(
        hours_ago=13.0,
        impact="high",
        source="ロイター",
        title="中東情勢緊迫化、安全資産としての金買いが再燃",
        summary=(
            "中東での地政学的リスクの高まりを受け、逃避需要から金先物に買いが入った。"
            "原油相場も上昇し、インフレ再燃への警戒感も金相場の追い風となっている。"
        ),
        related=["XAUUSD", "WTI"],
    ),
    dict(
        hours_ago=20.0,
        impact="medium",
        source="ブルームバーグ",
        title="ドルインデックス、主要通貨に対して軟化",
        summary=(
            "米長期金利の上昇一服を背景にドルが主要通貨に対して軟化。"
            "ドル建てで取引される金にとっては相対的な割安感につながりやすい地合い。"
        ),
        related=["DXY", "XAUUSD"],
    ),
    dict(
        hours_ago=27.0,
        impact="low",
        source="Kitco News",
        title="テクニカル分析:金は主要移動平均線上をキープ",
        summary=(
            "金価格は50日・200日移動平均線をいずれも上回って推移しており、"
            "中期的な上昇トレンドは崩れていないとアナリストは指摘する。"
        ),
        related=["XAUUSD"],
    ),
    dict(
        hours_ago=33.0,
        impact="medium",
        source="ロイター",
        title="インド、祝祭シーズンを控え金の現物需要が季節的に増加",
        summary=(
            "インドでは結婚式シーズンや祝祭を控え、宝飾品向けの金現物需要が季節的に拡大。"
            "現地プレミアムも上昇しており、アジア市場の実需が価格の下支え要因となっている。"
        ),
        related=["XAUUSD"],
    ),
    dict(
        hours_ago=41.0,
        impact="low",
        source="日本経済新聞",
        title="鉱山各社、金採掘コストの上昇を決算で報告",
        summary=(
            "大手鉱山会社の四半期決算で、エネルギーコストや人件費上昇を背景に"
            "採掘コスト(AISC)の増加が相次いで報告された。供給サイドのコスト高が価格の下支えとの見方も。"
        ),
        related=["XAUUSD"],
    ),
]


def list_news() -> list[dict]:
    items = []
    for idx, raw in enumerate(_RAW_ITEMS):
        published_at = _NOW - raw["hours_ago"] * _HOUR
        items.append(
            {
                "id": idx + 1,
                "title": raw["title"],
                "summary": raw["summary"],
                "source": raw["source"],
                "impact": raw["impact"],
                "related_symbols": raw["related"],
                "published_at": published_at,
            }
        )
    return sorted(items, key=lambda x: x["published_at"], reverse=True)
