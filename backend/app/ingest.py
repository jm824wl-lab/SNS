from datetime import datetime

from sqlalchemy.orm import Session

from . import models
from .parser import extract_property


def ingest_raw_text(db: Session, raw_text: str, source_type: str, filename: str | None = None) -> models.Property:
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
        source_type=source_type,
        source_filename=filename,
        raw_text=raw_text,
        received_at=datetime.utcnow(),
        created_at=datetime.utcnow(),
    )
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return prop
