from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from . import models
from .parser import extract_property


def ingest_raw_text(
    db: Session,
    raw_text: str,
    source_type: str,
    filename: Optional[str] = None,
    gmail_message_id: Optional[str] = None,
    gmail_thread_id: Optional[str] = None,
    received_at: Optional[datetime] = None,
) -> models.Property:
    fields = extract_property(raw_text)
    prop = models.Property(
        title=fields["title"],
        transaction_type=fields["transaction_type"],
        property_type=fields["property_type"],
        status="募集中",
        price_label=fields["price_label"],
        price_yen=fields["price_yen"],
        address=fields["address"],
        access=fields["access"],
        layout=fields["layout"],
        area_sqm=fields["area_sqm"],
        built_year=fields["built_year"],
        agent_name=fields["agent_name"],
        land_tsubo_label=fields["land_tsubo_label"],
        building_tsubo_label=fields["building_tsubo_label"],
        structure=fields["structure"],
        units=fields["units"],
        yield_label=fields["yield_label"],
        source_type=source_type,
        source_filename=filename,
        raw_text=raw_text,
        gmail_message_id=gmail_message_id,
        gmail_thread_id=gmail_thread_id,
        received_at=received_at or datetime.utcnow(),
        created_at=datetime.utcnow(),
    )
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return prop
