from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PropertyBase(BaseModel):
    title: str
    transaction_type: Optional[str] = None
    property_type: Optional[str] = None
    status: str
    price_label: Optional[str] = None
    price_yen: Optional[int] = None
    address: Optional[str] = None
    access: Optional[str] = None
    layout: Optional[str] = None
    area_sqm: Optional[float] = None
    built_year: Optional[str] = None
    agent_name: Optional[str] = None
    land_tsubo_label: Optional[str] = None
    building_tsubo_label: Optional[str] = None
    structure: Optional[str] = None
    units: Optional[str] = None
    yield_label: Optional[str] = None
    source_type: str
    source_filename: Optional[str] = None
    received_at: datetime


class PropertyListItem(PropertyBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class PropertyDetail(PropertyListItem):
    raw_text: str
    gmail_message_id: Optional[str] = None
    gmail_thread_id: Optional[str] = None


class PropertyListResponse(BaseModel):
    total: int
    items: list[PropertyListItem]


class IngestEmailRequest(BaseModel):
    raw_text: str
    filename: Optional[str] = None


class GmailIngestRequest(BaseModel):
    message_id: str
    thread_id: Optional[str] = None
    subject: Optional[str] = None
    sender: Optional[str] = None
    raw_text: str
    received_at: Optional[datetime] = None
    force: bool = False


# ---- 会社クライテリア / マッチング ----


class BuyerCriteria(BaseModel):
    categories: list[str] = []  # 物件種別カテゴリ(normalize.PROPERTY_CATEGORIES)
    areas: list[str] = []  # 対象エリア(「港区」「横浜市」「東京23区」等。所在地に含まれれば適合)
    excluded_areas: list[str] = []
    min_price_man: Optional[float] = None  # 価格下限(万円)
    max_price_man: Optional[float] = None  # 価格上限(万円)
    min_yield_pct: Optional[float] = None  # 表面利回り下限(%)
    max_age_years: Optional[int] = None  # 築年数上限
    structures: list[str] = []  # 構造(normalize.STRUCTURE_CATEGORIES)
    min_land_tsubo: Optional[float] = None
    max_land_tsubo: Optional[float] = None
    max_walk_minutes: Optional[int] = None
    ng_keywords: list[str] = []  # 本文に含まれていたら対象外(「借地」「再建築不可」等)


class BuyerInput(BaseModel):
    name: str
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True
    criteria: BuyerCriteria = BuyerCriteria()


class Buyer(BuyerInput):
    id: str
    updated_at: Optional[str] = None


class MatchCheck(BaseModel):
    label: str
    status: str  # ok / ng / unknown
    detail: str


class BuyerMatch(BaseModel):
    buyer_id: str
    buyer_name: str
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    verdict: str  # match / possible / near / unmatched
    score: int
    ok_count: int
    ng_count: int
    unknown_count: int
    checks: list[MatchCheck]


class NormalizedProperty(BaseModel):
    category: Optional[str] = None
    price_yen: Optional[int] = None
    yield_pct: Optional[float] = None
    age_years: Optional[int] = None
    land_tsubo: Optional[float] = None
    structure: Optional[str] = None
    walk_minutes: Optional[int] = None
    address: str = ""
    transaction_type: Optional[str] = None


class PropertyMatchResponse(BaseModel):
    normalized: NormalizedProperty
    results: list[BuyerMatch]


class TextMatchRequest(BaseModel):
    raw_text: str


class TextMatchResponse(PropertyMatchResponse):
    extracted: dict


class BuyerPropertyMatch(BaseModel):
    property: PropertyListItem
    match: BuyerMatch


class CriteriaOptions(BaseModel):
    categories: list[str]
    structures: list[str]
    area_presets: dict[str, list[str]]
