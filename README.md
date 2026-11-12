# 不動産物件リスト化ツール

業者から届くメール本文・PDFの物件情報を自動で解析し、Webで一覧・検索・詳細閲覧できるようにするツールです。
今回はモックデータ(サンプルメール3件・サンプルPDF1件)で自動取込のパイプラインを実装しています。
本番運用では、メール受信部分を Gmail API 連携に差し替える想定です。

## 構成

- `backend/` — FastAPI + SQLite。メール本文/PDFテキストから物件情報を抽出するルールベースの
  パーサー(`app/parser.py`)と、一覧・検索・詳細・取込のAPIを提供します。
- `frontend/` — React + Vite + TypeScript。物件一覧・検索・詳細ページと、メール本文貼り付け/PDF
  アップロードで自動リスト化を試せる取込デモページを提供します。

## セットアップ

### backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

初回起動時に `app/seed_data/` 内のサンプルメールとサンプルPDF(自動生成)を取り込み、
物件データが自動的に一覧化された状態になります。

### frontend

```bash
cd frontend
npm install
cp .env.example .env   # 必要に応じて VITE_API_BASE を変更
npm run dev
```

`http://localhost:5173` で一覧・検索・詳細ページ、`/ingest` で取込デモを確認できます。

## 会社クライテリアと紹介先マッチング

各社(買主・買取業者)の購入条件を登録しておき、物件ごとに条件に合う会社を自動で判定します。

- `/buyers` — 会社一覧・追加・編集。条件は「物件種別・対象/除外エリア・価格帯(万円)・表面利回り下限・
  築年数上限・構造・土地面積(坪)・駅徒歩・NGワード」。未入力の条件は判定に使いません。
  エリアは「港区」「横浜市」のような所在地の部分一致に加え、「東京23区」「城南」「一都三県」等のまとめ指定が可能です。
- `/buyers/:id` — その会社に合う取込済み物件の一覧(新着順)
- `/match` — 物件情報のテキストを貼り付けて、紹介候補の会社を表示(物件一覧には登録しません)
- 物件詳細ページ — 「紹介先の会社」欄に候補を表示

判定は条件ごとに ○適合 / ×不適合 / ?判定不能(物件側の情報不足) の3値で行い、結果を次の4段階で表示します。

| 判定 | 意味 |
| --- | --- |
| 条件に合致 | 全条件が適合 |
| 要確認(情報不足) | 不適合はないが、物件情報が足りず判定できない条件がある |
| 1条件のみ不適合 | 価格交渉や条件緩和の余地を確認する価値がある「惜しい」会社 |
| 対象外 | 2条件以上が不適合 |

業者ごとの表記ゆれ(「一棟収益（マンション）」「平成2年」「4.00％」等)は `app/normalize.py` で
種別カテゴリ・数値へ正規化してから照合します(`app/matching.py`)。
会社データは git 管理下の `backend/data/buyers.json` に保存されます(コンテナ再起動後も残るよう、編集後はコミットしてください)。
初期状態の「【サンプル】」の会社は動作確認用の架空データのため、実際の会社・条件に置き換えてください。

## API概要

- `GET /api/properties` — 一覧・検索(`q`, `transaction_type`, `property_type`, `layout`, `min_price`, `max_price`)
- `GET /api/properties/{id}` — 詳細(取込元の生テキストを含む)
- `GET/POST /api/buyers`, `GET/PUT/DELETE /api/buyers/{id}` — 会社クライテリアの管理
- `GET /api/properties/{id}/matches` — 物件に合う会社(紹介優先度順・条件ごとの判定理由つき)
- `GET /api/buyers/{id}/matches` — 会社に合う物件
- `POST /api/match/text` — 物件テキスト(JSON: `raw_text`)を登録せずに照合
- `GET /api/criteria/options` — 種別・構造・エリアのまとめ指定の選択肢
- `POST /api/ingest/email` — メール本文(JSON: `raw_text`)から物件を自動抽出して登録
- `POST /api/ingest/pdf` — PDFファイルをアップロードしてテキスト抽出後、自動登録
- `POST /api/ingest/gmail` — Gmailメッセージ1件(`message_id`, `subject`, `sender`, `raw_text` 等)から物件を自動抽出して登録。`message_id` による重複排除つき
- `POST /api/ingest/gmail/batch` — 1通のメールに複数物件が併記されている場合に、物件ごとに分割して登録

## Gmail連携の仕組み

バックエンド自体はGmail APIの認証情報を持たない設計です。実際の取込は、Claude Code
(Gmail接続済みのエージェントセッション)がGmailを検索・本文取得し、`is_property_listing()`
でセミナー案内や交流会案内などのノイズメールを除外したうえで、`/api/ingest/gmail`
(または複数物件併記メール向けの`/api/ingest/gmail/batch`)へ結果を送信することで実現しています。
実際にユーザーの受信箱から業者メールを取得し、本ツールへ自動登録できることを確認済みです。
