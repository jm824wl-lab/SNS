from pydantic import BaseModel


class Quote(BaseModel):
    symbol: str
    name_ja: str
    name_en: str
    unit: str
    price: float
    prev_close: float
    change: float
    change_percent: float
    decimals: int
    updated_at: float


class HistoryPoint(BaseModel):
    t: float
    v: float


class NewsItem(BaseModel):
    id: int
    title: str
    summary: str
    source: str
    impact: str
    related_symbols: list[str]
    published_at: float


class CalendarEvent(BaseModel):
    id: int
    datetime: str
    country: str
    name: str
    importance: str
    previous: str
    forecast: str
    note: str
