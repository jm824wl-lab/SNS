from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import calendar_data, instruments, news_data, schemas

app = FastAPI(title="ゴールド・トレーダー・ダッシュボード")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

VALID_RANGES = ("1D", "1W", "1M", "3M", "1Y")


@app.get("/api/prices", response_model=list[schemas.Quote])
def get_prices():
    try:
        return instruments.list_quotes()
    except instruments.MarketDataError as e:
        raise HTTPException(status_code=503, detail=f"価格データの取得に失敗しました: {e}") from e


@app.get("/api/prices/{symbol}/history", response_model=list[schemas.HistoryPoint])
def get_price_history(symbol: str, range: str = "1M"):
    symbol = symbol.upper()
    range = range.upper()
    if symbol not in instruments.INSTRUMENTS_BY_SYMBOL:
        raise HTTPException(status_code=404, detail=f"不明な銘柄です: {symbol}")
    if range not in VALID_RANGES:
        raise HTTPException(
            status_code=400,
            detail=f"range は {', '.join(VALID_RANGES)} のいずれかを指定してください",
        )
    try:
        return instruments.history(symbol, range)
    except instruments.MarketDataError as e:
        raise HTTPException(status_code=503, detail=f"チャートデータの取得に失敗しました: {e}") from e


@app.get("/api/news", response_model=list[schemas.NewsItem])
def get_news():
    return news_data.list_news()


@app.get("/api/calendar", response_model=list[schemas.CalendarEvent])
def get_calendar():
    try:
        return calendar_data.list_calendar()
    except calendar_data.CalendarDataError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
