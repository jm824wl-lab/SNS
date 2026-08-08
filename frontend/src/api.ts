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
  source_type: string;
  source_filename: string | null;
  received_at: string;
}

export interface PropertyDetail extends PropertyListItem {
  raw_text: string;
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
