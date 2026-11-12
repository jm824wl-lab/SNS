"""会社(買主・買取業者)ごとの購入クライテリアの保存先。

会社数は物件数に比べて少なく、手作業での確認・一括編集もしやすいよう、
SQLiteではなくgit管理下のJSONファイル(data/buyers.json)を正として保存する。
コンテナ再起動でローカルDBが失われても、コミット済みであれば内容は残る。
"""

import json
import os
import threading
import uuid
from datetime import datetime
from typing import Optional

BUYERS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "buyers.json"
)

_lock = threading.Lock()


def _load() -> list[dict]:
    if not os.path.exists(BUYERS_PATH):
        return []
    with open(BUYERS_PATH, encoding="utf-8") as f:
        return json.load(f)


def _save(buyers: list[dict]) -> None:
    os.makedirs(os.path.dirname(BUYERS_PATH), exist_ok=True)
    tmp = BUYERS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(buyers, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, BUYERS_PATH)


def list_buyers() -> list[dict]:
    with _lock:
        return sorted(_load(), key=lambda b: b["name"])


def get_buyer(buyer_id: str) -> Optional[dict]:
    with _lock:
        return next((b for b in _load() if b["id"] == buyer_id), None)


def create_buyer(data: dict) -> dict:
    with _lock:
        buyers = _load()
        buyer = {"id": uuid.uuid4().hex[:12], **data, "updated_at": datetime.now().isoformat(timespec="seconds")}
        buyers.append(buyer)
        _save(buyers)
        return buyer


def update_buyer(buyer_id: str, data: dict) -> Optional[dict]:
    with _lock:
        buyers = _load()
        for i, b in enumerate(buyers):
            if b["id"] == buyer_id:
                buyers[i] = {"id": buyer_id, **data, "updated_at": datetime.now().isoformat(timespec="seconds")}
                _save(buyers)
                return buyers[i]
        return None


def delete_buyer(buyer_id: str) -> bool:
    with _lock:
        buyers = _load()
        remaining = [b for b in buyers if b["id"] != buyer_id]
        if len(remaining) == len(buyers):
            return False
        _save(remaining)
        return True
