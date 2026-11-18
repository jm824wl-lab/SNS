"""Claude 呼び出し(案件リサーチと3役割の投稿生成)。

記事のプロンプトをベースに、出力を JSON スキーマで固定して後段で機械処理できるようにしている。
"""

from __future__ import annotations

import json
import os
from typing import Any

import anthropic

from .store import Program

MODEL = os.environ.get("AUTOPOST_MODEL", "claude-opus-5-5")
# 安全性分類で断られた場合に、サーバー側で別モデルへ自動フォールバックさせる
FALLBACK_BETA = "server-side-fallback-2026-07-01"

ROLE_SPEC = {
    1: "Problem-awareness post: open with a concrete question or scene from the reader's workday that "
    "exposes the pain. Do NOT mention any product or brand.",
    2: "Practical post: one small improvement the reader can apply today without buying anything. "
    "Do NOT mention any product or brand.",
    3: "Decision-criteria post: explain how needs differ by situation (e.g. solo vs. team) and when a tool "
    "like {name} is worth checking — and when it is not. You may name {name} here.",
}

POSTS_SCHEMA = {
    "type": "object",
    "properties": {
        "posts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "role": {"type": "integer", "enum": [1, 2, 3]},
                    "text_en": {"type": "string"},
                    "text_ja": {"type": "string"},
                    "facts_to_verify": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["role", "text_en", "text_ja", "facts_to_verify"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["posts"],
    "additionalProperties": False,
}

RESEARCH_SCHEMA = {
    "type": "object",
    "properties": {
        "candidates": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "official_url": {"type": "string"},
                    "affiliate_program_url": {"type": "string"},
                    "target_reader": {"type": "string"},
                    "pain_points": {"type": "array", "items": {"type": "string"}},
                    "pricing": {"type": "string"},
                    "payout_trigger": {"type": "string"},
                    "payout_type": {"type": "string"},
                    "japan_eligible": {"type": "string"},
                    "x_promotion_rules": {"type": "string"},
                    "sources": {"type": "array", "items": {"type": "string"}},
                    "checked_on": {"type": "string"},
                },
                "required": [
                    "name", "official_url", "affiliate_program_url", "target_reader", "pain_points",
                    "pricing", "payout_trigger", "payout_type", "japan_eligible", "x_promotion_rules",
                    "sources", "checked_on",
                ],
                "additionalProperties": False,
            },
        }
    },
    "required": ["candidates"],
    "additionalProperties": False,
}


def _client() -> anthropic.Anthropic:
    return anthropic.Anthropic()


def _call(client: anthropic.Anthropic, **kwargs: Any):
    resp = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=[FALLBACK_BETA],
        fallbacks="default",
        **kwargs,
    )
    if resp.stop_reason == "refusal":
        raise RuntimeError(f"Claude declined the request: {getattr(resp, 'stop_details', None)}")
    return resp


def _json_text(resp) -> dict[str, Any]:
    text = next(b.text for b in resp.content if b.type == "text")
    return json.loads(text)


def research(niche: str, count: int = 3, client: anthropic.Anthropic | None = None) -> dict[str, Any]:
    """記事①: 案件候補と提携前の確認事項を Web 検索で整理する(2段階: 調査→構造化)。"""
    client = client or _client()
    prompt = (
        f"Research {count} affiliate programs for: {niche}.\n"
        "Prioritize official websites and official affiliate terms. For each, report: target users, the "
        "concrete problem it solves, pricing, what triggers a commission, one-time vs. recurring, whether "
        "residents of Japan can join, restrictions on promoting via X (Twitter) / social media, source "
        "URLs and the date checked.\n"
        "If something cannot be confirmed from an official source, write '要確認' — never guess."
    )
    messages: list[dict[str, Any]] = [{"role": "user", "content": prompt}]
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": 15}]
    for _ in range(5):
        resp = _call(client, messages=messages, tools=tools, output_config={"effort": "high"})
        if resp.stop_reason != "pause_turn":
            break
        messages.append({"role": "assistant", "content": resp.content})
    notes = "\n".join(b.text for b in resp.content if b.type == "text")

    structured = _call(
        client,
        messages=[{
            "role": "user",
            "content": "Convert these research notes into the JSON schema. Keep '要確認' wherever the notes "
            "did not confirm a fact; do not add facts that are not in the notes.\n\n" + notes,
        }],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": RESEARCH_SCHEMA}},
    )
    return {"niche": niche, "notes": notes, **_json_text(structured)}


def generate_posts(program: Program, client: anthropic.Anthropic | None = None) -> list[dict[str, Any]]:
    """記事②③: 読者の日常に置き換えたうえで、役割の違う英語投稿を3本作る。"""
    client = client or _client()
    roles = "\n".join(f"{r}. {s.format(name=program.name)}" for r, s in ROLE_SPEC.items())
    used = "You have personally used this product." if program.personally_used else (
        "You have NOT used this product. Never write as if you used it."
    )
    prompt = f"""Write three English X posts for this reader: {program.target_reader}

Product: {program.name}
Reader's everyday problems:
{chr(10).join('- ' + p for p in program.pain_points)}

Verified facts (the ONLY product facts you may state):
{chr(10).join('- ' + f for f in program.verified_facts)}

Roles (one post each):
{roles}

Rules:
- {used}
- Do not invent results, user testimonials, statistics, prices or time savings. Any number must appear
  verbatim in the verified facts.
- No URLs, no hashtags, no "link in bio". The affiliate link and the #ad disclosure are appended by code
  to post 3, so post 3 must be at most 220 characters; posts 1 and 2 at most 260 characters.
- No hype ("guaranteed", "best tool", "passive income"). Plain, specific, helpful.
- Provide a natural Japanese translation in text_ja, and list in facts_to_verify every factual claim a
  human should check before publishing (empty list if none)."""
    resp = _call(
        client,
        messages=[{"role": "user", "content": prompt}],
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": POSTS_SCHEMA}},
    )
    posts = sorted(_json_text(resp)["posts"], key=lambda p: p["role"])
    if [p["role"] for p in posts] != [1, 2, 3]:
        raise ValueError(f"expected roles 1,2,3, got {[p['role'] for p in posts]}")
    return posts
