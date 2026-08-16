# ゴールド・トレーダー・ダッシュボード

金(ゴールド)トレーダー向けに、日々のトレードに必要な市場データ・ニュース・価格情報を
一画面で一覧できるダッシュボードです。

## 主な機能

- **主要マーケットデータ**: 金・銀のスポット価格、国内金価格(円/g)、ドル円、ドルインデックス、
  米10年国債利回り、WTI原油、S&P500 をカード形式で一覧表示。各カードに前日比・騰落率・
  ミニチャート(スパークライン)付き
- **金価格チャート**: 1日/1週間/1カ月/3カ月/1年の期間切り替え、カーソルを合わせると
  日時・価格をツールチップ表示。表形式表示への切り替えも可能
- **マーケットニュース**: 金相場に関連するニュースを重要度・関連銘柄タグ付きで一覧表示
- **経済指標カレンダー**: FOMC・米雇用統計・CPIなど、金相場への影響が大きい経済指標の
  発表予定を重要度・前回値・予想値・金相場への影響メモ付きで一覧表示
- 15秒ごとに価格を自動更新(手動更新ボタンあり)

## 構成

- `backend/` — FastAPI。`/api/prices`, `/api/prices/{symbol}/history`, `/api/news`,
  `/api/calendar` を提供
- `frontend/` — React + Vite + TypeScript。SVGで自作したチャート(クロスヘア・ツールチップ・
  表形式トグル付き)とダッシュボードUI

## セットアップ

### backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### frontend

```bash
cd frontend
npm install
cp .env.example .env   # 必要に応じて VITE_API_BASE を変更
npm run dev
```

`http://localhost:5173` でダッシュボードを確認できます。

## データについて

価格・ニュース・経済指標は全てサンプル(モック)データです。価格はリアルな水準を基準に
ランダムウォークでそれっぽく変動させているだけで、実際の相場ではありません。
本番運用では以下の置き換えを想定しています。

- 価格: `backend/app/instruments.py` の `get_quote` / `history` を、実際の相場データAPI
  (例: 各種金融データベンダーのREST/WebSocket API)からの取得に置き換える
- ニュース: `backend/app/news_data.py` を、ニュースAPI(または RSS/スクレイピング)からの
  取得に置き換える
- 経済指標カレンダー: `backend/app/calendar_data.py` を、経済指標カレンダーAPIからの取得に
  置き換える

## API概要

- `GET /api/prices` — 主要銘柄の現在値一覧(価格・前日比・騰落率など)
- `GET /api/prices/{symbol}/history?range=1D|1W|1M|3M|1Y` — 指定銘柄の価格推移
- `GET /api/news` — マーケットニュース一覧
- `GET /api/calendar` — 経済指標カレンダー一覧
