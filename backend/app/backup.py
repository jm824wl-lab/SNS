"""コンテナ再起動時にSQLiteのローカルディスクが失われることがあるため、
gitで管理されるJSONファイルへ物件データをバックアップ/復元する仕組み。

日次のGmail同期の最後にexport_backup()を呼び、生成されたJSONファイルを
コミット・プッシュしておくことで、次回起動時にデータを復元できるように
運用する想定。
"""

import json
import os
from datetime import datetime

from sqlalchemy.orm import Session

from . import models

BACKUP_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "properties_backup.json"
)

_COLUMNS = [
    "title",
    "transaction_type",
    "property_type",
    "status",
    "price_label",
    "price_yen",
    "address",
    "access",
    "layout",
    "area_sqm",
    "built_year",
    "agent_name",
    "land_tsubo_label",
    "building_tsubo_label",
    "structure",
    "units",
    "yield_label",
    "source_type",
    "source_filename",
    "raw_text",
    "gmail_message_id",
    "gmail_thread_id",
    "received_at",
    "created_at",
]


def export_backup(db: Session) -> int:
    """全物件をJSONファイルへ書き出す。件数を返す。"""
    properties = db.query(models.Property).order_by(models.Property.id).all()

    records = []
    for prop in properties:
        record = {}
        for col in _COLUMNS:
            value = getattr(prop, col)
            if isinstance(value, datetime):
                value = value.isoformat()
            record[col] = value
        records.append(record)

    os.makedirs(os.path.dirname(BACKUP_PATH), exist_ok=True)
    with open(BACKUP_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    return len(records)


def restore_backup(db: Session) -> int:
    """バックアップJSONが存在する場合、その内容をDBへ復元する。復元件数を返す。

    gmail_message_idが既存であればスキップするため、複数回呼んでも安全。
    """
    if not os.path.exists(BACKUP_PATH):
        return 0

    with open(BACKUP_PATH, encoding="utf-8") as f:
        records = json.load(f)

    restored = 0
    for record in records:
        gmail_message_id = record.get("gmail_message_id")
        if gmail_message_id:
            exists = (
                db.query(models.Property)
                .filter(models.Property.gmail_message_id == gmail_message_id)
                .first()
            )
            if exists:
                continue

        kwargs = {col: record.get(col) for col in _COLUMNS}
        for date_col in ("received_at", "created_at"):
            if kwargs.get(date_col):
                kwargs[date_col] = datetime.fromisoformat(kwargs[date_col])

        db.add(models.Property(**kwargs))
        restored += 1

    db.commit()
    return restored
