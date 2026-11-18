# Claude × 海外アフィリエイト X自動投稿

「案件を調べる → 読者の悩みを整理する → 役割の違う3投稿を作る → 数字で詰まりを見る」という流れを、
Claude API と X API で自動化するツールです。投稿の生成から X への投稿までを、GitHub Actions が毎日自動で実行します。

## 仕組み

| 段階 | コマンド | 内容 |
|---|---|---|
| ① 案件調査 | `research` | Claude と Web検索で候補案件を調べ、`research/` に保存します。確認できない項目は「要確認」になります。 |
| ②③ 投稿生成 | `generate` | 確認済みの案件ごとに英語投稿3本(①悩みへの気づき ②今日できる改善 ③選ぶ基準)を作り、日本語訳を付けます。 |
| 安全チェック | (自動) | PR表記、文字数、誇大表現、未使用なのに使ったような表現、確認済み事実にない数値、重複を検査します。1本でも不合格なら3本とも保留します。 |
| 投稿 | `post --live` | 1回の実行で1本まで投稿します。同じ案件の①→②→③は20時間以上の間隔を空けます。リンクと `#ad` は③にだけ、コード側で付けます。 |
| 改善 | `metrics` | 表示数・リンククリック数・成約数から「テーマ/紹介理由/相性」のどこで詰まっているかを判定します。 |

## 自動投稿が始まる条件(安全柵)

`programs.json` の案件が次の条件をすべて満たすまで、その案件は投稿されません。

- `verified: true`(公式の提携規約を自分で確認済み)
- `japan_eligible: true`、`x_promotion_allowed: true`
- `link_url` に実際のアフィリエイトリンクが入っている
- `verified_facts` に、投稿で使ってよい確認済み事実が入っている(料金・機能など)
- `verified_at` が90日以内(規約が変わることがあるため、定期的に再確認して日付を更新します)

`python -m autopost status` で、各案件が停止中である理由を確認できます。

## はじめ方

1. **ASPに登録する**(海外案件の例: Impact、PartnerStack、CJ Affiliate、ShareASale など)。Xからの集客と日本在住での参加が認められているかを確認します。
2. **案件を調べる**
   ```bash
   cd affiliate && pip install -r requirements.txt
   ```
   ```bash
   ANTHROPIC_API_KEY=... python -m autopost research --niche "CRM for small service businesses"
   ```
3. **`programs.json` を記入する**: サンプルを参考に、提携した案件を記入し、`verified: true` にします。
4. **ドライランで確認する**: `python -m autopost run` を実行すると、投稿予定の本文が表示されるだけで、Xには送信されません。
5. **X API の準備**: developer.x.com でアプリを作成し、権限を Read and Write にして、OAuth 1.0a のキーとトークンを発行します。
6. **GitHub に登録する**(Settings → Secrets and variables → Actions)
   - Secrets: `ANTHROPIC_API_KEY`、`X_API_KEY`、`X_API_SECRET`、`X_ACCESS_TOKEN`、`X_ACCESS_TOKEN_SECRET`
   - Variables: `AUTOPOST_LIVE` = `true`(この変数を設定したときだけ実際に投稿されます)
7. ワークフローをデフォルトブランチにマージすると、毎日 14:07 UTC に自動実行されます。

成約数は、ASPの管理画面の数値を `programs.json` の `conversions` に入力すると、診断に反映されます。

## 注意

- 投稿には `#ad` を自動で付けます。英語圏の読者向けには FTC のガイドラインに沿った表記です。日本向けに投稿する場合は、ステマ規制(景品表示法)に合わせて「広告」「PR」などの表記も検討してください。
- X の自動化ルール(重複投稿・スパム的な連投の禁止)に配慮し、1日1本、重複検知、案件ごとの投稿間隔を設けています。上限を上げる場合は X の規約を確認してください。
- モデルの既定は `claude-opus-5-5` です(環境変数 `AUTOPOST_MODEL` で変更できます)。安全性の判定で応答が拒否された場合は、サーバー側のフォールバック機能で別モデルに自動で切り替わります。
