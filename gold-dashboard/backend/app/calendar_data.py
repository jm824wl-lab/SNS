"""Mock economic calendar — events with elevated relevance to gold trading.

Sample/mock data only — see README for the intended swap-in point for a
real economic-calendar API.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

_TODAY = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def _at(days_from_today: int, hour: int, minute: int = 0) -> str:
    dt = _TODAY + timedelta(days=days_from_today, hours=hour, minutes=minute)
    return dt.isoformat()


_EVENTS = [
    dict(
        days=2,
        hour=21,
        minute=30,
        country="US",
        name="米新規失業保険申請件数",
        importance="low",
        previous="224K",
        forecast="228K",
        note="labor market の先行指標。予想比の強弱がドル・金利観測に影響。",
    ),
    dict(
        days=5,
        hour=21,
        minute=30,
        country="US",
        name="米雇用統計(非農業部門雇用者数)",
        importance="high",
        previous="+142K",
        forecast="+150K",
        note="利下げ観測を左右する最重要指標の一つ。強い結果はドル高・金の重石に。",
    ),
    dict(
        days=9,
        hour=15,
        minute=0,
        country="US",
        name="ISM製造業景況指数",
        importance="medium",
        previous="48.5",
        forecast="49.0",
        note="景気減速懸念が強まると質への逃避で金が買われやすい。",
    ),
    dict(
        days=12,
        hour=13,
        minute=45,
        country="EU",
        name="ECB政策金利発表",
        importance="medium",
        previous="2.25%",
        forecast="据え置き予想",
        note="ユーロ・ドルの相対金利差を通じてドルインデックス経由で金に波及。",
    ),
    dict(
        days=15,
        hour=21,
        minute=30,
        country="US",
        name="米消費者物価指数(CPI)",
        importance="high",
        previous="+2.6% y/y",
        forecast="+2.5% y/y",
        note="インフレ指標。予想を下回れば利下げ観測強化・金にプラス。",
    ),
    dict(
        days=16,
        hour=3,
        minute=0,
        country="JP",
        name="日銀金融政策決定会合",
        importance="medium",
        previous="据え置き",
        forecast="据え置き予想",
        note="国内金価格(円建て)はドル円経由で影響を受けやすい。",
    ),
    dict(
        days=18,
        hour=21,
        minute=30,
        country="US",
        name="米小売売上高",
        importance="medium",
        previous="+0.3% m/m",
        forecast="+0.2% m/m",
        note="個人消費の強弱がFRBの政策判断材料に。",
    ),
    dict(
        days=22,
        hour=3,
        minute=0,
        country="US",
        name="FOMC政策金利発表",
        importance="high",
        previous="3.75-4.00%",
        forecast="0.25%利下げ予想",
        note="金相場にとって最大級のイベント。声明・会見のトーンにボラティリティ拡大。",
    ),
]


def list_calendar() -> list[dict]:
    items = []
    for idx, raw in enumerate(_EVENTS):
        items.append(
            {
                "id": idx + 1,
                "datetime": _at(raw["days"], raw["hour"], raw["minute"]),
                "country": raw["country"],
                "name": raw["name"],
                "importance": raw["importance"],
                "previous": raw["previous"],
                "forecast": raw["forecast"],
                "note": raw["note"],
            }
        )
    return sorted(items, key=lambda x: x["datetime"])
