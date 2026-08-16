"""Instrument definitions and mock live-price simulation.

No real market data provider is wired up here (see README for the intended
production integration point). Prices are simulated with a bounded random
walk around realistic reference levels so the dashboard has believable,
moving data to render.
"""
from __future__ import annotations

import random
import time
from dataclasses import dataclass, field


@dataclass
class InstrumentSpec:
    symbol: str
    name_ja: str
    name_en: str
    unit: str
    base_price: float
    # Annualized volatility (stdev of yearly log-return) driving the random walk.
    volatility: float
    decimals: int = 2


INSTRUMENTS: list[InstrumentSpec] = [
    InstrumentSpec("XAUUSD", "金 (スポット)", "Gold Spot", "USD/oz", 3380.0, 0.14, 2),
    InstrumentSpec("XAGUSD", "銀 (スポット)", "Silver Spot", "USD/oz", 38.50, 0.28, 3),
    InstrumentSpec("GOLDJPYG", "国内金価格", "Domestic Gold (JPY/g)", "円/g", 0.0, 0.14, 0),
    InstrumentSpec("USDJPY", "ドル円", "USD/JPY", "円", 152.30, 0.08, 2),
    InstrumentSpec("DXY", "ドルインデックス", "US Dollar Index", "pt", 101.20, 0.06, 2),
    InstrumentSpec("US10Y", "米10年国債利回り", "US 10Y Treasury Yield", "%", 4.15, 0.10, 3),
    InstrumentSpec("WTI", "WTI原油", "WTI Crude Oil", "USD/bbl", 71.40, 0.32, 2),
    InstrumentSpec("SPX", "S&P500", "S&P 500", "pt", 6250.0, 0.15, 1),
]

_SECONDS_PER_YEAR = 365 * 86400

INSTRUMENTS_BY_SYMBOL = {spec.symbol: spec for spec in INSTRUMENTS}

_JPY_PER_TROY_OZ_TO_GRAM = 31.1035
_DOMESTIC_PREMIUM = 1.015  # rough spread of domestic bar/coin price over spot-derived value

_PROCESS_START = time.time()


@dataclass
class _LiveState:
    prev_close: float
    price: float
    last_update: float = field(default_factory=time.time)


def _seeded_open(spec: InstrumentSpec, seed_key: str) -> float:
    rng = random.Random(f"open::{seed_key}")
    drift = rng.uniform(-0.006, 0.006)
    return round(spec.base_price * (1 + drift), 6)


_LIVE: dict[str, _LiveState] = {}
for _spec in INSTRUMENTS:
    if _spec.symbol == "GOLDJPYG":
        continue
    _open = _seeded_open(_spec, _spec.symbol)
    _LIVE[_spec.symbol] = _LiveState(prev_close=_open, price=_open)


def _advance(symbol: str) -> _LiveState:
    spec = INSTRUMENTS_BY_SYMBOL[symbol]
    state = _LIVE[symbol]
    now = time.time()
    elapsed = min(now - state.last_update, 120.0)
    if elapsed <= 0:
        return state
    rng = random.Random()
    # Mean-reverting random walk in log-return terms, properly time-scaled
    # (stdev of a Brownian increment grows with sqrt(elapsed time)).
    step_scale = spec.volatility * (elapsed / _SECONDS_PER_YEAR) ** 0.5
    pct_step = max(min(rng.gauss(0, max(step_scale, 1e-9)), 0.2), -0.2)
    reversion = (state.prev_close - state.price) / state.prev_close * 0.02
    new_price = state.price * (1 + pct_step + reversion)
    state.price = max(new_price, spec.base_price * 0.5)
    state.last_update = now
    return state


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
        state = _advance(symbol)
        price = state.price
        prev_close = state.prev_close

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


_RANGE_CONFIG = {
    "1D": {"points": 48, "step_minutes": 30},
    "1W": {"points": 84, "step_minutes": 120},
    "1M": {"points": 30, "step_minutes": 1440},
    "3M": {"points": 90, "step_minutes": 1440},
    "1Y": {"points": 52, "step_minutes": 10080},
}


def history(symbol: str, rng_key: str) -> list[dict]:
    if symbol not in INSTRUMENTS_BY_SYMBOL:
        raise KeyError(symbol)
    if rng_key not in _RANGE_CONFIG:
        raise KeyError(rng_key)

    cfg = _RANGE_CONFIG[rng_key]
    points = cfg["points"]
    step_seconds = cfg["step_minutes"] * 60

    current = get_quote(symbol)
    seed = random.Random(f"hist::{symbol}::{rng_key}::{int(_PROCESS_START // 3600)}")
    spec = INSTRUMENTS_BY_SYMBOL[symbol]

    # Walk backwards from the live price so the series always ends at "now".
    values = [current["price"]]
    step_vol = spec.volatility * (step_seconds / _SECONDS_PER_YEAR) ** 0.5
    for _ in range(points - 1):
        pct = max(min(seed.gauss(0, max(step_vol, 1e-9)), 0.3), -0.3)
        prev_value = values[-1] / (1 + pct)
        values.append(max(prev_value, spec.base_price * 0.3))
    values.reverse()

    now = current["updated_at"]
    series = []
    for i, value in enumerate(values):
        ts = now - (points - 1 - i) * step_seconds
        series.append({"t": ts, "v": round(value, spec.decimals)})
    return series
