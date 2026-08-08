import os

import pdfplumber
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_
from sqlalchemy.orm import Session

from . import models, schemas
from .database import Base, SessionLocal, engine, get_db
from .ingest import ingest_raw_text
from .pdf_seed import generate_seed_pdf

Base.metadata.create_all(bind=engine)

app = FastAPI(title="不動産物件リスト化ツール")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SEED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_data")


def seed_if_empty() -> None:
    db = SessionLocal()
    try:
        if db.query(models.Property).count() > 0:
            return

        for filename in sorted(os.listdir(SEED_DIR)):
            if not filename.endswith(".txt"):
                continue
            path = os.path.join(SEED_DIR, filename)
            with open(path, encoding="utf-8") as f:
                raw_text = f.read()
            ingest_raw_text(db, raw_text, source_type="email", filename=filename)

        pdf_path = generate_seed_pdf()
        with pdfplumber.open(pdf_path) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        ingest_raw_text(db, text, source_type="pdf", filename=os.path.basename(pdf_path))
    finally:
        db.close()


@app.on_event("startup")
def on_startup() -> None:
    seed_if_empty()


@app.get("/api/properties", response_model=schemas.PropertyListResponse)
def list_properties(
    q: str | None = None,
    transaction_type: str | None = None,
    property_type: str | None = None,
    layout: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Property)

    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                models.Property.title.ilike(like),
                models.Property.address.ilike(like),
                models.Property.access.ilike(like),
            )
        )
    if transaction_type:
        query = query.filter(models.Property.transaction_type == transaction_type)
    if property_type:
        query = query.filter(models.Property.property_type.ilike(f"%{property_type}%"))
    if layout:
        query = query.filter(models.Property.layout == layout)
    if min_price is not None:
        query = query.filter(models.Property.price_yen >= min_price)
    if max_price is not None:
        query = query.filter(models.Property.price_yen <= max_price)

    query = query.order_by(models.Property.received_at.desc())
    items = query.all()
    return {"total": len(items), "items": items}


@app.get("/api/properties/{property_id}", response_model=schemas.PropertyDetail)
def get_property(property_id: int, db: Session = Depends(get_db)):
    prop = db.query(models.Property).filter(models.Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="物件が見つかりません")
    return prop


@app.post("/api/ingest/email", response_model=schemas.PropertyDetail)
def ingest_email(payload: schemas.IngestEmailRequest, db: Session = Depends(get_db)):
    if not payload.raw_text.strip():
        raise HTTPException(status_code=400, detail="メール本文が空です")
    return ingest_raw_text(db, payload.raw_text, source_type="email", filename=payload.filename)


@app.post("/api/ingest/pdf", response_model=schemas.PropertyDetail)
async def ingest_pdf(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDFファイルを指定してください")

    contents = await file.read()
    tmp_path = f"/tmp/{file.filename}"
    with open(tmp_path, "wb") as f:
        f.write(contents)

    try:
        with pdfplumber.open(tmp_path) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    finally:
        os.remove(tmp_path)

    if not text.strip():
        raise HTTPException(status_code=422, detail="PDFからテキストを抽出できませんでした")

    return ingest_raw_text(db, text, source_type="pdf", filename=file.filename)
