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

## API概要

- `GET /api/properties` — 一覧・検索(`q`, `transaction_type`, `property_type`, `layout`, `min_price`, `max_price`)
- `GET /api/properties/{id}` — 詳細(取込元の生テキストを含む)
- `POST /api/ingest/email` — メール本文(JSON: `raw_text`)から物件を自動抽出して登録
- `POST /api/ingest/pdf` — PDFファイルをアップロードしてテキスト抽出後、自動登録
