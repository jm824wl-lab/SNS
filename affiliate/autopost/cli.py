"""コマンドライン: research / generate / post / metrics / run / status

  python -m autopost research --niche "CRM for small businesses"
  python -m autopost generate
  python -m autopost post            # 既定はドライラン(送信しない)
  python -m autopost post --live     # 実際に X へ投稿
  python -m autopost run --live      # generate → post → metrics を一括(定期実行用)
"""

from __future__ import annotations

import argparse
import re
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

from . import guard
from .store import (
    RESEARCH_DIR,
    Program,
    load_programs,
    load_queue,
    now_iso,
    save_json,
    save_queue,
)
from .x_client import XApiError, XClient

MIN_GAP_HOURS = 20  # 同一案件の役割1→2→3の間隔。連投に見せず、読者が順に読める間隔を空ける
MAX_POSTS_PER_RUN = 1
MAX_GENERATE_ATTEMPTS = 3
# 記事「数字を見て止まっている場所を確認する」の判定しきい値
LOW_IMPRESSIONS = 200
LOW_LINK_CTR = 0.005


def _eligible(programs: list[Program]) -> list[Program]:
    ok = []
    for p in programs:
        blockers = p.autopost_blockers()
        if blockers:
            print(f"[skip] {p.id}: " + " / ".join(blockers))
        else:
            ok.append(p)
    return ok


def _posted_texts(queue: list[dict]) -> list[str]:
    return [q["final_text"] for q in queue if q["status"] == "posted"]


def cmd_research(args: argparse.Namespace) -> int:
    from . import llm

    result = llm.research(args.niche, args.count)
    slug = re.sub(r"[^a-z0-9]+", "-", args.niche.lower()).strip("-")[:40]
    path = RESEARCH_DIR / f"{date.today().isoformat()}-{slug}.json"
    save_json(path, result)
    for c in result["candidates"]:
        print(f"- {c['name']}: 日本在住={c['japan_eligible']} / X紹介={c['x_promotion_rules']}")
    print(f"\n保存: {path}")
    print("※ 公式の提携規約を自分で確認し、ASPで提携したうえで programs.json に追加してください。")
    return 0


def cmd_generate(args: argparse.Namespace) -> int:
    from . import llm

    queue = load_queue()
    programs = _eligible(load_programs())
    if args.program:
        programs = [p for p in programs if p.id == args.program]
    pending = {q["program_id"] for q in queue if q["status"] == "ready"}
    history = guard.history_set(_posted_texts(queue))
    made = 0
    for p in programs:
        if p.id in pending and not args.force:
            print(f"[keep] {p.id}: 未投稿のセットが残っているため生成しない")
            continue
        batch = uuid.uuid4().hex[:8]
        for attempt in range(1, MAX_GENERATE_ATTEMPTS + 1):
            posts = llm.generate_posts(p)
            checked = [(post, guard.check_post(post["text_en"], post["role"], p, history)) for post in posts]
            if all(not probs for _, probs in checked):
                break
            for post, probs in checked:
                if probs:
                    print(f"[retry {attempt}] {p.id} role{post['role']}: {probs}")
        for post, probs in checked:
            queue.append({
                "id": f"{batch}-{post['role']}",
                "program_id": p.id,
                "batch": batch,
                "role": post["role"],
                "text_en": post["text_en"],
                "text_ja": post["text_ja"],
                "facts_to_verify": post["facts_to_verify"],
                "final_text": guard.compose_final_text(post["text_en"], post["role"], p),
                # 1本でも不合格なら3本セットごと保留(役割の流れが崩れるため)
                "status": "ready" if all(not pr for _, pr in checked) else "rejected",
                "problems": probs,
                "created_at": now_iso(),
            })
        made += 1
        print(f"[generated] {p.id} batch={batch}")
    save_queue(queue)
    print(f"生成セット数: {made}")
    return 0


def _next_due(queue: list[dict], now: datetime) -> dict | None:
    """各バッチで次に投稿すべき役割を探す。前の役割の投稿から MIN_GAP_HOURS 経過が条件。"""
    batches: dict[str, list[dict]] = {}
    for q in queue:
        batches.setdefault(q["batch"], []).append(q)
    candidates = []
    for items in batches.values():
        items.sort(key=lambda q: q["role"])
        if any(q["status"] in ("rejected", "failed") for q in items):
            continue
        posted = [q for q in items if q["status"] == "posted"]
        nxt = next((q for q in items if q["status"] == "ready"), None)
        if not nxt:
            continue
        if posted:
            last = datetime.fromisoformat(posted[-1]["posted_at"])
            if now - last < timedelta(hours=MIN_GAP_HOURS):
                continue
        candidates.append(nxt)
    candidates.sort(key=lambda q: (q["created_at"], q["role"]))
    return candidates[0] if candidates else None


def cmd_post(args: argparse.Namespace) -> int:
    queue = load_queue()
    programs = {p.id: p for p in load_programs()}
    client = XClient.from_env() if args.live else None
    if args.live and client is None:
        print("X の認証情報(X_API_KEY 等)が未設定のため投稿できません。", file=sys.stderr)
        return 2
    now = datetime.now(timezone.utc)
    sent = 0
    while sent < MAX_POSTS_PER_RUN:
        item = _next_due(queue, now)
        if not item:
            print("投稿予定のものはありません。")
            break
        prog = programs.get(item["program_id"])
        blockers = prog.autopost_blockers() if prog else ["programs.json に案件がない"]
        # 投稿直前にも再チェック(生成後に規約確認日が切れた・リンクが変わった等に備える)
        history = guard.history_set(_posted_texts(queue))
        problems = blockers or guard.check_post(item["text_en"], item["role"], prog, history)
        if problems:
            item["status"], item["problems"] = "rejected", problems
            print(f"[reject] {item['id']}: {problems}")
            continue
        final = guard.compose_final_text(item["text_en"], item["role"], prog)
        if not args.live:
            print(f"[dry-run] {item['id']} role{item['role']}\n---\n{final}\n---")
            break
        try:
            item["tweet_id"] = client.create_post(final)
        except XApiError as e:
            item["status"], item["problems"] = "failed", [str(e)]
            print(f"[failed] {item['id']}: {e}", file=sys.stderr)
            save_queue(queue)
            return 1
        item.update(status="posted", posted_at=now_iso(), final_text=final)
        sent += 1
        print(f"[posted] {item['id']} → https://x.com/i/web/status/{item['tweet_id']}")
    save_queue(queue)
    return 0


def diagnose(role: int, m: dict, conversions: int) -> str:
    imp = m.get("impression_count", 0)
    clicks = m.get("url_link_clicks")
    if imp < LOW_IMPRESSIONS:
        return "表示が少ない → テーマ・届け方(投稿時間、冒頭の問い)を見直す"
    if role == 3 and clicks is not None:
        if imp and clicks / imp < LOW_LINK_CTR:
            return "読まれているがリンクが押されない → 紹介理由・リンク先で分かることを見直す"
        if clicks and conversions == 0:
            return "クリックはあるが成約なし → 読者と商品の相性、案内内容とリンク先のずれを確認"
    return "目立った詰まりなし"


def cmd_metrics(args: argparse.Namespace) -> int:
    queue = load_queue()
    programs = {p.id: p for p in load_programs()}
    posted = [q for q in queue if q["status"] == "posted" and q.get("tweet_id")]
    if not posted:
        print("投稿済みのものはありません。")
        return 0
    client = XClient.from_env()
    if client is None:
        print("X の認証情報が未設定のため指標を取得できません。", file=sys.stderr)
        return 2
    try:
        metrics = client.get_metrics([q["tweet_id"] for q in posted])
    except XApiError as e:
        print(f"指標取得に失敗: {e}", file=sys.stderr)
        return 1
    for q in posted:
        m = metrics.get(q["tweet_id"])
        if not m:
            continue
        q["metrics"], q["metrics_at"] = m, now_iso()
        conv = programs[q["program_id"]].conversions if q["program_id"] in programs else 0
        q["diagnosis"] = diagnose(q["role"], m, conv)
        print(f"{q['id']} role{q['role']} imp={m.get('impression_count')} "
              f"clicks={m.get('url_link_clicks', '-')} → {q['diagnosis']}")
    save_queue(queue)
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    for p in load_programs():
        b = p.autopost_blockers()
        print(f"{p.id}: {'自動投稿可' if not b else '停止中 — ' + ' / '.join(b)}")
    counts: dict[str, int] = {}
    for q in load_queue():
        counts[q["status"]] = counts.get(q["status"], 0) + 1
    print("キュー:", counts or "空")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    rc = cmd_generate(argparse.Namespace(program=None, force=False))
    rc = cmd_post(args) or rc
    if args.live:
        cmd_metrics(args)  # 指標取得の失敗では定期実行を失敗扱いにしない
    return rc


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="autopost")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("research", help="Claude+Web検索で案件候補を調査")
    r.add_argument("--niche", required=True)
    r.add_argument("--count", type=int, default=3)
    g = sub.add_parser("generate", help="役割別の3投稿を生成してキューへ")
    g.add_argument("--program")
    g.add_argument("--force", action="store_true")
    for name in ("post", "run"):
        s = sub.add_parser(name)
        s.add_argument("--live", action="store_true", help="実際に投稿する(未指定はドライラン)")
    sub.add_parser("metrics", help="投稿の指標を取得し詰まり箇所を診断")
    sub.add_parser("status", help="案件の自動投稿可否とキュー状況")
    args = ap.parse_args(argv)
    return {
        "research": cmd_research, "generate": cmd_generate, "post": cmd_post,
        "metrics": cmd_metrics, "status": cmd_status, "run": cmd_run,
    }[args.cmd](args)
