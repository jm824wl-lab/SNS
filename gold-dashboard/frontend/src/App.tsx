import { useCallback, useEffect, useState } from "react";
import "./App.css";
import {
  fetchCalendar,
  fetchHistory,
  fetchNews,
  fetchPrices,
  type CalendarEvent,
  type HistoryPoint,
  type HistoryRange,
  type NewsItem,
  type Quote,
} from "./api";
import EconCalendar from "./components/EconCalendar";
import NewsFeed from "./components/NewsFeed";
import PriceLineChart from "./components/PriceLineChart";
import StatTile from "./components/StatTile";
import { formatClockTime } from "./format";

const PRICE_REFRESH_MS = 15_000;
const RANGES: HistoryRange[] = ["1D", "1W", "1M", "3M", "1Y"];
const MAIN_SYMBOL = "XAUUSD";

function App() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [news, setNews] = useState<NewsItem[]>([]);
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [range, setRange] = useState<HistoryRange>("1M");
  const [mainHistory, setMainHistory] = useState<HistoryPoint[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const loadPrices = useCallback(async () => {
    try {
      const data = await fetchPrices();
      setQuotes(data);
      setLastUpdated(Date.now() / 1000);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "価格の取得に失敗しました");
    }
  }, []);

  const loadSparklines = useCallback(async (symbols: string[]) => {
    const entries = await Promise.all(
      symbols.map(async (sym) => {
        try {
          const hist = await fetchHistory(sym, "1D");
          return [sym, hist.map((p) => p.v)] as const;
        } catch {
          return [sym, []] as const;
        }
      }),
    );
    setSparklines(Object.fromEntries(entries));
  }, []);

  const loadMainHistory = useCallback(async (r: HistoryRange) => {
    try {
      const hist = await fetchHistory(MAIN_SYMBOL, r);
      setMainHistory(hist);
    } catch (e) {
      setError(e instanceof Error ? e.message : "チャートの取得に失敗しました");
    }
  }, []);

  useEffect(() => {
    loadPrices();
    fetchNews()
      .then((data) => {
        setNews(data);
        setNewsError(null);
      })
      .catch((e) => setNewsError(e instanceof Error ? e.message : "ニュースの取得に失敗しました"));
    fetchCalendar()
      .then((data) => {
        setCalendar(data);
        setCalendarError(null);
      })
      .catch((e) => setCalendarError(e instanceof Error ? e.message : "経済指標カレンダーの取得に失敗しました"));
    const interval = setInterval(loadPrices, PRICE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadPrices]);

  useEffect(() => {
    if (quotes.length > 0) {
      loadSparklines(quotes.map((q) => q.symbol));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes.length]);

  useEffect(() => {
    loadMainHistory(range);
  }, [range, loadMainHistory]);

  const mainQuote = quotes.find((q) => q.symbol === MAIN_SYMBOL);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>ゴールド・トレーダー・ダッシュボード</h1>
          <p className="app-subtitle">日々のトレードに必要な金相場・関連市場データ・ニュースを一覧表示</p>
        </div>
        <div className="app-header-meta">
          {lastUpdated && <span className="updated-at">最終更新: {formatClockTime(lastUpdated)}</span>}
          <button type="button" className="refresh-button" onClick={loadPrices}>
            更新
          </button>
        </div>
      </header>

      {error && <div className="banner-error">{error}</div>}

      <section className="stat-grid" aria-label="主要マーケットデータ">
        {quotes.map((q) => (
          <StatTile
            key={q.symbol}
            quote={q}
            sparklineValues={sparklines[q.symbol] ?? []}
            emphasized={q.symbol === MAIN_SYMBOL}
          />
        ))}
      </section>

      <section className="panel chart-panel" aria-label="金価格チャート">
        <div className="range-selector" role="group" aria-label="表示期間">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className={`range-button${r === range ? " range-button-active" : ""}`}
              onClick={() => setRange(r)}
              aria-pressed={r === range}
            >
              {r}
            </button>
          ))}
        </div>
        <PriceLineChart
          data={mainHistory}
          range={range}
          decimals={mainQuote?.decimals ?? 2}
          unit={mainQuote?.unit ?? "USD/oz"}
        />
      </section>

      <div className="content-columns">
        <section className="panel" aria-label="マーケットニュース">
          <h2>マーケットニュース</h2>
          {newsError ? <div className="panel-error">{newsError}</div> : <NewsFeed items={news} />}
        </section>

        <section className="panel" aria-label="経済指標カレンダー">
          <h2>経済指標カレンダー</h2>
          {calendarError ? <div className="panel-error">{calendarError}</div> : <EconCalendar events={calendar} />}
        </section>
      </div>

      <footer className="app-footer">
        価格はYahoo Finance、ニュースはGoogle News、経済指標カレンダーはFRED(セントルイス連銀)から取得しています。
        いずれも非公式な取得方法または簡易的な分類を含むため、実際の取引判断は必ず一次情報でご確認ください。
      </footer>
    </div>
  );
}

export default App;
