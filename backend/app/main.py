import os

import pdfplumber
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_
from sqlalchemy.orm import Session

from . import models, schemas
from .backup import export_backup, restore_backup
from .database import Base, SessionLocal, engine, get_db
from .ingest import ingest_raw_text
from .parser import is_property_listing, split_listings
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

        # コンテナ再起動でSQLiteファイルが失われた場合、gitで管理された
        # バックアップJSONから実データを復元する。バックアップが存在すれば
        # モックのサンプルデータでの初期化は行わない。
        if restore_backup(db):
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


@app.post("/api/ingest/gmail", response_model=schemas.PropertyDetail)
def ingest_gmail(payload: schemas.GmailIngestRequest, db: Session = Depends(get_db)):
    existing = (
        db.query(models.Property)
        .filter(models.Property.gmail_message_id == payload.message_id)
        .first()
    )
    if existing:
        return existing

    header_lines = []
    if payload.subject:
        header_lines.append(f"件名: {payload.subject}")
    if payload.sender:
        header_lines.append(f"差出人: {payload.sender}")
    combined_text = "\n".join(header_lines) + ("\n\n" if header_lines else "") + payload.raw_text

    if not payload.force and not is_property_listing(combined_text):
        raise HTTPException(
            status_code=422,
            detail="物件情報として認識できませんでした(ノイズメールの可能性があります)。force=trueで強制取込できます。",
        )

    return ingest_raw_text(
        db,
        combined_text,
        source_type="gmail",
        gmail_message_id=payload.message_id,
        gmail_thread_id=payload.thread_id,
        received_at=payload.received_at,
    )


@app.post("/api/ingest/gmail/batch", response_model=list[schemas.PropertyDetail])
def ingest_gmail_batch(payload: schemas.GmailIngestRequest, db: Session = Depends(get_db)):
    """1通のメールに複数物件が併記されているケースに対応する取込エンドポイント。

    本文を物件ごとに分割し、それぞれについて物件情報らしいと判定できたものだけを
    (Gmailメッセージ内の連番付きIDで重複排除しつつ)登録する。
    """
    # 件名は複数物件に共通のヘッダーとしてチャンク先頭に付与すると、件名に含まれる
    # 数値(価格・利回り等)が他の物件のものとして誤抽出されることがあるため、
    # バッチ取込では差出人のみをヘッダーに含める(件名はチャンク単位ではなく
    # メール全体の内容のため、個々の物件のフィールド抽出に混ざるべきではない)。
    header_lines = []
    if payload.sender:
        header_lines.append(f"差出人: {payload.sender}")
    header = "\n".join(header_lines) + ("\n\n" if header_lines else "")

    chunks = split_listings(payload.raw_text)
    results: list[models.Property] = []

    for idx, chunk_text in enumerate(chunks):
        msg_id = payload.message_id if len(chunks) == 1 else f"{payload.message_id}::{idx}"

        existing = (
            db.query(models.Property).filter(models.Property.gmail_message_id == msg_id).first()
        )
        if existing:
            results.append(existing)
            continue

        combined_text = header + chunk_text
        if not payload.force and not is_property_listing(combined_text):
            continue

        results.append(
            ingest_raw_text(
                db,
                combined_text,
                source_type="gmail",
                gmail_message_id=msg_id,
                gmail_thread_id=payload.thread_id,
                received_at=payload.received_at,
            )
        )

    if not results:
        raise HTTPException(
            status_code=422,
            detail="物件情報として認識できませんでした(ノイズメールの可能性があります)。force=trueで強制取込できます。",
        )
    return results


@app.post("/api/backup/export")
def backup_export(db: Session = Depends(get_db)):
    """全物件データをgit管理下のJSONファイルへ書き出す。

    コンテナ再起動でSQLiteのローカルディスクが失われることがあるため、
    日次同期の最後にこれを呼び、生成されたファイルをコミット・プッシュ
    しておくことで次回起動時に復元できるようにする。
    """
    count = export_backup(db)
    return {"exported": count}
