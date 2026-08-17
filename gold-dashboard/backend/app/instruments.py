"""Instrument definitions and live-price fetching via Yahoo Finance (yfinance)
and Stooq (for precious-metals spot prices, which Yahoo doesn't carry).

Yahoo Finance has no official public API; `yfinance` works against Yahoo's
internal endpoints and can occasionally change shape or rate-limit. Every
call here is defensive: on failure we fall back to the last good cached
value instead of raising, so a transient hiccup doesn't take the whole
dashboard down.

Yahoo has no true spot ticker for gold/silver (`XAUUSD=X`/`XAU=X` don't
exist — confirmed via 404 from Yahoo's own API) — only COMEX futures
(`GC=F`/`SI=F`), which trade at a small premium to spot (contango). For
those two instruments we pull the live quote from Stooq's free, keyless
`xauusd`/`xagusd` symbols instead, and rebase the Yahoo-futures-derived
chart onto that real spot level so the live price and the chart agree.
"""
from __future__ import annotations

import csv
import io
import time
from dataclasses import dataclass

import requests
import yfinance as yf

QUOTE_TTL_SECONDS = 10
HISTORY_TTL_SECONDS = 300
STOOQ_REQUEST_TIMEOUT = 10


@dataclass
class InstrumentSpec:
    symbol: str
    name_ja: str
    name_en: str
    unit: str
    # Yahoo Finance ticker candidates, tried in order until one works.
    yahoo_tickers: tuple[str, ...]
    decimals: int = 2
    # Yahoo quotes some series (e.g. ^TNX) scaled by this factor vs. the
    # real-world value; divide by it to get the displayed value.
    scale_divisor: float = 1.0
    # Stooq symbol for the true spot price (gold/silver only). When set,
    # this is the authoritative source for the live quote; Yahoo tickers
    # remain the source for chart shape (see history()'s rebasing).
    stooq_symbol: str | None = None


INSTRUMENTS: list[InstrumentSpec] = [
    InstrumentSpec("XAUUSD", "金 (スポット)", "Gold Spot", "USD/oz", ("GC=F",), 2, stooq_symbol="xauusd"),
    InstrumentSpec("XAGUSD", "銀 (スポット)", "Silver Spot", "USD/oz", ("SI=F",), 3, stooq_symbol="xagusd"),
    InstrumentSpec("GOLDJPYG", "国内金価格", "Domestic Gold (JPY/g)", "円/g", (), 0),
    InstrumentSpec("USDJPY", "ドル円", "USD/JPY", "円", ("JPY=X", "USDJPY=X"), 2),
    InstrumentSpec("DXY", "ドルインデックス", "US Dollar Index", "pt", ("DX-Y.NYB", "DX=F"), 2),
    # ^TNX is quoted as yield×10 on Yahoo's live ticker page, but the
    # historical Close values returned by history() are already the plain
    # percentage — no scaling needed here.
    InstrumentSpec("US10Y", "米10年国債利回り", "US 10Y Treasury Yield", "%", ("^TNX",), 3),
    InstrumentSpec("WTI", "WTI原油", "WTI Crude Oil", "USD/bbl", ("CL=F",), 2),
    InstrumentSpec("SPX", "S&P500", "S&P 500", "pt", ("^GSPC",), 1),
    InstrumentSpec("NI225", "日経平均先物", "Nikkei 225 Futures", "pt", ("NIY=F", "^N225"), 0),
    InstrumentSpec("DOW", "NYダウ先物", "Dow Jones Futures", "pt", ("YM=F", "^DJI"), 0),
]

INSTRUMENTS_BY_SYMBOL = {spec.symbol: spec for spec in INSTRUMENTS}

_JPY_PER_TROY_OZ_TO_GRAM = 31.1035
_DOMESTIC_PREMIUM = 1.015  # rough spread of domestic bar/coin price over spot-derived value

_quote_cache: dict[str, tuple[float, dict]] = {}
_history_cache: dict[tuple[str, str], tuple[float, list[dict]]] = {}


class MarketDataError(RuntimeError):
    """Raised when live data can't be fetched and no cached fallback exists."""


def _fetch_stooq_quote(stooq_symbol: str) -> dict:
    url = f"https://stooq.com/q/d/l/?s={stooq_symbol}&i=d"
    resp = requests.get(url, timeout=STOOQ_REQUEST_TIMEOUT, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    rows = [
        row
        for row in csv.DictReader(io.StringIO(resp.text))
        if row.get("Close") not in (None, "", "N/D")
    ]
    if not rows:
        raise MarketDataError(f"stooq:{stooq_symbol}: no data")
    price = float(rows[-1]["Close"])
    prev_close = float(rows[-2]["Close"]) if len(rows) >= 2 else price
    return {"price": price, "prev_close": prev_close}


def _fetch_raw_quote(spec: InstrumentSpec) -> dict:
    if spec.stooq_symbol:
        try:
            return _fetch_stooq_quote(spec.stooq_symbol)
        except Exception:  # noqa: BLE001 - fall through to Yahoo futures below
            pass

    # `fast_info` silently returns None for some tickers/environments, so we
    # derive the quote from daily history instead — the same reliable code
    # path `history()` below already uses. The last row is "today so far"
    # (or the latest completed session), the row before it is prior close.
    last_error: Exception | None = None
    for ticker in spec.yahoo_tickers:
        try:
            df = yf.Ticker(ticker).history(period="1mo", interval="1d")
            closes = df["Close"].dropna()
            if len(closes) == 0:
                raise MarketDataError(f"{ticker}: no price data")
            price = float(closes.iloc[-1])
            prev_close = float(closes.iloc[-2]) if len(closes) >= 2 else price
            return {"price": price / spec.scale_divisor, "prev_close": prev_close / spec.scale_divisor}
        except Exception as e:  # noqa: BLE001 - Yahoo failures vary widely
            last_error = e
            continue
    raise MarketDataError(f"{spec.symbol}: all Yahoo tickers failed ({last_error})")


def _quote_raw(symbol: str) -> dict:
    spec = INSTRUMENTS_BY_SYMBOL[symbol]
    now = time.time()
    cached = _quote_cache.get(symbol)
    if cached and now - cached[0] < QUOTE_TTL_SECONDS:
        return cached[1]

    try:
        raw = _fetch_raw_quote(spec)
    except MarketDataError:
        if cached:
            return cached[1]
        raise

    _quote_cache[symbol] = (now, raw)
    return raw


def get_quote(symbol: str) -> dict:
    spec = INSTRUMENTS_BY_SYMBOL[symbol]

    if symbol == "GOLDJPYG":
        gold = get_quote("XAUUSD")
        usdjpy = get_quote("USDJPY")
        price = gold["price"] * usdjpy["price"] / _JPY_PER_TROY_OZ_TO_GRAM * _DOMESTIC_PREMIUM
        prev_close = (
            gold["prev_close"] * usdjpy["prev_close"] / _JPY_PER_TROY_OZ_TO_GRAM * _DOMESTIC_PREMIUM
        )
    else:
        raw = _quote_raw(symbol)
        price = raw["price"]
        prev_close = raw["prev_close"]

    change = price - prev_close
    change_percent = (change / prev_close * 100) if prev_close else 0.0

    return {
        "symbol": spec.symbol,
        "name_ja": spec.name_ja,
        "name_en": spec.name_en,
        "unit": spec.unit,
        "price": round(price, spec.decimals),
        "prev_close": round(prev_close, spec.decimals),
        "change": round(change, spec.decimals),
        "change_percent": round(change_percent, 2),
        "decimals": spec.decimals,
        "updated_at": time.time(),
    }


def list_quotes() -> list[dict]:
    return [get_quote(spec.symbol) for spec in INSTRUMENTS]


# range key -> (yfinance period, yfinance interval)
_RANGE_CONFIG = {
    "1D": ("5d", "15m"),
    "1W": ("1mo", "1h"),
    "1M": ("3mo", "1d"),
    "3M": ("6mo", "1d"),
    "1Y": ("2y", "1wk"),
}
# how many trailing points to keep for each range once fetched
_RANGE_POINT_LIMIT = {
    "1D": 48,
    "1W": 84,
    "1M": 30,
    "3M": 90,
    "1Y": 52,
}


def _fetch_raw_history(spec: InstrumentSpec, rng_key: str) -> list[dict]:
    period, interval = _RANGE_CONFIG[rng_key]
    last_error: Exception | None = None
    for ticker in spec.yahoo_tickers:
        try:
            df = yf.Ticker(ticker).history(period=period, interval=interval)
            if df.empty:
                raise MarketDataError(f"{ticker}: empty history")
            closes = df["Close"].dropna()
            limit = _RANGE_POINT_LIMIT[rng_key]
            closes = closes.tail(limit)
            return [
                {"t": ts.timestamp(), "v": round(float(v) / spec.scale_divisor, spec.decimals)}
                for ts, v in closes.items()
            ]
        except Exception as e:  # noqa: BLE001
            last_error = e
            continue
    raise MarketDataError(f"{spec.symbol}: all Yahoo tickers failed for history ({last_error})")


def history(symbol: str, rng_key: str) -> list[dict]:
    if symbol not in INSTRUMENTS_BY_SYMBOL:
        raise KeyError(symbol)
    if rng_key not in _RANGE_CONFIG:
        raise KeyError(rng_key)

    if symbol == "GOLDJPYG":
        gold_hist = {p["t"]: p["v"] for p in history("XAUUSD", rng_key)}
        usdjpy_hist = {p["t"]: p["v"] for p in history("USDJPY", rng_key)}
        common_ts = sorted(set(gold_hist) & set(usdjpy_hist))
        return [
            {
                "t": ts,
                "v": round(gold_hist[ts] * usdjpy_hist[ts] / _JPY_PER_TROY_OZ_TO_GRAM * _DOMESTIC_PREMIUM, 0),
            }
            for ts in common_ts
        ]

    spec = INSTRUMENTS_BY_SYMBOL[symbol]
    cache_key = (symbol, rng_key)
    now = time.time()
    cached = _history_cache.get(cache_key)
    if cached and now - cached[0] < HISTORY_TTL_SECONDS:
        return cached[1]

    try:
        points = _fetch_raw_history(spec, rng_key)
    except MarketDataError:
        if cached:
            return cached[1]
        raise

    if spec.stooq_symbol and points:
        # The chart is built from Yahoo futures data (good intraday
        # granularity); shift it by a constant offset so its last point
        # lines up with the real spot quote, keeping the live price and
        # the chart visually consistent.
        try:
            spot_price = get_quote(symbol)["price"]
            offset = spot_price - points[-1]["v"]
            points = [{"t": p["t"], "v": round(p["v"] + offset, spec.decimals)} for p in points]
        except Exception:  # noqa: BLE001 - rebasing is best-effort
            pass

    _history_cache[cache_key] = (now, points)
    return points
