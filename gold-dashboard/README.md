# ゴールド・トレーダー・ダッシュボード

金(ゴールド)トレーダー向けに、日々のトレードに必要な市場データ・ニュース・価格情報を
一画面で一覧できるダッシュボードです。

## 主な機能

- **主要マーケットデータ**: 金・銀の先物価格、国内金価格(円/g)、ドル円、ドルインデックス、
  米10年国債利回り、WTI原油、S&P500、日経平均先物、NYダウ先物 をカード形式で一覧表示。
  各カードに前日比・騰落率・ミニチャート(スパークライン)付き
- **金価格チャート**: 1日/1週間/1カ月/3カ月/1年の期間切り替え、カーソルを合わせると
  日時・価格をツールチップ表示。表形式表示への切り替えも可能
- **マーケットニュース**: 金相場に関連するニュースを重要度・関連銘柄タグ付きで一覧表示
- **経済指標カレンダー**: FOMC・米雇用統計・CPIなど、金相場への影響が大きい経済指標の
  発表予定を重要度・発表日・金相場への影響メモ付きで一覧表示
- 15秒ごとに価格を自動更新(手動更新ボタンあり)

## データソース

全て実データを取得します(登録不要のものと、無料APIキーが必要なものがあります)。

| データ | 取得元 | 登録 |
|---|---|---|
| 価格(現在値・チャート) | [Yahoo Finance](https://finance.yahoo.com/)(`yfinance`ライブラリ経由・非公式) | 不要 |
| マーケットニュース | [Google News RSS検索](https://news.google.com/) | 不要 |
| 経済指標カレンダー | [FRED](https://fred.stlouisfed.org/)(セントルイス連銀 公式API) | 無料APIキーが必要 |

**注意点**

- 価格取得(`yfinance`)はYahoo Financeの非公式な内部エンドポイントを利用しています。
  Yahoo側の仕様変更で将来動かなくなる可能性があります
- 金・銀は**先物(COMEX、GC=F/SI=F)**の価格です。Yahoo Financeには金・銀の現物スポット
  価格のティッカーが存在せず、Stooq・goldprice.orgなど無料の現物価格ソースも自動アクセスを
  ブロックしていて取得できませんでした。先物は現物よりおおむね1%前後高く出る傾向があります
  (コンタンゴ)。FX/CFD業者の現物スポット表示と見比べる際はご注意ください
- ニュースは見出しをキーワードで簡易分類しているだけで、重要度・関連銘柄タグは
  厳密な編集判断ではありません
- 経済指標カレンダーはFREDから実際の発表日を取得しますが、FREDは統計データの公式APIであり
  「予想値」を提供していないため、予想値・前回値欄は表示されません(発表日・重要度・
  金相場への影響メモのみ)

## 構成

- `backend/` — FastAPI。`/api/prices`, `/api/prices/{symbol}/history`, `/api/news`,
  `/api/calendar` を提供
- `frontend/` — React + Vite + TypeScript。SVGで自作したチャート(クロスヘア・ツールチップ・
  表形式トグル付き)とダッシュボードUI

## セットアップ

### 1. FRED APIキーを取得(経済指標カレンダーに必要)

1. https://fred.stlouisfed.org/docs/api/api_key.html にアクセスし、無料アカウントを作成
2. APIキーを発行(数分で完了・無料)

### 2. backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate      # Windowsは venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env          # .env を編集して FRED_API_KEY=取得したキー を設定
uvicorn app.main:app --reload --port 8000
```

FRED_API_KEYが未設定の場合、`/api/calendar` はエラーメッセージ付きで失敗します
(価格・ニュースは影響を受けません)。

### 3. frontend

```bash
cd frontend
npm install
cp .env.example .env   # 必要に応じて VITE_API_BASE を変更
npm run dev
```

`http://localhost:5173` でダッシュボードを確認できます。

## API概要

- `GET /api/prices` — 主要銘柄の現在値一覧(価格・前日比・騰落率など)
- `GET /api/prices/{symbol}/history?range=1D|1W|1M|3M|1Y` — 指定銘柄の価格推移
- `GET /api/news` — マーケットニュース一覧
- `GET /api/calendar` — 経済指標カレンダー一覧
