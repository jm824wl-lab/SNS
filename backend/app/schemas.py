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
    source_type: str
    source_filename: Optional[str] = None
    received_at: datetime


class PropertyListItem(PropertyBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class PropertyDetail(PropertyListItem):
    raw_text: str


class PropertyListResponse(BaseModel):
    total: int
    items: list[PropertyListItem]


class IngestEmailRequest(BaseModel):
    raw_text: str
    filename: Optional[str] = None
