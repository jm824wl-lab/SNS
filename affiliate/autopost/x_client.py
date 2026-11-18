"""X API v2 クライアント(OAuth 1.0a ユーザーコンテキスト、標準ライブラリのみ)。

OAuth 1.0a のアクセストークンは失効しないため、無人の定期実行(GitHub Actions)に向く。
OAuth 2.0 のユーザートークンは2時間で失効し、リフレッシュ処理が別途必要になる。
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

API_BASE = "https://api.x.com/2"
ENV_KEYS = ("X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET")


def _pct(s: str) -> str:
    return urllib.parse.quote(str(s), safe="-._~")


def oauth1_header(
    method: str,
    url: str,
    consumer_key: str,
    consumer_secret: str,
    token: str,
    token_secret: str,
    params: dict[str, str] | None = None,
    nonce: str | None = None,
    timestamp: str | None = None,
) -> str:
    """RFC 5849 の HMAC-SHA1 署名付き Authorization ヘッダーを作る。

    JSON ボディは署名対象に含めない(フォーム/クエリのパラメータのみ)。
    """
    oauth = {
        "oauth_consumer_key": consumer_key,
        "oauth_nonce": nonce or secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": timestamp or str(int(time.time())),
        "oauth_token": token,
        "oauth_version": "1.0",
    }
    split = urllib.parse.urlsplit(url)
    base_url = f"{split.scheme}://{split.netloc}{split.path}"
    all_params = dict(urllib.parse.parse_qsl(split.query))
    all_params.update(params or {})
    all_params.update(oauth)
    # キー・値をエンコードしてから辞書順に並べる(RFC 5849 §3.4.1.3.2)
    pairs = sorted((_pct(k), _pct(v)) for k, v in all_params.items())
    param_str = "&".join(f"{k}={v}" for k, v in pairs)
    base = "&".join([method.upper(), _pct(base_url), _pct(param_str)])
    key = f"{_pct(consumer_secret)}&{_pct(token_secret)}"
    sig = base64.b64encode(hmac.new(key.encode(), base.encode(), hashlib.sha1).digest()).decode()
    oauth["oauth_signature"] = sig
    return "OAuth " + ", ".join(f'{_pct(k)}="{_pct(v)}"' for k, v in sorted(oauth.items()))


class XApiError(RuntimeError):
    def __init__(self, status: int, body: str):
        super().__init__(f"X API {status}: {body[:500]}")
        self.status = status
        self.body = body


@dataclass
class XClient:
    consumer_key: str
    consumer_secret: str
    token: str
    token_secret: str

    @classmethod
    def from_env(cls) -> "XClient | None":
        vals = [os.environ.get(k, "") for k in ENV_KEYS]
        if not all(vals):
            return None
        return cls(*vals)

    def _request(self, method: str, path: str, query: dict[str, str] | None = None, body: Any = None) -> Any:
        url = f"{API_BASE}{path}"
        if query:
            url += "?" + urllib.parse.urlencode(query)
        headers = {
            "Authorization": oauth1_header(
                method, url, self.consumer_key, self.consumer_secret, self.token, self.token_secret
            ),
            "User-Agent": "affiliate-autopost/1.0",
        }
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as e:
            raise XApiError(e.code, e.read().decode(errors="replace")) from e

    def create_post(self, text: str) -> str:
        res = self._request("POST", "/tweets", body={"text": text})
        return res["data"]["id"]

    def get_metrics(self, ids: list[str]) -> dict[str, dict[str, int]]:
        """投稿ごとの指標。non_public_metrics(リンククリック数)は自分の投稿・30日以内のみ取得可。"""
        out: dict[str, dict[str, int]] = {}
        for i in range(0, len(ids), 100):
            chunk = ids[i : i + 100]
            try:
                res = self._request(
                    "GET",
                    "/tweets",
                    {"ids": ",".join(chunk), "tweet.fields": "public_metrics,non_public_metrics"},
                )
            except XApiError:
                res = self._request("GET", "/tweets", {"ids": ",".join(chunk), "tweet.fields": "public_metrics"})
            for t in res.get("data", []):
                m = dict(t.get("public_metrics", {}))
                m.update(t.get("non_public_metrics", {}))
                out[t["id"]] = m
        return out
