const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export interface PropertyListItem {
  id: number;
  title: string;
  transaction_type: string | null;
  property_type: string | null;
  status: string;
  price_label: string | null;
  price_yen: number | null;
  address: string | null;
  access: string | null;
  layout: string | null;
  area_sqm: number | null;
  built_year: string | null;
  agent_name: string | null;
  land_tsubo_label: string | null;
  building_tsubo_label: string | null;
  structure: string | null;
  units: string | null;
  yield_label: string | null;
  source_type: string;
  source_filename: string | null;
  received_at: string;
}

export interface PropertyDetail extends PropertyListItem {
  raw_text: string;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
}

export interface PropertyListResponse {
  total: number;
  items: PropertyListItem[];
}

export interface PropertySearchParams {
  q?: string;
  transaction_type?: string;
  property_type?: string;
  layout?: string;
  min_price?: number;
  max_price?: number;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `リクエストに失敗しました (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function fetchProperties(params: PropertySearchParams): Promise<PropertyListResponse> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  return fetch(`${API_BASE}/api/properties?${search.toString()}`).then((res) =>
    handle<PropertyListResponse>(res),
  );
}

export function fetchProperty(id: number): Promise<PropertyDetail> {
  return fetch(`${API_BASE}/api/properties/${id}`).then((res) => handle<PropertyDetail>(res));
}

export function ingestEmail(rawText: string, filename?: string): Promise<PropertyDetail> {
  return fetch(`${API_BASE}/api/ingest/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_text: rawText, filename }),
  }).then((res) => handle<PropertyDetail>(res));
}

export function ingestPdf(file: File): Promise<PropertyDetail> {
  const formData = new FormData();
  formData.append("file", file);
  return fetch(`${API_BASE}/api/ingest/pdf`, { method: "POST", body: formData }).then((res) =>
    handle<PropertyDetail>(res),
  );
}

// ---- 会社クライテリア / マッチング ----

export interface BuyerCriteria {
  categories: string[];
  areas: string[];
  excluded_areas: string[];
  min_price_man: number | null;
  max_price_man: number | null;
  min_yield_pct: number | null;
  max_age_years: number | null;
  structures: string[];
  min_land_tsubo: number | null;
  max_land_tsubo: number | null;
  max_walk_minutes: number | null;
  ng_keywords: string[];
}

export interface BuyerInput {
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  active: boolean;
  criteria: BuyerCriteria;
}

export interface Buyer extends BuyerInput {
  id: string;
  updated_at: string | null;
}

export type CheckStatus = "ok" | "ng" | "unknown";
export type Verdict = "match" | "possible" | "near" | "unmatched";

export interface MatchCheck {
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface BuyerMatch {
  buyer_id: string;
  buyer_name: string;
  contact_name: string | null;
  contact_email: string | null;
  verdict: Verdict;
  score: number;
  ok_count: number;
  ng_count: number;
  unknown_count: number;
  checks: MatchCheck[];
}

export interface NormalizedProperty {
  category: string | null;
  price_yen: number | null;
  yield_pct: number | null;
  age_years: number | null;
  land_tsubo: number | null;
  structure: string | null;
  walk_minutes: number | null;
  address: string;
  transaction_type: string | null;
}

export interface PropertyMatchResponse {
  normalized: NormalizedProperty;
  results: BuyerMatch[];
}

export interface TextMatchResponse extends PropertyMatchResponse {
  extracted: Record<string, string | number | null>;
}

export interface BuyerPropertyMatch {
  property: PropertyListItem;
  match: BuyerMatch;
}

export interface CriteriaOptions {
  categories: string[];
  structures: string[];
  area_presets: Record<string, string[]>;
}

const jsonHeaders = { "Content-Type": "application/json" };

export function fetchCriteriaOptions(): Promise<CriteriaOptions> {
  return fetch(`${API_BASE}/api/criteria/options`).then((res) => handle<CriteriaOptions>(res));
}

export function fetchBuyers(): Promise<Buyer[]> {
  return fetch(`${API_BASE}/api/buyers`).then((res) => handle<Buyer[]>(res));
}

export function fetchBuyer(id: string): Promise<Buyer> {
  return fetch(`${API_BASE}/api/buyers/${id}`).then((res) => handle<Buyer>(res));
}

export function saveBuyer(input: BuyerInput, id?: string): Promise<Buyer> {
  return fetch(`${API_BASE}/api/buyers${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input),
  }).then((res) => handle<Buyer>(res));
}

export async function deleteBuyer(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/buyers/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`削除に失敗しました (${res.status})`);
}

export function fetchPropertyMatches(id: number): Promise<PropertyMatchResponse> {
  return fetch(`${API_BASE}/api/properties/${id}/matches`).then((res) =>
    handle<PropertyMatchResponse>(res),
  );
}

export function matchText(rawText: string): Promise<TextMatchResponse> {
  return fetch(`${API_BASE}/api/match/text`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ raw_text: rawText }),
  }).then((res) => handle<TextMatchResponse>(res));
}

export function fetchBuyerMatches(id: string, includePossible = true): Promise<BuyerPropertyMatch[]> {
  return fetch(`${API_BASE}/api/buyers/${id}/matches?include_possible=${includePossible}`).then((res) =>
    handle<BuyerPropertyMatch[]>(res),
  );
}
