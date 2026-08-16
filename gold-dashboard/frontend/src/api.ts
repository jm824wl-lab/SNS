const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export interface Quote {
  symbol: string;
  name_ja: string;
  name_en: string;
  unit: string;
  price: number;
  prev_close: number;
  change: number;
  change_percent: number;
  decimals: number;
  updated_at: number;
}

export interface HistoryPoint {
  t: number;
  v: number;
}

export interface NewsItem {
  id: number;
  title: string;
  summary: string;
  source: string;
  impact: "high" | "medium" | "low";
  related_symbols: string[];
  published_at: number;
}

export interface CalendarEvent {
  id: number;
  datetime: string;
  country: string;
  name: string;
  importance: "high" | "medium" | "low";
  previous: string;
  forecast: string;
  note: string;
}

export type HistoryRange = "1D" | "1W" | "1M" | "3M" | "1Y";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `リクエストに失敗しました (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function fetchPrices(): Promise<Quote[]> {
  return fetch(`${API_BASE}/api/prices`).then((res) => handle<Quote[]>(res));
}

export function fetchHistory(symbol: string, range: HistoryRange): Promise<HistoryPoint[]> {
  return fetch(`${API_BASE}/api/prices/${symbol}/history?range=${range}`).then((res) =>
    handle<HistoryPoint[]>(res),
  );
}

export function fetchNews(): Promise<NewsItem[]> {
  return fetch(`${API_BASE}/api/news`).then((res) => handle<NewsItem[]>(res));
}

export function fetchCalendar(): Promise<CalendarEvent[]> {
  return fetch(`${API_BASE}/api/calendar`).then((res) => handle<CalendarEvent[]>(res));
}
