"""案件レジストリと投稿キューの永続化(JSONファイル)。

状態をリポジトリ内のJSONに置くことで、GitHub Actions の実行ごとに
コミットして履歴(何をいつ投稿したか)を追跡できるようにしている。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
PROGRAMS_PATH = ROOT / "programs.json"
STATE_DIR = ROOT / "state"
QUEUE_PATH = STATE_DIR / "queue.json"
RESEARCH_DIR = ROOT / "research"

# 提携条件は変わるため、確認日から一定期間を過ぎた案件は自動投稿を止める
VERIFICATION_MAX_AGE_DAYS = 90
PLACEHOLDER_MARKERS = ("example.com", "YOUR_", "要確認", "TODO")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


@dataclass
class Program:
    """提携済み(または提携予定)の1案件。記事の「確認項目」をそのままフィールド化。"""

    id: str
    name: str
    target_reader: str
    pain_points: list[str]
    official_url: str
    link_url: str
    pricing: str = "要確認"
    payout_trigger: str = "要確認"
    payout_type: str = "要確認"  # one-time / recurring
    approval_terms: str = "要確認"
    japan_eligible: bool = False
    x_promotion_allowed: bool = False
    personally_used: bool = False
    verified: bool = False
    verified_at: str = ""
    verified_facts: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    conversions: int = 0
    notes: str = ""

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Program":
        known = {k: v for k, v in d.items() if k in cls.__dataclass_fields__}
        return cls(**known)

    def autopost_blockers(self, today: date | None = None) -> list[str]:
        """自動投稿してはいけない理由の一覧(空なら投稿可)。"""
        today = today or date.today()
        reasons = []
        if not self.verified:
            reasons.append("verified=false(提携規約を本人が未確認)")
        if not self.japan_eligible:
            reasons.append("japan_eligible=false(日本在住での参加可否が未確認)")
        if not self.x_promotion_allowed:
            reasons.append("x_promotion_allowed=false(Xでの紹介可否が未確認)")
        if not self.link_url or any(m in self.link_url for m in PLACEHOLDER_MARKERS):
            reasons.append("link_url が未設定またはプレースホルダー")
        if not self.verified_facts:
            reasons.append("verified_facts が空(投稿の根拠となる確認済み事実がない)")
        if self.verified_at:
            try:
                age = (today - date.fromisoformat(self.verified_at[:10])).days
                if age > VERIFICATION_MAX_AGE_DAYS:
                    reasons.append(f"確認日から{age}日経過(規約を再確認してverified_atを更新)")
            except ValueError:
                reasons.append("verified_at の日付形式が不正(YYYY-MM-DD)")
        else:
            reasons.append("verified_at が未設定")
        return reasons


def load_programs() -> list[Program]:
    return [Program.from_dict(d) for d in load_json(PROGRAMS_PATH, [])]


def load_queue() -> list[dict[str, Any]]:
    return load_json(QUEUE_PATH, [])


def save_queue(queue: list[dict[str, Any]]) -> None:
    save_json(QUEUE_PATH, queue)
