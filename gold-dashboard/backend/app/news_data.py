"""Market news via Google News RSS search — no API key required.

Google News RSS (`news.google.com/rss/search`) is a keyless, stable way to
pull recent headlines for a query. It has no concept of "impact" or
"related symbols", so those are derived with simple keyword heuristics on
the headline text — a best-effort classification, not a real editorial
rating.
"""
from __future__ import annotations

import calendar
import html
import re
import time
from urllib.parse import quote

import feedparser

NEWS_TTL_SECONDS = 600
_USER_AGENT = "Mozilla/5.0 (compatible; GoldTraderDashboard/1.0)"

_QUERIES = [
    "金価格 OR ゴールド相場",
    "FRB 利下げ OR FOMC",
    "米雇用統計 OR CPI インフレ",
]

_HIGH_IMPACT_KEYWORDS = ["FOMC", "FRB", "利上げ", "利下げ", "CPI", "雇用統計", "パウエル", "GDP"]
_MEDIUM_IMPACT_KEYWORDS = ["ドル", "円安", "円高", "ETF", "中央銀行", "インフレ", "金利"]

_SYMBOL_KEYWORDS = {
    "USDJPY": ["ドル円", "円安", "円高"],
    "DXY": ["ドル指数", "ドルインデックス"],
    "WTI": ["原油"],
    "US10Y": ["米国債", "国債利回り"],
}

_news_cache: tuple[float, list[dict]] | None = None


def _classify_impact(title: str) -> str:
    if any(kw in title for kw in _HIGH_IMPACT_KEYWORDS):
        return "high"
    if any(kw in title for kw in _MEDIUM_IMPACT_KEYWORDS):
        return "medium"
    return "low"


def _related_symbols(title: str) -> list[str]:
    symbols = ["XAUUSD"]
    for symbol, keywords in _SYMBOL_KEYWORDS.items():
        if any(kw in title for kw in keywords):
            symbols.append(symbol)
    return symbols


def _clean_summary(raw_summary: str, title: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw_summary or "")
    text = html.unescape(text).strip()
    text = re.sub(r"\s+", " ", text)
    if not text or text == title:
        return ""
    return text[:200]


def _split_source(title: str) -> tuple[str, str]:
    if " - " in title:
        headline, source = title.rsplit(" - ", 1)
        return headline.strip(), source.strip()
    return title.strip(), "Google News"


def _fetch_query(query: str) -> list[dict]:
    url = f"https://news.google.com/rss/search?q={quote(query)}&hl=ja&gl=JP&ceid=JP:ja"
    feed = feedparser.parse(url, agent=_USER_AGENT)
    items = []
    for entry in feed.entries[:8]:
        raw_title = getattr(entry, "title", "").strip()
        if not raw_title:
            continue
        headline, source = _split_source(raw_title)

        if getattr(entry, "published_parsed", None):
            published_at = calendar.timegm(entry.published_parsed)
        else:
            published_at = time.time()

        items.append(
            {
                "title": headline,
                "summary": _clean_summary(getattr(entry, "summary", ""), raw_title),
                "source": source,
                "impact": _classify_impact(headline),
                "related_symbols": _related_symbols(headline),
                "published_at": published_at,
            }
        )
    return items


def _fetch_all() -> list[dict]:
    seen_titles: set[str] = set()
    merged: list[dict] = []
    for query in _QUERIES:
        try:
            for item in _fetch_query(query):
                if item["title"] in seen_titles:
                    continue
                seen_titles.add(item["title"])
                merged.append(item)
        except Exception:  # noqa: BLE001 - one bad feed shouldn't break the rest
            continue

    merged.sort(key=lambda x: x["published_at"], reverse=True)
    for idx, item in enumerate(merged):
        item["id"] = idx + 1
    return merged


def list_news() -> list[dict]:
    global _news_cache
    now = time.time()
    if _news_cache and now - _news_cache[0] < NEWS_TTL_SECONDS:
        return _news_cache[1]

    items = _fetch_all()
    if not items and _news_cache:
        return _news_cache[1]

    _news_cache = (now, items)
    return items
