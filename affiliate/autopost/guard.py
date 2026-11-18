"""投稿前の機械チェック(人の最終確認の代わりになる安全柵)。

記事の注意点「未使用の商品を使ったように書かない」「成果・利用者の声・数値を
創作しない」「紹介関係を明記する」をルールとして強制する。
"""

from __future__ import annotations

import re

from .store import Program

MAX_WEIGHTED_LEN = 280
URL_WEIGHT = 23  # X は URL を長さに関係なく23文字として数える
DISCLOSURE = "#ad"

URL_RE = re.compile(r"https?://\S+|\bwww\.\S+|\b[\w-]+\.(?:com|io|co|net|org|app)\b", re.I)

# 誇大・保証・収益訴求・なりすまし体験談
BANNED_PATTERNS = [
    (r"\bguarantee(d|s)?\b", "成果の保証表現"),
    (r"\b(passive income|get rich|make money fast|risk[- ]free)\b", "収益・誇大訴求"),
    (r"\b(best|#1|number one) (tool|app|software|crm)\b", "根拠のない最上級表現"),
    (r"\b(my|our) (clients?|customers?) (love|say)\b", "利用者の声の創作の疑い"),
    (r"\b(testimonial|reviews? say)\b", "利用者の声の創作の疑い"),
]
FIRST_PERSON_USE = re.compile(
    r"\b(I(?:'ve| have)? (?:been )?(?:use[ds]?|using|tried|switched)|we (?:use|switched))\b", re.I
)
# 数値主張: 金額・割合・倍率・「N時間節約」など
NUMERIC_CLAIM = re.compile(
    r"(\$\s?\d[\d,.]*|\d[\d,.]*\s?%|\d+x\b|\b\d+\s?(?:hours?|hrs?|minutes?|days?)\s+(?:saved|faster)\b)",
    re.I,
)


def weighted_length(text: str) -> int:
    """X の文字数カウント(URL=23、CJK等=2)の近似実装。"""
    total = 0
    pos = 0
    for m in URL_RE.finditer(text):
        total += _weigh(text[pos : m.start()]) + URL_WEIGHT
        pos = m.end()
    return total + _weigh(text[pos:])


def _weigh(s: str) -> int:
    n = 0
    for ch in s:
        cp = ord(ch)
        light = cp <= 0x10FF or 0x2000 <= cp <= 0x200D or 0x2010 <= cp <= 0x201F or 0x2032 <= cp <= 0x2037
        n += 1 if light else 2
    return n


def compose_final_text(body: str, role: int, program: Program) -> str:
    """LLM本文に、リンクとPR表記をコード側で付与する(役割3のみ)。"""
    body = body.strip()
    if role != 3:
        return body
    return f"{body}\n\n{program.link_url} {DISCLOSURE}"


def check_post(body: str, role: int, program: Program, history: set[str]) -> list[str]:
    """問題点のリストを返す(空なら投稿可)。body は LLM が書いた本文(リンク付与前)。"""
    problems: list[str] = []
    final = compose_final_text(body, role, program)

    if URL_RE.search(body):
        problems.append("本文にURLが含まれる(リンクはコード側でのみ付与する)")
    if weighted_length(final) > MAX_WEIGHTED_LEN:
        problems.append(f"文字数超過({weighted_length(final)}/{MAX_WEIGHTED_LEN})")
    if role != 3 and program.name.lower() in body.lower():
        problems.append("役割1・2で商品名を出している(記事の順序:商品名は3本目で初めて)")
    if role == 3 and DISCLOSURE not in final:
        problems.append("PR表記がない")

    for pat, label in BANNED_PATTERNS:
        if re.search(pat, body, re.I):
            problems.append(f"禁止表現: {label}")
    if not program.personally_used and FIRST_PERSON_USE.search(body):
        problems.append("未使用の商品を使ったような一人称表現")

    facts_blob = " ".join(program.verified_facts).lower()
    for m in NUMERIC_CLAIM.finditer(body):
        token = m.group(0).strip().lower()
        if token not in facts_blob:
            problems.append(f"確認済み事実にない数値主張: {m.group(0)!r}")

    if _normalize(final) in history:
        problems.append("過去投稿と重複")
    return problems


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def history_set(texts: list[str]) -> set[str]:
    return {_normalize(t) for t in texts}
