from datetime import date, datetime, timedelta, timezone

import pytest

from autopost import cli, guard, store
from autopost.store import Program
from autopost.x_client import oauth1_header


def make_program(**kw) -> Program:
    base = dict(
        id="p1",
        name="AcmeCRM",
        target_reader="small service businesses",
        pain_points=["missed follow-ups"],
        official_url="https://acme.test",
        link_url="https://acme.test/?ref=abc",
        japan_eligible=True,
        x_promotion_allowed=True,
        verified=True,
        verified_at=date.today().isoformat(),
        verified_facts=["Free plan available", "Paid plan starts at $15 per user per month"],
    )
    base.update(kw)
    return Program(**base)


# --- OAuth 1.0a: X 公式ドキュメント "Creating a signature" の検証ベクトル ---
def test_oauth1_signature_matches_x_docs_vector():
    header = oauth1_header(
        "POST",
        "https://api.twitter.com/1.1/statuses/update.json?include_entities=true",
        "xvz1evFS4wEEPTGEFPHBog",
        "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
        "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
        "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
        params={"status": "Hello Ladies + Gentlemen, a signed OAuth request!"},
        nonce="kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
        timestamp="1318622958",
    )
    assert 'oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"' in header


# --- 自動投稿の可否 ---
def test_sample_program_is_blocked():
    sample = store.load_programs()[0]
    blockers = sample.autopost_blockers()
    assert any("verified" in b for b in blockers)
    assert any("link_url" in b for b in blockers)


def test_stale_verification_blocks():
    old = (date.today() - timedelta(days=120)).isoformat()
    assert any("経過" in b for b in make_program(verified_at=old).autopost_blockers())
    assert make_program().autopost_blockers() == []


# --- ガード ---
def test_link_and_disclosure_added_only_to_role3():
    p = make_program()
    assert guard.compose_final_text("tip", 2, p) == "tip"
    final = guard.compose_final_text("criteria", 3, p)
    assert final.endswith("https://acme.test/?ref=abc #ad")


@pytest.mark.parametrize(
    "body,role,expected",
    [
        ("Check https://foo.com now", 3, "URL"),
        ("AcmeCRM fixes this", 1, "商品名"),
        ("Guaranteed to double sales", 2, "保証"),
        ("I've been using it for months", 3, "一人称"),
        ("Teams save 40% of admin time", 2, "数値主張"),
        ("x" * 300, 1, "文字数"),
    ],
)
def test_guard_rejects(body, role, expected):
    probs = guard.check_post(body, role, make_program(), set())
    assert any(expected in p for p in probs), probs


def test_guard_accepts_verified_number_and_clean_text():
    body = ("Working solo with a few clients? A spreadsheet may be enough. Sharing history across a team? "
            "AcmeCRM is worth a look: paid plan starts at $15 per user per month.")
    assert guard.check_post(body, 3, make_program(), set()) == []


def test_guard_rejects_duplicate():
    p = make_program()
    hist = guard.history_set(["How do you track who needs a follow-up?"])
    assert any("重複" in x for x in guard.check_post("How do you track who needs a follow-up?", 1, p, hist))


def test_weighted_length_counts_url_as_23_and_cjk_as_2():
    assert guard.weighted_length("https://example.com/very/long/path?x=1") == 23
    assert guard.weighted_length("あい") == 4


# --- スケジューリング ---
def _item(batch, role, status, posted_at=None):
    return {"batch": batch, "role": role, "status": status, "created_at": "2026-01-01T00:00:00+00:00",
            "posted_at": posted_at, "id": f"{batch}-{role}"}


def test_next_due_respects_order_and_gap():
    now = datetime(2026, 1, 2, 12, tzinfo=timezone.utc)
    recent = (now - timedelta(hours=5)).isoformat()
    old = (now - timedelta(hours=30)).isoformat()
    q = [_item("a", 1, "posted", recent), _item("a", 2, "ready"), _item("a", 3, "ready")]
    assert cli._next_due(q, now) is None
    q[0]["posted_at"] = old
    assert cli._next_due(q, now)["role"] == 2
    q2 = [_item("b", 1, "ready"), _item("b", 2, "rejected"), _item("b", 3, "ready")]
    assert cli._next_due(q2, now) is None


def test_diagnose():
    assert "テーマ" in cli.diagnose(1, {"impression_count": 10}, 0)
    assert "紹介理由" in cli.diagnose(3, {"impression_count": 5000, "url_link_clicks": 2}, 0)
    assert "相性" in cli.diagnose(3, {"impression_count": 5000, "url_link_clicks": 80}, 0)


# --- 生成→投稿の一連の流れ(Claude と X API はモック) ---
def test_generate_then_post_flow(tmp_path, monkeypatch):
    import autopost.llm as llm

    p = make_program()
    monkeypatch.setattr(cli, "load_programs", lambda: [p])
    qpath = tmp_path / "queue.json"
    monkeypatch.setattr(cli, "load_queue", lambda: store.load_json(qpath, []))
    monkeypatch.setattr(cli, "save_queue", lambda q: store.save_json(qpath, q))
    monkeypatch.setattr(llm, "generate_posts", lambda prog: [
        {"role": 1, "text_en": "After you send a quote, how do you track who needs a follow-up?",
         "text_ja": "…", "facts_to_verify": []},
        {"role": 2, "text_en": "Today: list each client's last contact date, next action and deadline.",
         "text_ja": "…", "facts_to_verify": []},
        {"role": 3, "text_en": "Solo with a few clients? A sheet works. Team sharing history? AcmeCRM is "
         "worth checking.", "text_ja": "…", "facts_to_verify": []},
    ])
    sent = []

    class FakeX:
        def create_post(self, text):
            sent.append(text)
            return str(len(sent))

    monkeypatch.setattr(cli.XClient, "from_env", classmethod(lambda cls: FakeX()))

    import argparse
    assert cli.cmd_generate(argparse.Namespace(program=None, force=False)) == 0
    assert [q["status"] for q in store.load_json(qpath, [])] == ["ready"] * 3
    assert cli.cmd_post(argparse.Namespace(live=True)) == 0
    assert cli.cmd_post(argparse.Namespace(live=True)) == 0  # 20時間未満なので2本目は出ない
    assert len(sent) == 1 and "#ad" not in sent[0]
