"""Economic calendar via the FRED (Federal Reserve Bank of St. Louis) API.

FRED's `release/dates` endpoint gives real, official publication dates for
US economic data series — but no forecast/consensus or "previous value"
figures (FRED isn't a forecasting service, it's the data itself). Those
two fields are intentionally left `None` here rather than faked.

Requires a free FRED_API_KEY (see backend/.env.example) — sign up at
https://fred.stlouisfed.org/docs/api/api_key.html.
"""
from __future__ import annotations

import time

import requests

from . import config

FRED_BASE = "https://api.stlouisfed.org/fred"
RELEASES_TTL_SECONDS = 86400
DATES_TTL_SECONDS = 3600
REQUEST_TIMEOUT = 10

# (substring matched case-insensitively against the FRED release name, importance, note)
_KEYWORD_RULES: list[tuple[str, str, str]] = [
    ("Employment Situation", "high", "米雇用統計。利下げ観測を左右する最重要指標の一つ。強い結果はドル高・金の重石に。"),
    ("Consumer Price Index", "high", "インフレ指標。予想を下回れば利下げ観測強化・金にプラスに働きやすい。"),
    ("Personal Income and Outlays", "high", "PCEデフレーターを含み、FRBが重視するインフレ指標。"),
    ("Federal Open Market Committee", "high", "金相場にとって最大級のイベント。声明・会見のトーンにボラティリティ拡大。"),
    ("Producer Price Index", "medium", "川上インフレの指標。CPIの先行指標として金利観測に影響。"),
    ("Gross Domestic Product", "medium", "景気の全体像。減速確認は質への逃避で金買いにつながりやすい。"),
    ("Advance Monthly Sales for Retail", "medium", "個人消費の強弱がFRBの政策判断材料に。"),
    ("Import/Export Price Indexes", "low", "貿易物価の動向。インフレ圧力の副次的な手がかり。"),
]


class CalendarDataError(RuntimeError):
    """Raised when the FRED-backed calendar can't be fetched (e.g. missing API key)."""


_releases_cache: tuple[float, list[dict]] | None = None
_dates_cache: dict[int, tuple[float, list[str]]] = {}


def _require_api_key() -> None:
    if not config.FRED_API_KEY:
        raise CalendarDataError(
            "FRED_API_KEY が設定されていません。backend/.env に FRED_API_KEY=... を設定してください"
            "(https://fred.stlouisfed.org/docs/api/api_key.html で無料取得できます)。"
        )


def _matched_releases() -> list[dict]:
    global _releases_cache
    now = time.time()
    if _releases_cache and now - _releases_cache[0] < RELEASES_TTL_SECONDS:
        return _releases_cache[1]

    _require_api_key()
    resp = requests.get(
        f"{FRED_BASE}/releases",
        params={"api_key": config.FRED_API_KEY, "file_type": "json"},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    releases = resp.json().get("releases", [])

    matched = []
    for release in releases:
        name = release.get("name", "")
        for keyword, importance, note in _KEYWORD_RULES:
            if keyword.lower() in name.lower():
                matched.append({"id": release["id"], "name": name, "importance": importance, "note": note})
                break

    _releases_cache = (now, matched)
    return matched


def _release_upcoming_dates(release_id: int) -> list[str]:
    now = time.time()
    cached = _dates_cache.get(release_id)
    if cached and now - cached[0] < DATES_TTL_SECONDS:
        return cached[1]

    resp = requests.get(
        f"{FRED_BASE}/release/dates",
        params={
            "release_id": release_id,
            "api_key": config.FRED_API_KEY,
            "file_type": "json",
            "sort_order": "asc",
            "include_release_dates_with_no_data": "true",
        },
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    dates = [d["date"] for d in resp.json().get("release_dates", [])]

    _dates_cache[release_id] = (now, dates)
    return dates


def list_calendar() -> list[dict]:
    releases = _matched_releases()
    today = time.strftime("%Y-%m-%d", time.gmtime())

    events = []
    for release in releases:
        try:
            dates = _release_upcoming_dates(release["id"])
        except CalendarDataError:
            raise
        except Exception:  # noqa: BLE001 - one bad release shouldn't break the rest
            continue

        upcoming = [d for d in dates if d >= today][:2]
        for date in upcoming:
            events.append(
                {
                    "datetime": f"{date}T00:00:00+00:00",
                    "country": "US",
                    "name": release["name"],
                    "importance": release["importance"],
                    "previous": None,
                    "forecast": None,
                    "note": release["note"],
                }
            )

    events.sort(key=lambda e: e["datetime"])
    for idx, ev in enumerate(events):
        ev["id"] = idx + 1
    return events[:12]
